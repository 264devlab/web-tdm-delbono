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

  const { to, subject, html } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ success: false, error: 'Faltan parametros obligatorios: to, subject, html.' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_Yu9J2Bjp_AAZSvJQpUvcKMKSftCEs66p9';
  const EMAIL_FROM = process.env.EMAIL_FROM || 'Tienda de Mascotas Del Bono <turnos@noreply.264devlab.com.ar>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[Email Vercel] Correo enviado a ${to} con ID: ${data.id}`);
      return res.status(200).json({ success: true, id: data.id });
    } else {
      console.error('[Email Vercel] Error de la API de Resend:', data);
      return res.status(response.status).json({ success: false, error: data });
    }
  } catch (err) {
    console.error('[Email Vercel] Error en petición:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
