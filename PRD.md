# PETSHOP BOOKING SYSTEM

## Product Requirements Document (PRD)

Version: 1.0

---

# 1. DESCRIPCIÓN GENERAL

Desarrollar una aplicación web para gestión de turnos de una petshop que ofrece servicios de baño, peluquería y otros servicios relacionados.

El sistema deberá permitir:

* Reservas online por parte de clientes.
* Pago de señas mediante Mercado Pago.
* Gestión administrativa de turnos.
* Gestión de clientes.
* Configuración flexible de servicios.
* Recordatorios automáticos por correo electrónico y WhatsApp.
* Estadísticas y reportes.

El sistema debe estar diseñado para ser multi-dispositivo y responsive.

---

# 2. STACK TECNOLÓGICO

## Frontend

* React
* React Router
* TypeScript
* Vite
* React Hook Form
* Zod
* TanStack Query
* TailwindCSS
* Shadcn UI

## Backend

* Supabase

Utilizar:

* PostgreSQL
* Authentication
* Storage
* Edge Functions

## Servicios Externos

### Mercado Pago

Uso:

* Cobro de señas
* Webhooks de confirmación

### Resend

Uso:

* Confirmaciones
* Recordatorios
* Cancelaciones
* Reprogramaciones

### WhatsApp

Primera versión:

* Baileys

Uso:

* Recordatorios
* Confirmaciones

---

# 3. DISEÑO VISUAL

Toda la interfaz debe respetar estrictamente las reglas definidas en:

DESIGN.md

El archivo DESIGN.md tiene prioridad sobre cualquier decisión visual tomada por la IA.

Nunca generar componentes que contradigan dicho documento.

---

# 4. ROLES DEL SISTEMA

## Administrador

Cantidad máxima:

1

Permisos:

* Gestión completa
* Configuración del sistema
* Gestión de turnos
* Gestión de clientes
* Estadísticas
* Configuración visual

---

# 5. MÓDULOS

## Módulo Público

### Landing de Reserva

Permite:

* Seleccionar servicio
* Seleccionar fecha
* Seleccionar horario
* Completar datos
* Pagar seña
* Confirmar reserva

No requiere login.

---

## Módulo Administrativo

Acceso mediante autenticación.

Permite:

* Dashboard
* Gestión de categorías
* Gestión de servicios
* Gestión de clientes
* Gestión de turnos
* Configuración
* Reportes

---

# 6. GESTIÓN DE CLIENTES

Los clientes NO deben registrarse.

El correo electrónico será la clave única.

## Flujo

1. Cliente ingresa correo.
2. Buscar cliente existente.
3. Si existe:

Autocompletar:

* Nombre
* Apellido
* Teléfono

4. Si no existe:

Solicitar:

* Nombre
* Apellido
* Teléfono

Crear registro automáticamente.

## Datos del Cliente

* id
* email
* first_name
* last_name
* phone
* created_at
* updated_at

---

# 7. GESTIÓN DE CATEGORÍAS

Una categoría agrupa servicios.

Ejemplos:

* Baño
* Peluquería
* Tratamientos

Campos:

* id
* name
* description
* active
* created_at

---

# 8. GESTIÓN DE SERVICIOS

Cada servicio debe poder configurarse independientemente.

Campos:

* id
* category_id
* name
* description
* image_url
* estimated_duration_minutes
* active

## Configuración de Disponibilidad

* enabled_monday
* enabled_tuesday
* enabled_wednesday
* enabled_thursday
* enabled_friday
* enabled_saturday
* enabled_sunday

## Horarios

Permitir múltiples franjas.

Ejemplo:

08:00 - 12:00

15:00 - 19:00

## Turnos Simultáneos

Campo:

max_concurrent_bookings

Ejemplo:

2

Si existen dos turnos para las 10:00:

No permitir generar un tercero.

## Señas

Campos:

requires_deposit
deposit_amount

## Reprogramación

Campos:

allow_reschedule

reschedule_limit_hours

Ejemplo:

12

---

# 9. FERIADOS Y BLOQUEOS

Debe existir una configuración global.

Permitir:

* Crear feriados
* Crear días especiales
* Bloquear fechas
* Bloquear horarios específicos

Campos:

* date
* start_time
* end_time
* reason

---

# 10. RESERVAS

Estados posibles:

