import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'email-dev-handler',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/email/send' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const { to, subject, html } = parsed;

                  const RESEND_API_KEY = env.RESEND_API_KEY || 're_Yu9J2Bjp_AAZSvJQpUvcKMKSftCEs66p9';
                  const EMAIL_FROM = env.EMAIL_FROM || 'Tienda de Mascotas Del Bono <turnos@noreply.264devlab.com.ar>';

                  console.log(`[Vite Dev Server] Intercepted /api/email/send. Sending via Resend to ${to}...`);

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

                  const responseBody = await response.text();
                  let data;
                  try {
                    data = JSON.parse(responseBody);
                  } catch (e) {
                    data = { error: responseBody };
                  }

                  if (response.ok) {
                    console.log(`[Vite Dev Server] Email sent successfully to ${to}. ID: ${data.id}`);
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: true, id: data.id }));
                  } else {
                    console.error('[Vite Dev Server] Resend API Error:', data);
                    res.statusCode = response.status;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, error: data }));
                  }
                } catch (err: any) {
                  console.error('[Vite Dev Server] Middleware Error:', err.message);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
              return;
            }
            next();
          });
        }
      }
    ],
    server: {
      proxy: {
        '/api/email': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          bypass: (req) => {
            if (req.url === '/api/email/send') {
              return req.url;
            }
          }
        },
      },
    },
  };
})
