import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, Preference, MerchantOrder } from 'mercadopago';
import { generateEmailHtml, generateWhatsAppMessage } from '../lib/notificationsTemplate.js';

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

    // Para evitar duplicados por colisión de webhooks concurrentes de MP (created vs updated)
    // Retrasamos el 'payment.updated' 2 segundos.
    if (type === 'payment.updated' || req.body?.action === 'payment.updated') {
      await new Promise(resolve => setTimeout(resolve, 2000));
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
    // Buscamos por teléfono en lugar de correo, ya que el teléfono es único por persona y el frontend usa el teléfono.
    const { data: clients, error: clientFindErr } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', client_phone);

    if (clientFindErr) throw clientFindErr;

    if (clients && clients.length > 0) {
      clientId = clients[0].id;
      await supabase
        .from('clients')
        .update({
          first_name: client_first_name,
          last_name: client_last_name,
          email: client_email
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

    // Doble verificación justo antes de insertar para mitigar race conditions extremas
    const { data: doubleCheck } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);
      
    if (doubleCheck && doubleCheck.length > 0) {
      console.log(`[Webhook] Reserva doble detectada y evitada para el pago ${paymentId}`);
      return res.status(200).send('Already processed (double check)');
    }

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
    const createdBookingId = newBooking[0].id;
    console.log(`[Webhook] Reserva creada exitosamente (Booking ID: ${createdBookingId}) por pago ${paymentId}`);

    // --- ENVIAR NOTIFICACIONES DESDE EL WEBHOOK ---
    try {
      const { data: settingsData } = await supabase.from('business_settings').select('*').limit(1);
      const settings = (settingsData && settingsData.length > 0) ? settingsData[0] : { business_name: 'Negocio' };

      const payload = {
        toEmail: client_email,
        toPhone: client_phone,
        clientName: `${client_first_name} ${client_last_name}`,
        serviceName: metadata.service_name || 'Servicio',
        date: booking_date,
        time: booking_time,
        depositAmount: depositAmountTotal,
        bookingId: createdBookingId,
        quantity: Number(booking_quantity),
        remainingAmount: metadata.service_price !== undefined ? (Number(metadata.service_price) * Number(booking_quantity)) - depositAmountTotal : undefined
      };

      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY && client_email) {
        const EMAIL_FROM = process.env.EMAIL_FROM || 'Notificaciones <onboarding@resend.dev>';
        let emailFrom = EMAIL_FROM;
        if (settings.business_name) {
          const emailMatch = EMAIL_FROM.match(/<(.+)>/) || [null, EMAIL_FROM];
          emailFrom = `${settings.business_name} <${(emailMatch[1] || EMAIL_FROM).trim()}>`;
        }

        const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
        const emailHtml = generateEmailHtml('CONFIRMATION', payload, settings, originUrl);
        
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [client_email],
            subject: `Confirmación de Turno - ${settings.business_name}`,
            html: emailHtml
          })
        }).then(res => res.json()).then(data => {
          if (data.id) console.log(`[Webhook] Correo enviado: ${data.id}`);
          else console.warn(`[Webhook] Falló envío de correo:`, data);
        }).catch(e => console.warn('[Webhook] Error red correo:', e.message));
      }

      const WA_SERVER_URL = process.env.VITE_WA_SERVER_URL || process.env.WA_SERVER_URL;
      const WA_API_KEY = process.env.WA_API_KEY || process.env.VITE_WA_API_KEY;
      if (WA_SERVER_URL && client_phone) {
        const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
        const waMsg = generateWhatsAppMessage('CONFIRMATION', payload, settings, originUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (WA_API_KEY) headers['x-api-key'] = WA_API_KEY;

        await fetch(`${WA_SERVER_URL}/api/wa/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ phone: client_phone, message: waMsg })
        }).catch(e => console.warn('[Webhook] Servidor WA no disponible:', e.message));
      }
    } catch (notifErr) {
      console.error('[Webhook] Error enviando notificaciones:', notifErr.message);
    }

    return res.status(200).send('Booking created successfully');

  } catch (err) {
    console.error('[Webhook] Error general:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
