import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

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
    const mimeType = matches[1];
    const ext = path.extname(fileName) || '.png';
    const newFileName = `logo-${Date.now()}${ext}`;

    let logoUrl = '';
    let uploadedToStorage = false;

    // 1. Try uploading to Supabase Storage
    if (supabase) {
      try {
        const bucketName = 'logos';
        let uploadResult = await supabase.storage.from(bucketName).upload(newFileName, fileBuffer, {
          contentType: mimeType,
          upsert: true
        });

        if (uploadResult.error) {
          // If the bucket doesn't exist, try to create it and retry upload
          if (
            uploadResult.error.message &&
            (uploadResult.error.message.includes('not found') || uploadResult.error.statusCode === '404')
          ) {
            console.log(`[Vercel Serverless Upload] Bucket '${bucketName}' no encontrado. Creándolo...`);
            const { error: createError } = await supabase.storage.createBucket(bucketName, {
              public: true,
              allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
              fileSizeLimit: 2 * 1024 * 1024
            });

            if (createError) {
              throw createError;
            }

            // Retry upload
            uploadResult = await supabase.storage.from(bucketName).upload(newFileName, fileBuffer, {
              contentType: mimeType,
              upsert: true
            });
          }
        }

        if (uploadResult.error) {
          throw uploadResult.error;
        }

        const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(newFileName);
        logoUrl = publicUrl;
        uploadedToStorage = true;
        console.log(`[Vercel Serverless Upload] Logo subido exitosamente a Supabase Storage: ${logoUrl}`);
      } catch (storageErr) {
        console.error('[Vercel Serverless Upload] Error al usar Supabase Storage:', storageErr.message);

        // If we are running on Vercel, we can't write to local files, so we must raise the error.
        if (process.env.VERCEL) {
          throw new Error(`No se pudo subir al almacenamiento en la nube en Vercel: ${storageErr.message}`);
        }
      }
    }

    // 2. Fallback to local files if not uploaded to cloud storage
    if (!uploadedToStorage) {
      console.log('[Vercel Serverless Upload] Usando almacenamiento local de archivos...');
      const uploadsDir = path.join(process.cwd(), 'public/uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, newFileName);
      fs.writeFileSync(filePath, fileBuffer);
      logoUrl = `/uploads/${newFileName}`;
      console.log(`[Vercel Serverless Upload] Logo guardado en el sistema de archivos local: ${filePath}`);
    }

    return res.status(200).json({ success: true, logoUrl });
  } catch (err) {
    console.error('[Vercel Serverless Upload] Error al guardar logo:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
