// Decoupled Notification Provider Interfaces for Petshop Booking

import { supabase } from '../utils/supabase';
import { formatCurrency, formatDate } from '../utils/format';

export type NotificationType = 'CONFIRMATION' | 'RESCHEDULE' | 'CANCELLATION' | 'REMINDER';

export interface NotificationPayload {
  toEmail?: string;
  toPhone?: string;
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  depositAmount: number;
  bookingId?: string;
  quantity?: number;
  remainingAmount?: number;
}

export interface NotificationProvider {
  send(type: NotificationType, payload: NotificationPayload): Promise<boolean>;
}

// Global log to display notifications inside the UI (for demonstration/mocking)
export interface SentNotificationLog {
  id: string;
  channel: 'email' | 'whatsapp';
  type: NotificationType;
  recipient: string;
  subject: string;
  body: string;
  timestamp: string;
}

export function getSentNotifications(): SentNotificationLog[] {
  const logs = localStorage.getItem('tdm_delbono_notifications');
  return logs ? JSON.parse(logs) : [];
}

function logNotification(channel: 'email' | 'whatsapp', type: NotificationType, recipient: string, subject: string, body: string) {
  const logs = getSentNotifications();
  const newLog: SentNotificationLog = {
    id: Math.random().toString(36).substring(2, 9),
    channel,
    type,
    recipient,
    subject,
    body,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('tdm_delbono_notifications', JSON.stringify([newLog, ...logs].slice(0, 50)));

  // Dispatch event so UI can display a floating toast alert showing the simulated message
  const event = new CustomEvent('simulated_notification', { detail: newLog });
  window.dispatchEvent(event);
}

// -------------------------------------------------------------
// EMAIL HTML GENERATOR (Styled template)
// -------------------------------------------------------------
function generateEmailHtml(type: NotificationType, payload: NotificationPayload, settings: any): string {
  const manageUrl = payload.bookingId ? `${window.location.origin}/turno/${payload.bookingId}` : '';

  let logoSrc = settings?.logo_url;
  if (!logoSrc) {
    logoSrc = window.location.origin + '/logo.png';
  } else {
    if (logoSrc.startsWith('/')) {
      logoSrc = window.location.origin + logoSrc;
    }
  }

  let title = '';
  let intro = '';
  let detailsHtml = '';
  let showButton = false;

  switch (type) {
    case 'CONFIRMATION':
      title = '¡Turno Confirmado! 🎉';
      intro = `Hola <strong>${payload.clientName}</strong>, tu turno para el servicio de <strong>"${payload.serviceName}"</strong> ha sido agendado y confirmado con éxito.`;
      showButton = true;
      detailsHtml = `
        <div style="background-color: #fcfbf7; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 15px;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📅 Fecha:</strong> ${formatDate(payload.date)}</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>⏰ Hora:</strong> ${payload.time} hs</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📍 Lugar:</strong> ${settings.address}</p>
          ${payload.quantity && payload.quantity > 1 ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>🐾 Cantidad de turnos/mascotas:</strong> ${payload.quantity}</p>` : ''}
          ${payload.depositAmount > 0 ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #10b981;"><strong>💰 Seña Abonada Total:</strong> $${formatCurrency(payload.depositAmount)}</p>` : ''}
          ${payload.remainingAmount !== undefined ? `<p style="margin: 0; font-size: 14px; color: #0f766e;"><strong>💵 Restante a pagar en local:</strong> $${formatCurrency(payload.remainingAmount)}</p>` : ''}
        </div>
      `;
      break;
    case 'RESCHEDULE':
      title = 'Turno Reprogramado 🗓️';
      intro = `Hola <strong>${payload.clientName}</strong>, te informamos que tu turno para el servicio de <strong>"${payload.serviceName}"</strong> ha sido reprogramado con éxito.`;
      showButton = true;
      detailsHtml = `
        <div style="background-color: #fcfbf7; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 15px;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📅 Nueva Fecha:</strong> ${formatDate(payload.date)}</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>⏰ Nueva Hora:</strong> ${payload.time} hs</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📍 Lugar:</strong> ${settings.address}</p>
          ${payload.quantity && payload.quantity > 1 ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>🐾 Cantidad de turnos/mascotas:</strong> ${payload.quantity}</p>` : ''}
        </div>
      `;
      break;
    case 'CANCELLATION':
      title = 'Turno Cancelado ❌';
      intro = `Hola <strong>${payload.clientName}</strong>, lamentamos informarte que tu turno para el servicio de <strong>"${payload.serviceName}"</strong> ${payload.quantity && payload.quantity > 1 ? `(${payload.quantity} turnos/mascotas) ` : ''}programado para el día ${formatDate(payload.date)} a las ${payload.time} hs ha sido <strong>cancelado</strong>.`;
      detailsHtml = payload.depositAmount > 0 ? `
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 20px; margin-top: 15px;">
          <p style="margin: 0; font-size: 14px; color: #b45309;">⚠️ <strong>Reembolso de Seña:</strong> Al haber abonado una seña de $${formatCurrency(payload.depositAmount)}, nos pondremos en contacto contigo a la brevedad para realizar el reembolso correspondiente.</p>
        </div>
      ` : '';
      break;
    case 'REMINDER':
      title = 'Recordatorio de Turno ⏰';
      intro = `Hola <strong>${payload.clientName}</strong>, te recordamos que tienes un turno agendado para el día de mañana para el servicio de <strong>"${payload.serviceName}"</strong>.`;
      showButton = true;
      detailsHtml = `
        <div style="background-color: #fcfbf7; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 15px;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📅 Fecha:</strong> ${formatDate(payload.date)}</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>⏰ Hora:</strong> ${payload.time} hs</p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>📍 Lugar:</strong> ${settings.address}</p>
          ${payload.quantity && payload.quantity > 1 ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #2d3142;"><strong>🐾 Cantidad de turnos/mascotas:</strong> ${payload.quantity}</p>` : ''}
        </div>
      `;
      break;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #fdfbf7; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fdfbf7; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(45,49,66,0.03); border-collapse: collapse;">
              <!-- HEADER -->
              <tr>
                <td style="background-color: #d97706; padding: 30px; text-align: center;">
                  <div style="display: inline-block; background-color: #ffffff; border-radius: 50%; padding: 12px; margin-bottom: 12px;">
                    <img src="${logoSrc}" alt="Logo" style="width: 48px; height: 48px; border-radius: 50%; display: block; object-fit: cover;">
                  </div>
                  <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">${settings.business_name}</h1>
                  <p style="margin: 4px 0 0 0; color: #fef3c7; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Servicios & Turnos</p>
                </td>
              </tr>
              
              <!-- CONTENT -->
              <tr>
                <td style="padding: 40px 30px; text-align: left;">
                  <h2 style="margin: 0 0 16px 0; color: #2d3142; font-size: 20px; font-weight: 700;">${title}</h2>
                  <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">${intro}</p>
                  
                  ${detailsHtml}
                  
                  ${showButton && manageUrl ? `
                    <div style="text-align: center; margin-top: 30px;">
                      <a href="${manageUrl}" target="_blank" style="display: inline-block; background-color: #0f766e; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 10px; box-shadow: 0 2px 4px rgba(15,118,110,0.25);">
                        Gestionar mi Turno
                      </a>
                      <p style="margin: 10px 0 0 0; font-size: 11px; color: #9ca3af;">Puedes reprogramar o cancelar tu turno desde este enlace.</p>
                    </div>
                  ` : ''}
                  
                  <p style="margin: 30px 0 0 0; border-top: 1px solid #e2e8f0; padding-top: 20px; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.8;">
                    📍 <strong>Dirección:</strong> ${settings.address} <br/>
                    📞 <strong>Teléfono:</strong> ${settings.phone}
                    ${settings.instagram ? `<br/>📸 <strong>Instagram:</strong> @${settings.instagram}` : ''}
                    ${settings.facebook ? ` | 🌐 <strong>Facebook:</strong> ${settings.facebook}` : ''}
                  </p>
                </td>
              </tr>

              <!-- FOOTER (DEVELOPER BADGE) -->
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 11px; color: #64748b;">
                  <span>Desarrollado por </span>
                  <a href="https://www.264devlab.com.ar" target="_blank" style="color: #0f766e; font-weight: 700; text-decoration: none;">264DevLab</a>
                  <span style="display: block; margin-top: 4px; color: #94a3b8;">www.264devlab.com.ar</span>
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

// Helper to fetch business settings dynamically
async function getBusinessSettings() {
  try {
    const { data } = await supabase.from('business_settings').select('*').limit(1);
    if (data && data.length > 0) {
      return data[0];
    }
  } catch (err) {
    console.warn('Error fetching business settings:', err);
  }
  return {
    business_name: 'Negocio',
    address: '',
    phone: '',
    logo_url: ''
  };
}

// -------------------------------------------------------------
// EMAIL PROVIDER (Resend Real API Proxy)
// -------------------------------------------------------------
export class EmailProvider implements NotificationProvider {
  async send(type: NotificationType, payload: NotificationPayload): Promise<boolean> {
    const email = payload.toEmail;
    if (!email) return false;

    const settings = await getBusinessSettings();
    let subject = '';

    switch (type) {
      case 'CONFIRMATION':
        subject = `Confirmación de Turno - ${settings.business_name}`;
        break;
      case 'RESCHEDULE':
        subject = `Reprogramación de Turno - ${settings.business_name}`;
        break;
      case 'CANCELLATION':
        subject = `Cancelación de Turno - ${settings.business_name}`;
        break;
      case 'REMINDER':
        subject = `Recordatorio de Turno - ${settings.business_name}`;
        break;
    }

    const emailHtml = generateEmailHtml(type, payload, settings);

    // Guardar logs locales para simulaciones
    logNotification('email', type, email, subject, emailHtml);

    // Intentar envío real a través de nuestro servidor
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const waApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WA_API_KEY) || '';
      if (waApiKey) {
        headers['x-api-key'] = waApiKey;
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: email, subject, html: emailHtml }),
      });
      const data = await res.json();
      if (data.success) {
        console.log(`[Email] Correo enviado a ${email} correctamente.`);
        return true;
      } else {
        console.warn(`[Email] El servidor devolvió error:`, data.error);
        return false;
      }
    } catch (err) {
      console.warn(`[Email] No se pudo conectar al servidor de correos. Mensaje simulado localmente.`, err);
      return false;
    }
  }
}

// -------------------------------------------------------------
// WHATSAPP PROVIDER (Baileys — real backend)
// -------------------------------------------------------------
const WA_SERVER_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WA_SERVER_URL) || 'http://localhost:3001';

export class WhatsAppProvider implements NotificationProvider {
  async send(type: NotificationType, payload: NotificationPayload): Promise<boolean> {
    const phone = payload.toPhone;
    if (!phone) return false;

    const settings = await getBusinessSettings();

    let message = '';
    const prefix = `*${settings.business_name}*\n\n`;

    switch (type) {
      case 'CONFIRMATION':
        message = `¡Hola *${payload.clientName}*! Tu turno ha sido confirmado con éxito. 🎉\n\n` +
          `📋 *Detalles del Turno:*\n` +
          `• *Servicio:* ${payload.serviceName}\n` +
          (payload.quantity && payload.quantity > 1 ? `• *Cantidad de turnos:* ${payload.quantity}\n` : '') +
          `• *Fecha:* ${formatDate(payload.date)}\n` +
          `• *Hora:* ${payload.time} hs\n` +
          `• *Lugar:* ${settings.address}\n` +
          (payload.depositAmount > 0 ? `• *Seña abonada:* $${formatCurrency(payload.depositAmount)}\n` : '') +
          (payload.remainingAmount !== undefined ? `• *Restante a pagar en local:* $${formatCurrency(payload.remainingAmount)}\n` : '') +
          (payload.bookingId ? `• *Gestionar Turno:* ${window.location.origin}/turno/${payload.bookingId}\n` : '') +
          `\n¡Te esperamos con tu mascota! 🐶🐱\n\n_Por cualquier consulta o inconveniente, puedes responder a este mensaje._`;
        break;
      case 'RESCHEDULE':
        message = `¡Hola *${payload.clientName}*! Te confirmamos que tu turno ha sido reprogramado con éxito. 🗓️\n\n` +
          `📋 *Nuevos Detalles:*\n` +
          `• *Servicio:* ${payload.serviceName}\n` +
          (payload.quantity && payload.quantity > 1 ? `• *Cantidad de turnos:* ${payload.quantity}\n` : '') +
          `• *Nueva Fecha:* ${formatDate(payload.date)}\n` +
          `• *Nueva Hora:* ${payload.time} hs\n` +
          `• *Lugar:* ${settings.address}\n` +
          (payload.bookingId ? `• *Gestionar Turno:* ${window.location.origin}/turno/${payload.bookingId}\n` : '') +
          `\n¡Gracias por tu paciencia y nos vemos pronto! 🐾`;
        break;
      case 'CANCELLATION':
        message = `Hola *${payload.clientName}*.\n\nTe informamos que tu turno para *${payload.serviceName}* ${payload.quantity && payload.quantity > 1 ? `(${payload.quantity} turnos/mascotas) ` : ''}agendado para el día *${formatDate(payload.date)}* a las *${payload.time} hs* ha sido *cancelado*. ❌\n\n` +
          (payload.depositAmount > 0 ? `👉 Nos comunicaremos a la brevedad para realizar el reembolso correspondiente de tu seña ($${formatCurrency(payload.depositAmount)}).\n\n` : '') +
          `Quedamos a tu disposición si deseas agendar un nuevo turno en el futuro. ¡Saludos! 🐾`;
        break;
      case 'REMINDER':
        message = `¡Hola *${payload.clientName}*! Te recordamos tu turno para el día de mañana. ⏰\n\n` +
          `📋 *Detalles de tu Turno:*\n` +
          `• *Servicio:* ${payload.serviceName}\n` +
          (payload.quantity && payload.quantity > 1 ? `• *Cantidad de turnos:* ${payload.quantity}\n` : '') +
          `• *Hora:* ${payload.time} hs\n` +
          `• *Lugar:* ${settings.address}\n\n` +
          `🐶🐱 ¡Te esperamos con tu mascota! Por favor, responde a este mensaje para confirmar tu asistencia.`;
        break;
    }

    const fullMessage = prefix + message;

    // Always log locally for the admin notification feed
    logNotification('whatsapp', type, phone, 'WhatsApp Message', fullMessage);

    // Attempt real send via Baileys backend
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const waApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WA_API_KEY) || '';
      if (waApiKey) {
        headers['x-api-key'] = waApiKey;
      }

      const res = await fetch(`${WA_SERVER_URL}/api/wa/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, message: fullMessage }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (data.success) {
        console.log(`[WhatsApp] Mensaje enviado a ${phone} via Baileys`);
        return true;
      } else {
        console.warn(`[WhatsApp] Backend respondio error:`, data.error);
        return false;
      }
    } catch (err) {
      // Server is not running — notify in console but don't break the booking flow
      console.warn(`[WhatsApp] Servidor no disponible. Mensaje simulado localmente para ${phone}.`, err);
      return false;
    }
  }
}

// -------------------------------------------------------------
// ORCHESTRATOR / CONVENIENCE DISPATCHER
// -------------------------------------------------------------
export class NotificationDispatcher {
  private emailProvider = new EmailProvider();
  private whatsappProvider = new WhatsAppProvider();

  async dispatch(type: NotificationType, payload: NotificationPayload): Promise<void> {
    const promises: Promise<any>[] = [];

    if (payload.toEmail) {
      promises.push(this.emailProvider.send(type, payload));
    }
    if (payload.toPhone) {
      promises.push(this.whatsappProvider.send(type, payload));
    }

    await Promise.allSettled(promises);
  }
}

export const notifications = new NotificationDispatcher();
