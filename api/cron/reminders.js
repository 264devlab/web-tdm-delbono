import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // 1. Authorize Cron request (if running in production)
  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV === 'production') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  try {
    // 2. Calculate tomorrow's date in America/Argentina/Buenos_Aires timezone
    const argTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
    const todayInArg = new Date(argTimeStr);
    const tomorrowInArg = new Date(todayInArg.getTime() + 24 * 60 * 60 * 1000);
    
    const year = tomorrowInArg.getFullYear();
    const month = String(tomorrowInArg.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrowInArg.getDate()).padStart(2, '0');
    const tomorrowStr = `${year}-${month}-${day}`;

    console.log(`[Cron Reminders] Running for date: ${tomorrowStr}`);

    // 3. Query tomorrow's active bookings that haven't received a reminder
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, clients(*), services(*)')
      .eq('booking_date', tomorrowStr)
      .in('status', ['CONFIRMED', 'RESCHEDULED'])
      .or('reminder_sent.eq.false,reminder_sent.is.null');

    if (bookingsError) {
      throw new Error(`Error fetching bookings: ${bookingsError.message}`);
    }

    if (!bookings || bookings.length === 0) {
      console.log('[Cron Reminders] No bookings found for tomorrow that require reminders.');
      return res.status(200).json({ success: true, count: 0 });
    }

    console.log(`[Cron Reminders] Found ${bookings.length} bookings to remind.`);

    // 4. Retrieve Business Settings for templates
    const { data: settingsData } = await supabase.from('business_settings').select('*').limit(1);
    const settings = (settingsData && settingsData.length > 0) ? settingsData[0] : {
      business_name: 'Negocio',
      address: '',
      phone: '',
      logo_url: ''
    };

    // 5. Send reminders and track updates
    const WA_SERVER_URL = process.env.VITE_WA_SERVER_URL || 'http://localhost:3001';
    const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
    const EMAIL_FROM = process.env.EMAIL_FROM || `${settings.business_name} <turnos@noreply.264devlab.com.ar>`;
    const WA_API_KEY = process.env.WA_API_KEY || '';

    const results = [];

    for (const b of bookings) {
      const clientName = `${b.clients.first_name} ${b.clients.last_name}`;
      const serviceName = b.services.name;
      const timeStr = b.booking_time.substring(0, 5);
      const email = b.clients.email;
      const phone = b.clients.phone;
      const bookingId = b.id;
      const quantity = b.quantity || 1;

      console.log(`[Cron Reminders] Processing booking ${bookingId} for ${clientName}`);

      let emailSent = false;
      let waSent = false;

      // --- Send Email via Resend ---
      if (email) {
        try {
          const emailHtml = generateEmailHtml({
            clientName,
            serviceName,
            date: b.booking_date,
            time: timeStr,
            quantity,
            bookingId,
            settings
          });

          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [email],
              subject: `Recordatorio de Turno - ${settings.business_name}`,
              html: emailHtml
            })
          });

          const resData = await response.json();
          if (response.ok) {
            emailSent = true;
            console.log(`[Cron Reminders] Email sent to ${email}. ID: ${resData.id}`);
          } else {
            console.error(`[Cron Reminders] Resend API error for ${email}:`, resData);
          }
        } catch (err) {
          console.error(`[Cron Reminders] Failed to send email to ${email}:`, err.message);
        }
      }

      // --- Send WhatsApp via Baileys API Gateway ---
      if (phone) {
        try {
          const waMessage = generateWhatsAppMessage({
            clientName,
            serviceName,
            date: b.booking_date,
            time: timeStr,
            quantity,
            bookingId,
            settings
          });

          const headers = { 'Content-Type': 'application/json' };
          if (WA_API_KEY) {
            headers['x-api-key'] = WA_API_KEY;
          }

          const response = await fetch(`${WA_SERVER_URL}/api/wa/send`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone, message: waMessage }),
            signal: AbortSignal.timeout(10000)
          });

          const resData = await response.json();
          if (resData.success) {
            waSent = true;
            console.log(`[Cron Reminders] WhatsApp sent to ${phone}`);
          } else {
            console.error(`[Cron Reminders] WA server error for ${phone}:`, resData.error);
          }
        } catch (err) {
          console.error(`[Cron Reminders] Failed to send WA to ${phone}:`, err.message);
        }
      }

      // If at least one notification was successfully triggered, mark as sent
      if (emailSent || waSent) {
        try {
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ reminder_sent: true, updated_at: new Date().toISOString() })
            .eq('id', bookingId);

          if (updateError) {
            console.error(`[Cron Reminders] Failed to update booking status for ${bookingId}:`, updateError.message);
          } else {
            console.log(`[Cron Reminders] Booking ${bookingId} successfully updated with reminder_sent = true`);
          }
        } catch (err) {
          console.error(`[Cron Reminders] DB update error for ${bookingId}:`, err.message);
        }
      }

      results.push({ bookingId, emailSent, waSent });
    }

    return res.status(200).json({ success: true, count: bookings.length, results });

  } catch (err) {
    console.error(`[Cron Reminders] Fatal error:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// -------------------------------------------------------------
// HELPERS FOR TEMPLATE GENERATION
// -------------------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${day}/${month}/${year}`;
    }
    return `${year}/${month}/${day}`;
  }
  return dateStr;
}

