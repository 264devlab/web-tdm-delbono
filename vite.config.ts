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

                  const RESEND_API_KEY = env.RESEND_API_KEY || '';
                  const EMAIL_FROM = env.EMAIL_FROM || 'Notificaciones <turnos@noreply.264devlab.com.ar>';

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
                  } = parsed;

                  const MP_ACCESS_TOKEN = env.MP_ACCESS_TOKEN || '';

                  console.log(`[Vite Dev Server] Intercepted /api/payment/create_preference.`);

                  // @ts-ignore
                  const { MercadoPagoConfig, Preference } = await import('mercadopago');
                  const mpClient = new MercadoPagoConfig({
                    accessToken: MP_ACCESS_TOKEN
                  });

                  const preference = new Preference(mpClient);
                  const origin = req.headers.origin || 'http://localhost:5173';

                  const preferenceBody: any = {
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
            if (req.url === '/api/payment/confirm_payment' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const { preferenceId, paymentId } = parsed;

                  const { createClient } = await import('@supabase/supabase-js');
                  const supabaseUrl = env.VITE_SUPABASE_URL || '';
                  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
                  const supabase = createClient(supabaseUrl, supabaseKey);

                  // 1. Check if booking already exists with this payment_id
                  const { data: existingBookings, error: checkErr } = await supabase
                    .from('bookings')
                    .select('id')
                    .eq('payment_id', paymentId);

                  if (checkErr) throw checkErr;
                  if (existingBookings && existingBookings.length > 0) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: true, bookingId: existingBookings[0].id, alreadyProcessed: true }));
                    return;
                  }

                  // 2. Fetch preference from Mercado Pago
                  const MP_ACCESS_TOKEN = env.MP_ACCESS_TOKEN || '';
                  // @ts-ignore
                  const { MercadoPagoConfig, Preference } = await import('mercadopago');
                  const mpClient = new MercadoPagoConfig({
                    accessToken: MP_ACCESS_TOKEN
                  });
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

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    bookingId: newBooking[0].id,
                    metadata
                  }));
                } catch (e: any) {
                  console.error('[Vite Dev Server] Payment Confirmation Error:', e.message);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: e.message }));
                }
              });
              return;
            }
            if (req.url === '/api/settings/upload-logo' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const { base64, fileName } = parsed;

                  const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                  if (!matches || matches.length !== 3) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: false, error: 'Formato base64 no válido' }));
                    return;
                  }

                  const fs = await import('fs');
                  const path = await import('path');

                  const fileBuffer = Buffer.from(matches[2], 'base64');
                  const ext = path.extname(fileName) || '.png';
                  const newFileName = `logo-${Date.now()}${ext}`;

                  const uploadsDir = path.join(process.cwd(), 'public/uploads');
                  if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                  }

                  const filePath = path.join(uploadsDir, newFileName);
                  fs.writeFileSync(filePath, fileBuffer);

                  console.log(`[Vite Dev Server] Logo guardado en ${filePath}`);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, logoUrl: `/uploads/${newFileName}` }));
                } catch (e: any) {
                  console.error('[Vite Dev Server] Logo Upload Error:', e.message);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: e.message }));
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
            if (req.url === '/api/payment/create_preference' || req.url === '/api/payment/confirm_payment') {
              return req.url;
            }
          }
        },
        '/api/settings': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          bypass: (req) => {
            if (req.url === '/api/settings/upload-logo') {
              return req.url;
            }
          }
        },
      },
    },
  };
})
