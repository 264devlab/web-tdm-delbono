# Historial y Reputación del Cliente

La ficha de cliente consolida toda su actividad en la petshop. Esto te permite conocer mejor a tus clientes habituales y detectar aquellos que generan problemas recurrentes de inasistencias.

![Detalle de Cliente](/help/images/4-clientes/2-historial-y-reputacion.webp)

## Historial de Reservas
Al ingresar al detalle de un cliente, verás una lista cronológica con todas sus citas pasadas y futuras. Cada registro detalla:
- La fecha y hora de la cita.
- El servicio realizado.
- El costo del servicio.
- El estado final de la cita (ej. Completado, Cancelado, Ausente).
- Notas guardadas en ese turno específico.

## Cómo se Calcula la Reputación (Alerta de Inasistencia)
La reputación es un indicador automático que evalúa el nivel de cumplimiento y puntualidad de las citas. A diferencia de las clasificaciones fijas, el sistema utiliza un cálculo porcentual dinámico:
- ⚠️ **Etiqueta "Alerta Inasistencias (X%)":** Se activa cuando el cliente cumple con dos condiciones concurrentes:
  1. Registra **al menos 2 turnos totales** (historial mínimo).
  2. Su **tasa de inasistencia es igual o mayor al 30%** (es decir, el 30% o más de sus citas se marcaron como `Ausente`).
- **Sin Advertencia:** Si el cliente tiene una tasa de inasistencia por debajo del 30% o tiene menos de 2 turnos totales cargados.

> [!NOTE]
> La fórmula aplicada es: `Tasa = (Turnos Ausentes / Turnos Totales)`. Las citas con estado `Cancelado` por el cliente con la debida anticipación no se contabilizan como ausencias y no afectan negativamente su tasa de reputación. Únicamente los turnos finalizados como `Ausente` (inasistencias sin previo aviso) aumentan el porcentaje de alerta.
