# Recordatorios y Mensajes Automáticos

Una vez que has vinculado exitosamente tu línea de WhatsApp, el sistema se encarga de despachar notificaciones automáticas según las acciones que ocurran en la plataforma. Esto reduce drásticamente el ausentismo de los clientes y mejora la comunicación.

![Notificaciones Automáticas](/help/images/6-whatsapp/2-recordatorios-automaticos.webp)

## Tipos de Notificaciones y Momentos de Envío

### 1. Confirmación de Turno (Inmediata)
- **Cuándo se envía:** Al instante en que el cliente completa el pago de su seña en la web o cuando el administrador registra un turno manual en el calendario.
- **Contenido:** Detalle del servicio, precio, seña abonada, fecha, hora, dirección del local y un botón/enlace para gestionar la reserva (descargar archivo de calendario o reprogramar).

### 2. Modificación o Reprogramación (Inmediata)
- **Cuándo se envía:** Cuando el administrador o el cliente realizan un cambio de día o de horario para un turno existente.
- **Contenido:** Aviso del cambio y el nuevo detalle con la nueva fecha y hora agendada.

### 3. Recordatorio de Turno (24 horas antes)
- **Cuándo se envía:** El sistema ejecuta un proceso automático en segundo plano que detecta los turnos programados para el día siguiente y les envía un recordatorio.
- **Contenido:** "Hola [Nombre], te recordamos que mañana tienes un turno para [Servicio] a las [Hora] en [Petshop]...". Incluye las condiciones de cancelación/reprogramación.

### 4. Cancelación de Turno (Inmediata)
- **Cuándo se envía:** Cuando una reserva pasa al estado `Cancelado`.
- **Contenido:** Notificación de que el espacio ha sido liberado e invitación a reservar un nuevo horario en el futuro si lo desea.

> [!NOTE]
> Todos los mensajes automáticos también se despachan por **correo electrónico** al email proporcionado por el cliente, sirviendo como un canal de respaldo seguro en caso de que el cliente no disponga de WhatsApp o falle el envío en línea.
