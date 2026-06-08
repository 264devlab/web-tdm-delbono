import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // CORS configuration
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

  const { base64, fileName } = req.body || {};
  if (!base64 || !fileName) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: base64 y fileName' });
  }

  try {
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Formato base64 no válido' });
    }

    const fileBuffer = Buffer.from(matches[2], 'base64');
    const ext = path.extname(fileName) || '.png';
    const newFileName = `logo-${Date.now()}${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, newFileName);
    fs.writeFileSync(filePath, fileBuffer);

    console.log(`[Vercel Serverless Upload] Logo guardado en ${filePath}`);
    return res.status(200).json({ success: true, logoUrl: `/uploads/${newFileName}` });
  } catch (err) {
    console.error('[Vercel Serverless Upload] Error al guardar logo:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
