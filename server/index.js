'use strict';

const path = require('path');
// Cargar variables de entorno de la raíz o locales
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

const { MercadoPagoConfig, Preference } = require('mercadopago');
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || ''
});

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.WA_SERVER_PORT || 3001;
const SESSION_DIR = path.join(__dirname, 'wa_session');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS !== '*' 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : '*';
const WA_API_KEY = process.env.WA_API_KEY || null;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Notificaciones <onboarding@resend.dev>';

// Pino logger silencioso para baileys (evita spam de logs internos)
const logger = pino({ level: 'silent' });

// ─── State ───────────────────────────────────────────────────────────────────
let waSocket = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting_qr' | 'connected'
let currentQRBase64 = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

// ─── Express Setup ───────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clearSession() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('[WA] Sesion eliminada.');
  } catch (err) {
    console.error('[WA] Error al eliminar sesion:', err.message);
  }
}

// ─── Baileys ─────────────────────────────────────────────────────────────────
async function startBaileys() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  connectionStatus = 'connecting';
  console.log('[WA] Iniciando conexion con WhatsApp...');

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    console.log(`[WA] Version WA obtenida: ${version.join('.')}`);
  } catch (err) {
    // Fallback a version conocida-estable si no hay acceso a internet
    version = [2, 3000, 1023100587];
    console.warn('[WA] No se pudo obtener version online. Usando fallback:', version.join('.'));
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  waSocket = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 30000,
  });

  waSocket.ev.on('creds.update', saveCreds);

  waSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WA] QR generado. Esperando escaneo desde el panel admin...');
      connectionStatus = 'waiting_qr';
      try {
        currentQRBase64 = await qrcode.toDataURL(qr);
      } catch (err) {
        console.error('[WA] Error generando QR base64:', err.message);
      }
    }

    if (connection === 'open') {
      console.log('[WA] Conectado a WhatsApp correctamente!');
      connectionStatus = 'connected';
      currentQRBase64 = null;
      reconnectAttempts = 0;
    }

    if (connection === 'close') {
      currentQRBase64 = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = !loggedOut;

      console.log(`[WA] Conexion cerrada. Codigo: ${statusCode}. Reconectar: ${shouldReconnect}`);

      if (loggedOut) {
        console.log('[WA] Sesion expirada (logged out). Limpiando credenciales...');
        connectionStatus = 'disconnected';
        waSocket = null;
        clearSession();
        return;
      }

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        connectionStatus = 'connecting';
        const delay = 3000 * reconnectAttempts;
        console.log(`[WA] Reintentando en ${delay / 1000}s... (${reconnectAttempts}/${MAX_RECONNECT})`);
        setTimeout(() => startBaileys(), delay);
      } else {
        connectionStatus = 'disconnected';
        waSocket = null;
        console.log('[WA] Se agotaron los reintentos. Estado: disconnected.');
      }
    }
  });
}

// ─── REST Endpoints ───────────────────────────────────────────────────────────

/** GET /api/health */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: connectionStatus, uptime: Math.floor(process.uptime()) });
});

/** GET /api/wa/status → { status, qr, connected } */
app.get('/api/wa/status', (_req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQRBase64 || null,
    connected: connectionStatus === 'connected',
  });
});

