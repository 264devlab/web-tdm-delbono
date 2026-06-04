# Tecnologías y Arquitectura del Sistema de Reservas

Este documento detalla el stack tecnológico implementado en producción para la **Tienda de Mascotas Del Bono**, junto con un diagrama explicativo sobre el flujo e integración de los componentes del sistema.

---

## 1. Stack Tecnológico (Producción)

El sistema está construido siguiendo una arquitectura moderna de tres capas (Frontend, Backend-as-a-Service y Servidores de Notificación/Pagos):

### Frontend (Cliente Administrativo y Público)
*   **React (v19) & TypeScript:** Biblioteca principal para la creación de interfaces de usuario interactivas, seguras ante tipos y modulares.
*   **Vite:** Herramienta de compilación rápida y servidor de desarrollo.
*   **TailwindCSS (v4):** Framework de diseño utilitario para la maquetación responsiva, permitiendo un diseño premium y adaptado a dispositivos móviles.
*   **Lucide React:** Set de iconos limpios y vectoriales utilizados en los botones y métricas.
*   **Supabase Client (@supabase/supabase-js):** Cliente oficial para interactuar de forma segura con la base de datos de manera directa desde el frontend utilizando políticas de seguridad a nivel de fila (RLS).

### Backend & Almacenamiento (Supabase)
*   **PostgreSQL (Database):** Base de datos relacional robusta en la nube de Supabase. Almacena las tablas de clientes, servicios, turnos, feriados, bloqueos y configuración empresarial.
*   **Autenticación (Supabase Auth):** Control de acceso exclusivo para la sección administrativa por medio de autenticación JWT.
*   **Row Level Security (RLS):** Capa crítica de seguridad a nivel de base de datos. Permite que el público solo realice lecturas/creaciones limitadas, mientras que el administrador autenticado tiene control total sobre las tablas.

### Servicios Externos y Notificaciones (Backend Local / Cloud)
*   **Mercado Pago API (SDK):** Pasarela encargada del cobro electrónico de las señas. Funciona mediante webhooks que notifican la confirmación del pago de manera asíncrona.
*   **Resend (API):** Servicio especializado de envío masivo de correos electrónicos transaccionales para confirmaciones, recordatorios de 24 horas y cancelaciones.
*   **Baileys (WhatsApp Web API):** Servidor independiente de Node.js que emula un cliente de WhatsApp Web, permitiendo despachar mensajes automatizados de texto a los celulares de los clientes de manera directa.

---

## 2. Diagrama de Arquitectura y Flujos

A continuación se presenta un diagrama de flujo en texto plano (formato ASCII) que visualiza las conexiones e interacciones de las tecnologías del sistema cuando un cliente realiza una reserva:

```text
               +--------------------------------------+
               |        👤 CLIENTE (Navegador)        |
               +--------------------------------------+
                                  |
                        (1. Ingresa a la Web /
                         2. Obtiene disponibilidad)
                                  v
               +--------------------------------------+
               |    💻 FRONTEND WEB (React / Vite)    |
               +--------------------------------------+
                   |                              |
      (4. Crea preferencia)              (3. Confirma turno /
                   |                      5. Obtiene datos)
                   v                              v
+-----------------------+              +-----------------------+
|  💳 MERCADO PAGO      |              |   🗄️ SUPABASE CLOUD    |
|  (Pasarela de pagos)  |              |  (PostgreSQL + RLS)   |
+-----------------------+              +-----------------------+
           |                                      ^
   (6. Envía Webhook                              |
      de pago exitoso)                     (8. Actualiza estado
           |                                  de la reserva)
           v                                      |
+-------------------------------------------------+------------+
|            ⚙️ SERVIDOR NODE.JS (Express / Baileys)           |
+--------------------------------------------------------------+
         |                                             |
  (9. Alerta Email)                             (9. Alerta WhatsApp)
         v                                             v
+-----------------------+                      +-----------------------+
|   📧 RESEND API       |                      |  💬 WHATSAPP (Baileys)|
+-----------------------+                      +-----------------------+
         |                                             |
         +----------------------+----------------------+
                                |
                                v
               +--------------------------------------+
               |        👤 CLIENTE (Notificado)        |
               +--------------------------------------+
```

---

## 3. Funcionamiento de Flujos Clave

### Flujo de Reserva y Pago Asíncrono
1. El cliente ingresa a la aplicación web y el frontend consulta a **Supabase** los servicios, horarios y turnos bloqueados para calcular la disponibilidad dinámica.
2. El cliente selecciona una fecha, completa sus datos y es redirigido a **Mercado Pago** para abonar la seña configurada para el servicio.
3. Mercado Pago procesa la transacción y envía una notificación HTTP (Webhook) al **Servidor Node.js (Express)**.
4. El servidor verifica la autenticidad del pago con la API de Mercado Pago. Si es exitoso, actualiza el estado del turno a `CONFIRMED` en la base de datos de **Supabase**.
5. Al confirmarse el turno, el servidor dispara llamados asíncronos a las APIs de **Resend** (email transaccional) y **Baileys** (mensajes de WhatsApp) para notificar al cliente su reserva exitosa adjuntando un enlace para reprogramación e instrucciones.

### Flujo del Dashboard Administrativo
1. El administrador inicia sesión de manera segura con **Supabase Auth**.
2. Al ingresar al Dashboard, el cliente React consulta a **Supabase** y calcula en memoria las estadísticas del negocio (ingresos de señas por Mercado Pago, ingresos presenciales estimados de turnos `COMPLETED`, tasa de asistencia y volumen de turnos).
3. Si la fecha y hora de algún turno confirmado pasó y aún no se cerró, el panel lo resalta para que el administrador lo clasifique como **Completado** (sumando el dinero restante de la cita a los ingresos totales) o **Ausente** (reteniendo solo el cobro de la seña).
