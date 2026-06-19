import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, Preference, MerchantOrder } from 'mercadopago';
import { generateEmailHtml, generateWhatsAppMessage } from '../lib/notificationsTemplate.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('[Webhook] MP_ACCESS_TOKEN no configurado');
    return res.status(500).send('Internal Server Error');
  }

  try {
    const mpClient = new MercadoPagoConfig({ accessToken: token });

    let type = req.query.topic || req.query.type;
    let paymentId = req.query.id || req.query['data.id'];

    if (req.body) {
      type = type || req.body.type || req.body.topic || req.body.action;
      if (req.body.data && req.body.data.id) {
        paymentId = paymentId || req.body.data.id;
      }
    }

    if (type !== 'payment' && type !== 'payment.created' && type !== 'payment.updated') {
      return res.status(200).send('OK - Not a payment event');
    }

    if (!paymentId) {
      return res.status(400).send('Missing payment id');
    }

    const payment = new Payment(mpClient);
    const paymentInfo = await payment.get({ id: paymentId });

    if (paymentInfo.status !== 'approved') {
      return res.status(200).send('Payment not approved yet');
    }

    // Evitar procesar eventos de liberación de fondos o actualizaciones de pagos viejos
    if (paymentInfo.date_approved) {
      const dateApproved = new Date(paymentInfo.date_approved);
      const now = new Date();
      const maxAgeMs = 48 * 60 * 60 * 1000; // 48 horas
      if (now - dateApproved > maxAgeMs) {
        console.log(`[Webhook] Ignorando evento para pago antiguo ${paymentId} (aprobado el ${paymentInfo.date_approved}) para evitar duplicaciones o recreaciones.`);
        return res.status(200).send('OK - Ignored old payment event');
      }
    }

    // Para evitar duplicados por colisión de webhooks concurrentes de MP (IPN vs Webhook, created vs updated)
    // Stagger / Espaciamos las peticiones concurrentes para que no entren en carrera (race condition)
    let delay = 0;
    if (req.body && req.body.action) {
      if (req.body.action === 'payment.created') {
        delay = 0; // Se ejecuta de inmediato
      } else if (req.body.action === 'payment.updated') {
        delay = 2000; // Demoramos 2 segundos
      } else {
        delay = 1000; // Otras acciones de webhook
      }
    } else {
      // Notificaciones IPN (que usualmente no traen body y vienen por query params)
      delay = 4000; // Demoramos 4 segundos
    }

    if (delay > 0) {
      console.log(`[Webhook] Espaciando procesamiento de pago ${paymentId} por ${delay}ms para evitar duplicación...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Verificamos si ya existe la reserva en Supabase
    const { data: existingBookings, error: checkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);

    if (checkErr) throw checkErr;
    if (existingBookings && existingBookings.length > 0) {
      return res.status(200).send('Already processed');
    }

    // Buscar metadata desde Preference o Payment
    let metadata = null;
    let preferenceId = null;

    if (paymentInfo.order && paymentInfo.order.id) {
      try {
        const order = new MerchantOrder(mpClient);
        const orderInfo = await order.get({ merchantOrderId: paymentInfo.order.id });
        preferenceId = orderInfo.preference_id;
      } catch (e) {
        console.warn('[Webhook] No se pudo obtener la MerchantOrder:', e.message);
      }
    }

    if (preferenceId) {
      try {
        const preference = new Preference(mpClient);
        const prefResult = await preference.get({ preferenceId });
        metadata = prefResult.metadata;
      } catch (e) {
        console.warn('[Webhook] No se pudo obtener la Preference:', e.message);
      }
    }

    // Fallback: usar el external_reference si es un bookingId o metadata del pago
    if (!metadata) {
       metadata = paymentInfo.metadata;
    }

    // Si ya era una reserva existente (re-pago)
    const externalReference = paymentInfo.external_reference || (metadata && metadata.booking_id);
    if (externalReference && externalReference !== 'draft') {
        const bookingId = externalReference;
        
        // 1. Obtener los datos actuales de la reserva, cliente y servicio para las notificaciones
        const { data: booking, error: fetchErr } = await supabase
          .from('bookings')
          .select('*, clients(*), services(*)')
          .eq('id', bookingId)
          .single();
          
        if (fetchErr || !booking) {
          console.error('[Webhook] Reserva no encontrada para re-pago:', bookingId, fetchErr?.message);
          return res.status(200).send('Booking not found for re-payment');
        }

        // 2. Confirmar el pago en la base de datos
        const { error: updErr } = await supabase
          .from('bookings')
          .update({ status: 'CONFIRMED', payment_id: paymentId })
          .eq('id', bookingId);
          
        if (updErr) throw updErr;
        console.log(`[Webhook] Reserva existente confirmada exitosamente (Booking ID: ${bookingId}) por pago ${paymentId}`);

        // 3. Enviar notificaciones desde el backend
        try {
          const { data: settingsData } = await supabase.from('business_settings').select('*').limit(1);
          const settings = (settingsData && settingsData.length > 0) ? settingsData[0] : { business_name: 'Negocio' };

          const payload = {
            toEmail: booking.clients.email,
            toPhone: booking.clients.phone,
            clientName: `${booking.clients.first_name} ${booking.clients.last_name}`,
            serviceName: booking.services.name,
            date: booking.booking_date,
            time: booking.booking_time.substring(0, 5),
            depositAmount: booking.deposit_amount,
            bookingId: booking.id,
            quantity: booking.quantity,
            remainingAmount: booking.services.price !== undefined ? (Number(booking.services.price) * Number(booking.quantity)) - Number(booking.deposit_amount) : undefined
          };

          const RESEND_API_KEY = process.env.RESEND_API_KEY;
          if (RESEND_API_KEY && booking.clients.email) {
            const EMAIL_FROM = process.env.EMAIL_FROM || 'Notificaciones <onboarding@resend.dev>';
            let emailFrom = EMAIL_FROM;
            if (settings.business_name) {
              const emailMatch = EMAIL_FROM.match(/<(.+)>/) || [null, EMAIL_FROM];
              emailFrom = `${settings.business_name} <${(emailMatch[1] || EMAIL_FROM).trim()}>`;
            }

            const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
            const emailHtml = generateEmailHtml('CONFIRMATION', payload, settings, originUrl);
            
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
              },
              body: JSON.stringify({
                from: emailFrom,
                to: [booking.clients.email],
                subject: `Confirmación de Turno - ${settings.business_name}`,
                html: emailHtml
              })
            }).then(res => res.json()).then(data => {
              if (data.id) console.log(`[Webhook] Correo de re-pago enviado: ${data.id}`);
              else console.warn(`[Webhook] Falló envío de correo de re-pago:`, data);
            }).catch(e => console.warn('[Webhook] Error red correo re-pago:', e.message));
          }

          const WA_SERVER_URL = process.env.VITE_WA_SERVER_URL || process.env.WA_SERVER_URL;
          const WA_API_KEY = process.env.WA_API_KEY || process.env.VITE_WA_API_KEY;
          if (WA_SERVER_URL && booking.clients.phone) {
            const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
            const waMsg = generateWhatsAppMessage('CONFIRMATION', payload, settings, originUrl);
            const headers = { 'Content-Type': 'application/json' };
            if (WA_API_KEY) headers['x-api-key'] = WA_API_KEY;

            await fetch(`${WA_SERVER_URL}/api/wa/send`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ phone: booking.clients.phone, message: waMsg })
            }).catch(e => console.warn('[Webhook] Servidor WA re-pago no disponible:', e.message));
          }
        } catch (notifErr) {
          console.error('[Webhook] Error enviando notificaciones para re-pago:', notifErr.message);
        }

        return res.status(200).send('Booking confirmed and notifications sent via external_reference/booking_id');
    }

    if (!metadata || !metadata.client_email) {
      console.error('[Webhook] No se encontraron metadatos suficientes para el pago', paymentId);
      return res.status(200).send('No metadata found to create booking');
    }

    // Crear cliente y reserva
    const {
      client_email,
      client_first_name,
      client_last_name,
      client_phone,
      service_id,
      booking_date,
      booking_time,
      booking_quantity,
      deposit_amount
    } = metadata;

    let clientId = '';
    // Buscamos por teléfono en lugar de correo, ya que el teléfono es único por persona y el frontend usa el teléfono.
    const { data: clients, error: clientFindErr } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', client_phone);

    if (clientFindErr) throw clientFindErr;

    if (clients && clients.length > 0) {
      clientId = clients[0].id;
      await supabase
        .from('clients')
        .update({
          first_name: client_first_name,
          last_name: client_last_name,
          email: client_email
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

    const { data: services, error: serviceErr } = await supabase
      .from('services')
      .select('estimated_duration_minutes')
      .eq('id', service_id);

    if (serviceErr || !services || services.length === 0) {
      throw new Error('Servicio no encontrado');
    }
    const duration = services[0].estimated_duration_minutes;

    // Doble verificación justo antes de insertar para mitigar race conditions extremas
    const { data: doubleCheck } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);
      
    if (doubleCheck && doubleCheck.length > 0) {
      console.log(`[Webhook] Reserva doble detectada y evitada para el pago ${paymentId}`);
      return res.status(200).send('Already processed (double check)');
    }

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
    const createdBookingId = newBooking[0].id;
    console.log(`[Webhook] Reserva creada exitosamente (Booking ID: ${createdBookingId}) por pago ${paymentId}`);

    // --- ENVIAR NOTIFICACIONES DESDE EL WEBHOOK ---
    try {
      const { data: settingsData } = await supabase.from('business_settings').select('*').limit(1);
      const settings = (settingsData && settingsData.length > 0) ? settingsData[0] : { business_name: 'Negocio' };

      const payload = {
        toEmail: client_email,
        toPhone: client_phone,
        clientName: `${client_first_name} ${client_last_name}`,
        serviceName: metadata.service_name || 'Servicio',
        date: booking_date,
        time: booking_time,
        depositAmount: depositAmountTotal,
        bookingId: createdBookingId,
        quantity: Number(booking_quantity),
        remainingAmount: metadata.service_price !== undefined ? (Number(metadata.service_price) * Number(booking_quantity)) - depositAmountTotal : undefined
      };

      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY && client_email) {
        const EMAIL_FROM = process.env.EMAIL_FROM || 'Notificaciones <onboarding@resend.dev>';
        let emailFrom = EMAIL_FROM;
        if (settings.business_name) {
          const emailMatch = EMAIL_FROM.match(/<(.+)>/) || [null, EMAIL_FROM];
          emailFrom = `${settings.business_name} <${(emailMatch[1] || EMAIL_FROM).trim()}>`;
        }

        const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
        const emailHtml = generateEmailHtml('CONFIRMATION', payload, settings, originUrl);
        
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [client_email],
            subject: `Confirmación de Turno - ${settings.business_name}`,
            html: emailHtml
          })
        }).then(res => res.json()).then(data => {
          if (data.id) console.log(`[Webhook] Correo enviado: ${data.id}`);
          else console.warn(`[Webhook] Falló envío de correo:`, data);
        }).catch(e => console.warn('[Webhook] Error red correo:', e.message));
      }

      const WA_SERVER_URL = process.env.VITE_WA_SERVER_URL || process.env.WA_SERVER_URL;
      const WA_API_KEY = process.env.WA_API_KEY || process.env.VITE_WA_API_KEY;
      if (WA_SERVER_URL && client_phone) {
        const originUrl = process.env.VITE_SITE_URL || ('https://' + req.headers.host) || '';
        const waMsg = generateWhatsAppMessage('CONFIRMATION', payload, settings, originUrl);
        const headers = { 'Content-Type': 'application/json' };
        if (WA_API_KEY) headers['x-api-key'] = WA_API_KEY;

        await fetch(`${WA_SERVER_URL}/api/wa/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ phone: client_phone, message: waMsg })
        }).catch(e => console.warn('[Webhook] Servidor WA no disponible:', e.message));
      }
    } catch (notifErr) {
      console.error('[Webhook] Error enviando notificaciones:', notifErr.message);
    }

    return res.status(200).send('Booking created successfully');

  } catch (err) {
    console.error('[Webhook] Error general:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
