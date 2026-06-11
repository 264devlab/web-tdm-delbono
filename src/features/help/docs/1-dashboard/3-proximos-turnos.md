# Cola de Próximos Turnos y Reputación

Esta sección despliega de forma secuencial los turnos agendados para el día actual, ordenados por hora de inicio. Permite hacer un seguimiento directo del trabajo a medida que transcurre la jornada.

![Sección de Próximos Turnos](/help/images/1-dashboard/3-proximos-turnos.webp)

## Datos Disponibles por Turno
Cada tarjeta de turno muestra de forma resumida:
- **Hora de inicio:** La hora exacta del turno.
- **Cliente:** Nombre completo del cliente, correo electrónico y número de teléfono.
- **Servicio:** Nombre del servicio solicitado (ej. Baño Grande, Peluquería Canina).
- **Estado del pago:** Indicativo visual si la seña fue cobrada en línea.

## Reputación del Cliente (Alerta de Inasistencia)
Al lado del nombre del cliente en la cola de turnos, el sistema realiza un análisis de su historial de reservas y puede mostrar una advertencia si el cliente es conflictivo:
- ⚠️ **Alerta (Rojo - ej: "Alerta: 40% ausencias"):** Se muestra únicamente cuando el cliente tiene **al menos 2 turnos totales** registrados en el sistema, y su **tasa de inasistencia (No-Show) es del 30% o superior**.
- **Sin Etiqueta (Normal):** Clientes con una tasa de inasistencia inferior al 30% o clientes nuevos que aún no tienen un historial suficiente para ser evaluados.

> [!WARNING]
> La tasa de inasistencia se calcula dividiendo el número de turnos marcados como `Ausente` por el número de turnos totales del cliente (`ausencias / total`). Si un cliente muestra el cartel de alerta `⚠️ Alerta`, es muy recomendable que verifiques su reserva telefónicamente o apliques políticas más estrictas antes de su cita.
