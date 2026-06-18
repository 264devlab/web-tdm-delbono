import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, Preference, MerchantOrder } from 'mercadopago';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('[Webhook] MP_ACCESS_TOKEN no configurado');
    return res.status(500).send('Internal Server Error');
  }

  try {
    const mpClient = new MercadoPagoConfig({ accessToken: token });

    let type = req.query.topic || req.query.type;
    let paymentId = req.query.id || req.query['data.id'];

    if (req.body) {
      type = type || req.body.type || req.body.topic || req.body.action;
      if (req.body.data && req.body.data.id) {
        paymentId = paymentId || req.body.data.id;
      }
    }

    if (type !== 'payment' && type !== 'payment.created' && type !== 'payment.updated') {
      return res.status(200).send('OK - Not a payment event');
    }

    if (!paymentId) {
      return res.status(400).send('Missing payment id');
    }

    const payment = new Payment(mpClient);
    const paymentInfo = await payment.get({ id: paymentId });

    if (paymentInfo.status !== 'approved') {
      return res.status(200).send('Payment not approved yet');
    }

    // Verificamos si ya existe la reserva en Supabase
    const { data: existingBookings, error: checkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);

    if (checkErr) throw checkErr;
    if (existingBookings && existingBookings.length > 0) {
      return res.status(200).send('Already processed');
    }

    // Buscar metadata desde Preference o Payment
    let metadata = null;
    let preferenceId = null;

    if (paymentInfo.order && paymentInfo.order.id) {
      try {
        const order = new MerchantOrder(mpClient);
        const orderInfo = await order.get({ merchantOrderId: paymentInfo.order.id });
        preferenceId = orderInfo.preference_id;
      } catch (e) {
        console.warn('[Webhook] No se pudo obtener la MerchantOrder:', e.message);
      }
    }

    if (preferenceId) {
      try {
        const preference = new Preference(mpClient);
        const prefResult = await preference.get({ preferenceId });
        metadata = prefResult.metadata;
      } catch (e) {
        console.warn('[Webhook] No se pudo obtener la Preference:', e.message);
      }
    }

    // Fallback: usar el external_reference si es un bookingId o metadata del pago
    if (!metadata) {
       metadata = paymentInfo.metadata;
    }

    // Si ya era una reserva existente (re-pago)
    if (!metadata && paymentInfo.external_reference && paymentInfo.external_reference !== 'draft') {
        const bookingId = paymentInfo.external_reference;
        const { error: updErr } = await supabase
          .from('bookings')
          .update({ status: 'CONFIRMED', payment_id: paymentId })
          .eq('id', bookingId);
          
        if (updErr) throw updErr;
        return res.status(200).send('Booking confirmed via external_reference');
    }

    if (!metadata || !metadata.client_email) {
      console.error('[Webhook] No se encontraron metadatos suficientes para el pago', paymentId);
      return res.status(200).send('No metadata found to create booking');
    }

    // Crear cliente y reserva
    const {
      client_email,
      client_first_name,
      client_last_name,
      client_phone,
      service_id,
      booking_date,
      booking_time,
      booking_quantity,
      deposit_amount
    } = metadata;

    let clientId = '';
    const { data: clients, error: clientFindErr } = await supabase
      .from('clients')
      .select('id')
      .eq('email', client_email);

    if (clientFindErr) throw clientFindErr;

    if (clients && clients.length > 0) {
      clientId = clients[0].id;
      await supabase
        .from('clients')
        .update({
          first_name: client_first_name,
          last_name: client_last_name,
          phone: client_phone
        })
        .eq('id', clientId);
    } else {
      const { data: newClient, error: clientCreateErr } = await supabase
        .from('clients')
        .insert({
          email: client_email,
          first_name: client_first_name,
          last_name: client_last_name,
          phone: client_phone
        })
        .select();

      if (clientCreateErr) throw clientCreateErr;
      clientId = newClient[0].id;
    }

    const { data: services, error: serviceErr } = await supabase
      .from('services')
      .select('estimated_duration_minutes')
      .eq('id', service_id);

    if (serviceErr || !services || services.length === 0) {
      throw new Error('Servicio no encontrado');
    }
    const duration = services[0].estimated_duration_minutes;

    const depositAmountTotal = Number(deposit_amount) * Number(booking_quantity);
    const { data: newBooking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        client_id: clientId,
        service_id: service_id,
        booking_date: booking_date,
        booking_time: booking_time.includes(':') && booking_time.split(':').length === 2 ? `${booking_time}:00` : booking_time,
        duration: duration,
        deposit_amount: depositAmountTotal,
        payment_id: paymentId,
        status: 'CONFIRMED',
        notes: `Reserva online de ${client_first_name} ${client_last_name}`,
        quantity: Number(booking_quantity)
      })
      .select();

    if (bookingErr) throw bookingErr;

    console.log(`[Webhook] Reserva creada exitosamente (Booking ID: ${newBooking[0].id}) por pago ${paymentId}`);
    return res.status(200).send('Booking created successfully');

  } catch (err) {
    console.error('[Webhook] Error general:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
