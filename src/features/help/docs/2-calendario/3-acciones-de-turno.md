# Gestión y Acciones sobre Turnos Existentes

Al hacer clic sobre cualquier turno en el calendario, se abrirá una ventana emergente (modal) con los detalles completos de la reserva y las acciones administrativas disponibles.

![Acciones de Turno](/help/images/2-calendario/3-acciones-de-turno.webp)

## Acciones de Gestión de Estado

### 1. Cobrar Saldo y Completar
Cuando la mascota es retirada y el trabajo finaliza, el cliente abona el dinero restante en tu tienda.
- Al presionar **"Completar Turno"**, el sistema registra que el servicio fue finalizado con éxito.
- Si el turno requirió seña, el sistema te mostrará el saldo pendiente a cobrar (Precio Total - Seña).
- El estado de la reserva cambia a `Completado`, impactando positivamente en la reputación de asistencia del cliente.
- **Caso especial: Servicios con precio en $0 (sin definir):** Si completas un turno para un servicio cuyo precio base está configurado en `$0` en el catálogo, el sistema abrirá un modal emergente titulado **"Registrar Cobro de Turno"**. Deberás ingresar de forma manual el **monto cobrado en el local** (sin contemplar la seña, la cual se suma automáticamente si fue pagada por adelantado). Esto permite tener una facturación flexible y personalizada para cada animal en base al estado del pelaje, tamaño real u otros factores evaluados al recibirlo.

### 2. Registrar Inasistencia (No Show)
Si el cliente no asiste a su cita y no da aviso previo.
- Al presionar **"Registrar Inasistencia"**, el turno se archiva con el estado `Ausente`.
- Esto penaliza la reputación del cliente en su ficha histórica.

### 3. Reprogramar Turno
Si el cliente solicita un cambio de fecha u hora.
- Presiona **"Reprogramar"**, selecciona la nueva fecha e indica el nuevo horario disponible.
- El estado pasará a `Reprogramado` y se enviará una notificación por WhatsApp/Email al cliente con los nuevos datos de su cita.

### 4. Cancelar Reserva
Si el cliente desiste del servicio o necesitas liberar el espacio.
- Al cancelar, el espacio de la agenda vuelve a quedar libre en la web pública.
- El estado pasa a `Cancelado`.
- Si el cliente pagó una seña, ten en cuenta que el sistema no realiza devoluciones de dinero de forma automática; deberás gestionar el reembolso manualmente desde tu cuenta de Mercado Pago si así lo deseas.

> [!WARNING]
> Ten cuidado al cancelar reservas. Una vez cancelada, no se puede revertir su estado; si el cliente se arrepiente, deberás agendar un nuevo turno de forma manual o solicitarle que reserve nuevamente.
