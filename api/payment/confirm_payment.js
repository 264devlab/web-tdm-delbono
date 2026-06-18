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
    // Solo consultamos si el webhook ya procesó el pago
    const { data: existingBookings, error: checkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);

    if (checkErr) throw checkErr;
    
    if (existingBookings && existingBookings.length > 0) {
      return res.status(200).json({ success: true, bookingId: existingBookings[0].id });
    }

    // Si aún no está, le decimos al frontend que espere
    return res.status(200).json({ success: false, error: 'pending' });

  } catch (err) {
    console.error('[Vercel Serverless Confirm] Error al consultar pago:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
