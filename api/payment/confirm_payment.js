import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Preference } from 'mercadopago';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Validate API Key if configured
  const WA_API_KEY = process.env.WA_API_KEY;
  if (WA_API_KEY) {
    const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
    if (incomingKey !== WA_API_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  const { preferenceId, paymentId } = req.body || {};

  if (!preferenceId || !paymentId) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: preferenceId, paymentId' });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('[Vercel Serverless Confirm] MP_ACCESS_TOKEN no está configurado en las variables de entorno de Vercel.');
    return res.status(500).json({
      success: false,
      error: 'Mercado Pago Access Token no configurado en Vercel (MP_ACCESS_TOKEN). Por favor agrégalo en la configuración de tu proyecto en Vercel.'
    });
  }

  try {
    // 1. Check if booking already exists with this payment_id
    const { data: existingBookings, error: checkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);

    if (checkErr) throw checkErr;
    if (existingBookings && existingBookings.length > 0) {
      return res.status(200).json({ success: true, bookingId: existingBookings[0].id, alreadyProcessed: true });
    }

    // 2. Fetch preference from Mercado Pago
    const mpClient = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(mpClient);
    const prefResult = await preference.get({ preferenceId });

    if (!prefResult || !prefResult.metadata) {
      throw new Error('No se encontraron los metadatos de la preferencia de pago.');
    }

    const metadata = prefResult.metadata;
    const {
      client_email,
      client_first_name,
      client_last_name,
      client_phone,
      service_id,
      service_name,
      service_price,
      deposit_amount,
      booking_date,
      booking_time,
      booking_quantity
    } = metadata;

    // 3. Find or Create Client
    let clientId = '';
    const { data: clients, error: clientFindErr } = await supabase
      .from('clients')
      .select('id')
      .eq('email', client_email);

    if (clientFindErr) throw clientFindErr;

    if (clients && clients.length > 0) {
      clientId = clients[0].id;
      // Update details if needed
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

    // 4. Fetch service duration
    const { data: services, error: serviceErr } = await supabase
      .from('services')
      .select('estimated_duration_minutes')
      .eq('id', service_id);

    if (serviceErr || !services || services.length === 0) {
      throw new Error('Servicio no encontrado');
    }
    const duration = services[0].estimated_duration_minutes;

    // 5. Insert booking
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

    return res.status(200).json({
      success: true,
      bookingId: newBooking[0].id,
      metadata
    });
  } catch (err) {
    console.error('[Vercel Serverless Confirm] Error al confirmar pago:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
