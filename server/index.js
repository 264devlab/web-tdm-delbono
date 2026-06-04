'use strict';

const path = require('path');
// Cargar variables de entorno de la raíz o locales
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

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
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_Yu9J2Bjp_AAZSvJQpUvcKMKSftCEs66p9';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Tienda de Mascotas Del Bono <turnos@noreply.264devlab.com.ar>';

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
