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
            if (req.url === '/api/payment/create_preference' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const { title, price, quantity, bookingId } = parsed;

                  const MP_ACCESS_TOKEN = env.MP_ACCESS_TOKEN || 'APP_USR-7836050886019304-060409-f12818c2b9fb599e93e76217b0a2ecca-3450532720';

                  console.log(`[Vite Dev Server] Intercepted /api/payment/create_preference. Creating preference for booking ${bookingId}...`);

                  const { MercadoPagoConfig, Preference } = await import('mercadopago');
                  const mpClient = new MercadoPagoConfig({
                    accessToken: MP_ACCESS_TOKEN
                  });

                  const preference = new Preference(mpClient);
                  const origin = req.headers.origin || 'http://localhost:5173';

                  const preferenceBody: any = {
                    items: [
                      {
                        id: bookingId,
                        title: title,
                        quantity: Number(quantity),
                        unit_price: Number(price),
                        currency_id: 'ARS'
                      }
                    ],
                    back_urls: {
                      success: `${origin}/turno/${bookingId}?payment_status=success`,
                      failure: `${origin}/turno/${bookingId}?payment_status=failure`,
                      pending: `${origin}/turno/${bookingId}?payment_status=pending`
                    },
                    external_reference: bookingId
                  };

                  if (origin.startsWith('https://')) {
                    preferenceBody.auto_return = 'approved';
                  }

                  const result = await preference.create({
                    body: preferenceBody
                  });

                  console.log(`[Vite Dev Server] Preference created successfully. ID: ${result.id}`);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, id: result.id, init_point: result.init_point }));
                } catch (err: any) {
                  console.error('[Vite Dev Server] Payment Middleware Error:', err.message);
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
        '/api/payment': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          bypass: (req) => {
            if (req.url === '/api/payment/create_preference') {
              return req.url;
            }
          }
        },
      },
    },
  };
})