PENDING_PAYMENT

CONFIRMED

CANCELLED

RESCHEDULED

COMPLETED

NO_SHOW

## Campos

* id
* client_id
* service_id
* booking_date
* booking_time
* duration
* deposit_amount
* payment_id
* status
* notes
* created_at

---

# 11. GENERACIÓN DE DISPONIBILIDAD

La disponibilidad debe calcularse dinámicamente considerando:

* Días habilitados
* Horarios habilitados
* Feriados
* Bloqueos
* Duración del servicio
* Capacidad simultánea
* Turnos existentes

Nunca mostrar horarios no reservables.

---

# 12. MERCADO PAGO

## Flujo

1. Cliente confirma turno.
2. Sistema genera preferencia.
3. Cliente realiza pago.
4. Mercado Pago envía webhook.
5. Sistema valida webhook.
6. Turno pasa a CONFIRMED.

Nunca confirmar turnos únicamente desde frontend.

La confirmación debe depender del webhook.

---

# 13. RECORDATORIOS

## Correo

Proveedor:

Resend

Enviar:

* Confirmación
* Reprogramación
* Cancelación
* Recordatorio

## Programación

Recordatorio automático:

24 horas antes

Configuración futura:

12 horas antes
48 horas antes

---

# 14. WHATSAPP

Proveedor inicial:

Baileys

Enviar:

* Confirmación
* Reprogramación
* Cancelación
* Recordatorio

La implementación debe estar desacoplada para permitir migración futura a WhatsApp Cloud API.

Crear interfaz:

NotificationProvider

Implementaciones:

* EmailProvider
* WhatsAppProvider

---

# 15. ARCHIVO DE CALENDARIO

Al confirmar un turno generar archivo ICS.

Permitir:

* Descargar
* Importar a Google Calendar
* Importar a Apple Calendar

Datos incluidos:

* Fecha
* Hora
* Servicio
* Duración
* Ubicación

---

# 16. DASHBOARD

Mostrar:

* Turnos del día
* Turnos de la semana
* Turnos del mes
* Clientes registrados
* Servicios más solicitados
* Ingresos por señas
* Próximos turnos

---

# 17. CALENDARIO ADMINISTRATIVO

Vista:

* Día
* Semana
* Mes

Acciones:

* Ver detalle
* Cancelar
* Crear manualmente
* Reprogramar

---

# 18. EXPORTACIONES

Formato:

Excel (.xlsx)

Reportes:

* Clientes
* Turnos
* Servicios
* Ingresos

---

# 19. CONFIGURACIÓN DEL NEGOCIO

Campos:

* business_name
* logo_url
* primary_color
* secondary_color
* address
* phone
* email
* whatsapp
* facebook
* instagram

---

# 20. SEGURIDAD

Implementar:

* Row Level Security
* Validación backend
* Protección CSRF
* Rate limiting
* Sanitización de inputs
* Validaciones con Zod

Nunca confiar en validaciones frontend.

---

# 21. PERFORMANCE

Objetivos:

* Lighthouse > 90
* First Load < 3s
* Mobile First

---

# 22. ESTRUCTURA DE CARPETAS

src/

app/

components/

features/

bookings/

clients/

services/

categories/

dashboard/

calendar/

reports/

settings/

hooks/

lib/

types/

schemas/

services/

pages/

---

# 23. CRITERIOS DE ACEPTACIÓN

El sistema estará terminado cuando:

* Se puedan reservar turnos online.
* Se puedan cobrar señas mediante Mercado Pago.
* Se envíen correos automáticos.
* Se envíen mensajes de WhatsApp.
* Se respeten capacidades simultáneas.
* Se respeten feriados y bloqueos.
* Exista calendario administrativo.
* Existan estadísticas básicas.
* Existan exportaciones Excel.
* Se genere archivo ICS.
* Todo el sistema sea responsive.
* Todo el diseño cumpla DESIGN.md.

---

# 24. FUNCIONALIDADES FUERA DE ALCANCE (V1)

No incluir:

* Multi sucursal
* Multi administrador
* Aplicación móvil nativa
* Programa de fidelización
* Facturación electrónica
* Pasarela de pagos adicional
* Integración con ERP
* Integración con AFIP
* Gestión de stock
* Venta online de productos

Estas funcionalidades podrán desarrollarse en futuras versiones.