function generateWhatsAppMessage({ clientName, serviceName, date, time, quantity, settings }) {
  const prefix = `*${settings.business_name}*\n\n`;
  return prefix + 
    `¡Hola *${clientName}*! Te recordamos tu turno para el día de mañana. ⏰\n\n` +
    `📋 *Detalles de tu Turno:*\n` +
    `• *Servicio:* ${serviceName}\n` +
    (quantity > 1 ? `• *Cantidad de turnos:* ${quantity}\n` : '') +
    `• *Fecha:* ${formatDate(date)}\n` +
    `• *Hora:* ${time} hs\n` +
    `• *Lugar:* ${settings.address}\n\n` +
    `🐶🐱 ¡Te esperamos con tu mascota! Por favor, responde a este mensaje para confirmar tu asistencia.`;
}

function generateEmailHtml({ clientName, serviceName, date, time, quantity, bookingId, settings }) {
  // Try to use window.location.origin equivalent or fallback
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173';
  const manageUrl = `${origin}/turno/${bookingId}`;

  let logoSrc = settings.logo_url;
  if (!logoSrc) {
    logoSrc = origin + '/logo.png';
  } else {
    if (logoSrc.startsWith('/')) {
      logoSrc = origin + logoSrc;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Recordatorio de Turno</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #fdfbf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fdfbf7; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.02); border-collapse: collapse;">
              <tr>
                <td style="background-color: #d97706; padding: 30px; text-align: center;">
                  <div style="display: inline-block; background-color: #ffffff; border-radius: 50%; padding: 12px; margin-bottom: 12px;">
                    <img src="${logoSrc}" alt="Logo" style="width: 48px; height: 48px; border-radius: 50%; display: block; object-fit: cover;">
                  </div>
                  <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800;">${settings.business_name}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px; text-align: left;">
                  <h2 style="margin: 0 0 16px 0; color: #2d3142; font-size: 20px; font-weight: 700;">Recordatorio de Turno ⏰</h2>
                  <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
                    Hola <strong>${clientName}</strong>, te recordamos que tienes un turno agendado para el día de mañana para el servicio de <strong>"${serviceName}"</strong>.
                  </p>
                  
                  <div style="background-color: #fcfbf7; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 15px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📅 Fecha:</strong> ${formatDate(date)}</p>
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>⏰ Hora:</strong> ${time} hs</p>
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📍 Lugar:</strong> ${settings.address}</p>
                    ${quantity > 1 ? `<p style="margin: 0; font-size: 14px; color: #2d3142;"><strong>🐾 Cantidad de turnos/mascotas:</strong> ${quantity}</p>` : ''}
                  </div>
                  
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="${manageUrl}" target="_blank" style="display: inline-block; background-color: #0f766e; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 10px;">
                      Gestionar mi Turno
                    </a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 11px; color: #64748b;">
                  <span>Desarrollado por </span>
                  <a href="https://www.264devlab.com.ar" target="_blank" style="color: #0f766e; font-weight: 700; text-decoration: none;">264DevLab</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
