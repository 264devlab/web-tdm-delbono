import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
  // Configuración de CORS
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

  // Validar API Key si está configurada en las variables de entorno
  const WA_API_KEY = process.env.WA_API_KEY;
  if (WA_API_KEY) {
    const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
    if (incomingKey !== WA_API_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized: API Key no autorizada.' });
    }
  }

  const {
    title,
    price,
    quantity,
    bookingId,
    clientEmail,
    clientFirstName,
    clientLastName,
    clientPhone,
    serviceId,
    bookingDate,
    bookingTime,
    bookingQuantity,
    servicePrice,
    depositAmount
  } = req.body || {};

  if (!bookingId && (!clientEmail || !clientFirstName || !clientLastName || !clientPhone || !serviceId || !bookingDate || !bookingTime || !bookingQuantity)) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros obligatorios para la creación de preferencia.' });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('[Mercado Pago Vercel] MP_ACCESS_TOKEN no está configurado en las variables de entorno de Vercel.');
    return res.status(500).json({
      success: false,
      error: 'Mercado Pago Access Token no configurado en Vercel (MP_ACCESS_TOKEN). Por favor agrégalo en la configuración de tu proyecto en Vercel.'
    });
  }

  try {
    const mpClient = new MercadoPagoConfig({
      accessToken: token
    });

    const preference = new Preference(mpClient);
    
    let origin = req.headers.origin;
    if (!origin) {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      origin = `${protocol}://${host}`;
    }

    const preferenceBody = {
      items: [
        {
          id: bookingId || serviceId,
          title: title,
          quantity: Number(quantity),
          unit_price: Number(price),
          currency_id: 'ARS'
        }
      ],
      back_urls: {
        success: bookingId
          ? `${origin}/turno/${bookingId}?payment_status=success`
          : `${origin}/pago/confirmacion?payment_status=success`,
        failure: bookingId
          ? `${origin}/turno/${bookingId}?payment_status=failure`
          : `${origin}/pago/confirmacion?payment_status=failure`,
        pending: bookingId
          ? `${origin}/turno/${bookingId}?payment_status=pending`
          : `${origin}/pago/confirmacion?payment_status=pending`
      },
      external_reference: bookingId || 'draft',
      metadata: bookingId ? { booking_id: bookingId } : {
        client_email: clientEmail,
        client_first_name: clientFirstName,
        client_last_name: clientLastName,
        client_phone: clientPhone,
        service_id: serviceId,
        service_name: title.replace('Seña - ', ''),
        service_price: String(servicePrice),
        deposit_amount: String(depositAmount),
        booking_date: bookingDate,
        booking_time: bookingTime,
        booking_quantity: String(bookingQuantity)
      }
    };

    if (origin.startsWith('https://')) {
      preferenceBody.auto_return = 'approved';
    }

    const result = await preference.create({
      body: preferenceBody
    });

    console.log(`[Mercado Pago Vercel] Preference created for booking ${bookingId}. ID: ${result.id}`);
    return res.status(200).json({ success: true, id: result.id, init_point: result.init_point });
  } catch (err) {
    console.error('[Mercado Pago Vercel] Error al crear preferencia:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
