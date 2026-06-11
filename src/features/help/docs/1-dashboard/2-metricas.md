# Explicación de Métricas Clave

En la parte superior del Dashboard encontrarás cinco indicadores financieros y operativos diseñados para medir la salud diaria de tu negocio.

![Métricas Clave](/help/images/1-dashboard/2-metricas.webp)

## 1. Turnos de Hoy
Muestra la cantidad de citas agendadas para el día de hoy.
- **Detalle adicional:** Debajo del número principal verás indicadores con los turnos programados en total para la **semana** y el **mes** actual.
- **Utilidad:** Te permite prever rápidamente el flujo de trabajo diario y organizar al personal o insumos según la carga laboral.

## 2. Clientes Registrados
Indica la cantidad acumulada de clientes en tu base de datos.
- **Funcionamiento:** Cada cliente se identifica de forma única mediante su correo electrónico. No requiere registro manual por su parte; se crea automáticamente con su primera reserva.
- **Utilidad:** Mide el crecimiento de tu cartera de clientes activos a lo largo del tiempo.

## 3. Ingresos por Señas
Representa los montos cobrados digitalmente por adelantado.
- **Funcionamiento:** Suma el importe de todas las señas pagadas y validadas a través de Mercado Pago para turnos en estados: `Confirmado`, `Reprogramado`, `Completado` o `Ausente`.
- **Exclusión:** Excluye reservas canceladas o pendientes de pago.

## 4. Ingresos Totales (Estimado)
Es una estimación del ingreso bruto total que generará el negocio en el período.
- **Cálculo:** 
  - Para turnos con estado `Completado`, se suma el **precio total del servicio** (asumiendo que el cliente abonó el saldo restante en efectivo/tarjeta en el local).
  - Para turnos en estado `Confirmado`, `Reprogramado` o `Ausente`, solo se contabiliza el **monto de la seña** cobrada en la web.
- **Exclusión:** Excluye reservas canceladas.

## 5. Tasa de Asistencia (Ratio de Presencia)
Indica la proporción de reservas que fueron atendidas exitosamente por el negocio.
- **Cálculo:** Se calcula mediante la fórmula `(Turnos Completados / [Turnos Completados + Ausentes]) * 100`.
- **Utilidad:** Te ayuda a visualizar el porcentaje de efectividad de las citas agendadas y monitorear si el ausentismo (No Show) está afectando la rentabilidad de las franjas horarias libres.

> [!IMPORTANT]
> El valor de "Ingresos Totales (Estimado)" es proyectado. Puede variar durante el día si un turno pasa a completado (sumando el total) o si el cliente no asiste (computando únicamente la seña cobrada en línea). En los casos de servicios con **Precio en $0 (sin definir)**, al completarse se sumará el monto exacto cobrado que el administrador ingrese manualmente.
