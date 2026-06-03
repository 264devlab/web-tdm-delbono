# WA Server — Tienda de Mascotas Del Bono

Servidor Express + Baileys para notificaciones de WhatsApp en tiempo real.

## Instalación

```bash
cd server
npm install
```

## Iniciar en Desarrollo

```bash
node index.js
```

## Iniciar Persistente con PM2 (producción en Windows)

```bash
npm install -g pm2
pm2 start index.js --name tdm-wa-server
pm2 save
pm2 startup
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/wa/status` | Estado de conexión y QR (base64) |
| POST | `/api/wa/disconnect` | Desconectar y borrar sesión |
| POST | `/api/wa/reconnect` | Reconectar manualmente |
| POST | `/api/wa/send` | Enviar mensaje (`{ phone, message }`) |
| GET | `/api/health` | Health check del servidor |

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WA_SERVER_PORT` | `3001` | Puerto del servidor Express |

## Notas importantes

- La sesión de WhatsApp se guarda en `./wa_session/`. **No subir a git.**
- Al reiniciar el servidor, Baileys reconecta automáticamente sin necesitar el QR de nuevo.
- Si el número fue desconectado manualmente desde el celular, se debe usar el endpoint `/reconnect` o reiniciar el servidor para obtener un nuevo QR.