/** POST /api/wa/disconnect */
app.post('/api/wa/disconnect', async (_req, res) => {
  try {
    if (waSocket) {
      try { await waSocket.logout(); } catch (_) { /* ignorar error de red */ }
      waSocket = null;
    }
    clearSession();
    connectionStatus = 'disconnected';
    currentQRBase64 = null;
    reconnectAttempts = MAX_RECONNECT; // prevenir auto-reconexion
    res.json({ success: true, message: 'Sesion desconectada.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/wa/reconnect */
app.post('/api/wa/reconnect', async (_req, res) => {
  if (['connected', 'connecting', 'waiting_qr'].includes(connectionStatus)) {
    return res.json({ success: false, message: `Ya en estado: ${connectionStatus}` });
  }
  reconnectAttempts = 0;
  // Arrancar en background, no bloquear la respuesta HTTP
  startBaileys().catch(err => {
    console.error('[WA] Error en reconnect:', err.message);
    connectionStatus = 'disconnected';
  });
  res.json({ success: true, message: 'Reconexion iniciada.' });
});

function normalizePhoneForWhatsApp(phone) {
  let cleaned = String(phone).replace(/\D/g, '');

  // Si empieza con 0, lo removemos (ej. 0264... -> 264...)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Reglas para Argentina (código de país 54, los móviles de WhatsApp llevan 9 antes de la característica)
  if (cleaned.startsWith('54')) {
    let rest = cleaned.substring(2);
    if (!rest.startsWith('9')) {
      cleaned = '549' + rest;
    }
  } else if (cleaned.length === 10) {
    // Formato local sin código de país (ej. 2645012345)
    cleaned = '549' + cleaned;
  } else if (cleaned.length === 12 && cleaned.substring(3, 5) === '15') {
    // Formato local con '15' (ej. 264155012345)
    cleaned = '549' + cleaned.substring(0, 3) + cleaned.substring(5);
  } else if (cleaned.length >= 8 && cleaned.length <= 11) {
    if (cleaned.startsWith('15')) {
      cleaned = cleaned.substring(2);
    }
    cleaned = '549' + cleaned;
  }

  // Eliminar el prefijo móvil interno '15' de números argentinos de WhatsApp si existiese
  if (cleaned.startsWith('549')) {
    let body = cleaned.substring(3);
    if (body.length === 12) {
      if (body.substring(3, 5) === '15') {
        body = body.substring(0, 3) + body.substring(5);
      } else if (body.substring(2, 4) === '15') {
        body = body.substring(0, 2) + body.substring(4);
      } else if (body.substring(4, 6) === '15') {
        body = body.substring(0, 4) + body.substring(6);
      }
    }
    cleaned = '549' + body;
  }

  return cleaned;
}

/** POST /api/wa/send — { phone: "5492646XXXXXXX", message: "..." } */
app.post('/api/wa/send', async (req, res) => {
  // Validar API Key si está configurada en las variables de entorno
  if (WA_API_KEY) {
    const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
    if (incomingKey !== WA_API_KEY) {
      return res.status(401).json({ success: false, error: 'Unauthorized: API Key no autorizada.' });
    }
  }

  const { phone, message } = req.body || {};

  if (!phone || !message) {
    return res.status(400).json({ success: false, error: 'Faltan parametros: phone y message.' });
  }

  if (connectionStatus !== 'connected' || !waSocket) {
    return res.status(503).json({
      success: false,
      error: `WhatsApp no conectado (estado: ${connectionStatus}).`,
    });
  }

  try {
    const normalized = normalizePhoneForWhatsApp(phone);
    const jid = `${normalized}@s.whatsapp.net`;
    await waSocket.sendMessage(jid, { text: message });
    console.log(`[WA] Mensaje enviado a ${normalized}`);
    res.json({ success: true, to: normalized });
  } catch (err) {
    console.error('[WA] Error al enviar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/email/send — { to: "...", subject: "...", html: "..." } */
app.post('/api/email/send', async (req, res) => {
  // Validar API Key si está configurada en las variables de entorno
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

  try {
    let emailFrom = EMAIL_FROM;
    try {
      const { data: settings } = await supabase.from('business_settings').select('business_name').limit(1);
      if (settings && settings.length > 0 && settings[0].business_name) {
        const emailMatch = EMAIL_FROM.match(/<(.+)>/) || [null, EMAIL_FROM];
        const actualEmail = (emailMatch[1] || EMAIL_FROM).trim();
        emailFrom = `${settings[0].business_name} <${actualEmail}>`;
      }
    } catch (e) {
      console.warn('[Email] Error loading business_name for email sender:', e.message);
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'User-Agent': 'petshop-delbono/1.0'
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();
    if (response.ok) {
      console.log(`[Email] Correo enviado a ${to} con ID: ${data.id}`);
      res.json({ success: true, id: data.id });
    } else {
      console.error('[Email] Error de la API de Resend:', data);
      res.status(response.status).json({ success: false, error: data });
    }
  } catch (err) {
    console.error('[Email] Error en peticion:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/payment/create_preference */
app.post('/api/payment/create_preference', async (req, res) => {
  const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (WA_API_KEY && incomingKey !== WA_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: API Key no autorizada.' });
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('[Mercado Pago] MP_ACCESS_TOKEN no está configurado en las variables de entorno.');
    return res.status(500).json({
      success: false,
      error: 'Mercado Pago Access Token no configurado (MP_ACCESS_TOKEN).'
    });
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
    return res.status(400).json({ success: false, error: 'Faltan parámetros obligatorios para crear la preferencia.' });
  }

  try {
    const preference = new Preference(mpClient);
    const origin = req.headers.origin || 'http://localhost:5173';

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

    console.log(`[Mercado Pago] Preference created. ID: ${result.id}`);
    res.json({ success: true, id: result.id, init_point: result.init_point });
  } catch (err) {
    console.error('[Mercado Pago] Error al crear preferencia:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/payment/confirm_payment */
app.post('/api/payment/confirm_payment', async (req, res) => {
  const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (WA_API_KEY && incomingKey !== WA_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: API Key no autorizada.' });
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('[Mercado Pago] MP_ACCESS_TOKEN no está configurado en las variables de entorno.');
    return res.status(500).json({
      success: false,
      error: 'Mercado Pago Access Token no configurado (MP_ACCESS_TOKEN).'
    });
  }

  const { preferenceId, paymentId } = req.body || {};

  if (!preferenceId || !paymentId) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: preferenceId, paymentId' });
  }

  try {
    // 1. Check if booking already exists with this payment_id
    const { data: existingBookings, error: checkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('payment_id', paymentId);

    if (checkErr) throw checkErr;
    if (existingBookings && existingBookings.length > 0) {
      return res.json({ success: true, bookingId: existingBookings[0].id, alreadyProcessed: true });
    }

    // 2. Fetch preference details
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
      service_name,
      service_price,
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

    // 5. Insert booking as CONFIRMED
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

    res.json({
      success: true,
      bookingId: newBooking[0].id,
      metadata
    });
  } catch (err) {
    console.error('[Mercado Pago Confirm] Error al confirmar pago:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/settings/upload-logo */
app.post('/api/settings/upload-logo', (req, res) => {
  const incomingKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (WA_API_KEY && incomingKey !== WA_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: API Key no autorizada.' });
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

    const uploadsDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, newFileName);
    fs.writeFileSync(filePath, fileBuffer);

    console.log(`[Upload] Logo guardado en ${filePath}`);
    res.json({ success: true, logoUrl: `/uploads/${newFileName}` });
  } catch (err) {
    console.error('[Upload] Error al guardar logo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Start: Express primero, luego Baileys en background ─────────────────────
app.listen(PORT, () => {
  console.log(`\n[WA Server] Escuchando en http://localhost:${PORT}`);
  console.log('[WA Server] GET  /api/health');
  console.log('[WA Server] GET  /api/wa/status');
  console.log('[WA Server] POST /api/wa/disconnect');
  console.log('[WA Server] POST /api/wa/reconnect');
  console.log('[WA Server] POST /api/wa/send');
  console.log('[WA Server] POST /api/email/send\n');

  // Iniciar Baileys en background sin bloquear el servidor
  startBaileys().catch(err => {
    console.error('[WA] Error al iniciar Baileys:', err.message);
    connectionStatus = 'disconnected';
  });
});

process.on('uncaughtException', (err) => {
  console.error('[WA] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WA] Unhandled Rejection:', reason);
});
