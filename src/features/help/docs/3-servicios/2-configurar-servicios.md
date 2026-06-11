# Alta y Configuración de Servicios

Cada servicio que ofrece tu petshop se configura de forma individual para adaptar su precio, duración, políticas de señas y reprogramación.

![Configuración de Servicio](/help/images/3-servicios/2-configurar-servicios.webp)

## Parámetros Principales de un Servicio

### 1. Datos Básicos e Información General
- **Nombre:** Nombre comercial del servicio (ej. "Corte Higiénico + Baño").
- **Categoría:** La categoría a la que pertenece el servicio.
- **Descripción:** Qué incluye (ej. "Lavado con champú neutro, corte de uñas, limpieza de oídos y secado").
- **Servicio Activo (Interruptor):** 
  - Si está **Activo (Verde)**, los clientes podrán visualizarlo y reservarlo en la landing de turnos.
  - Si está **Inactivo (Gris)**, el servicio se oculta de la web pública pero se conserva en la base de datos sin afectar a los turnos históricos ya agendados.
- **Precio Total:** El valor total del servicio.
  - *Caso especial ($0):* Si dejas el precio en `$0`, el sistema lo interpretará como un **servicio con precio flexible / variable** (en la web del cliente dirá "Precio: Sin definir"). Esto te permite agendar el turno y, al momento de completarlo en el local, ingresar manualmente el precio exacto cobrado según las características físicas de la mascota.
- **Duración Estimada:** Tiempo de duración en minutos (ej: 60). Determina el tamaño de la franja horaria que ocupará el turno en la agenda.

### 2. Días Habilitados y Capacidad Simultánea
- **Días Habilitados:** Botones redondos con las iniciales de los días de la semana (L, M, M, J, V, S, D). Al presionarlos, seleccionas qué días de la semana está disponible el servicio para reserva.
- **Simultáneos (Capacidad):** Define la cantidad de turnos que pueden tomarse en paralelo para la misma hora. Si se establece en `1`, el horario se bloquea tras la primera reserva. Si se establece en `2` o más, el sistema permitirá múltiples turnos simultáneos hasta alcanzar el límite.

### 3. Gestión de Señas (Depósitos)
Para evitar pérdidas por cancelaciones o inasistencias de clientes, puedes exigir el pago de una seña en línea:
- **Requiere Seña (Interruptor):** Si lo activas, el cliente estará obligado a abonar una seña a través de Mercado Pago para poder confirmar el turno.
- **Monto de la Seña:** Define un valor fijo (ej: $5000) o un porcentaje del valor total del servicio.
  - *Nota:* Si el precio total se deja en `$0`, puedes ingresar una seña fija de depósito (ej: $2000) para garantizar el compromiso de asistencia, cobrando la diferencia variable en persona.
- *Nota:* Si el interruptor está desactivado, el turno se confirmará de forma inmediata en la web sin requerir pasarela de pago.

### 4. Límites de Reprogramación
- **Permitir Reprogramar (Interruptor):** Habilita al cliente a cambiar el día y hora de su turno desde el enlace enviado a su correo/WhatsApp.
- **Límite de Horas de Anticipación:** Plazo máximo de horas previas al turno en el cual el cliente puede reprogramarlo de forma autónoma (ej: 12 horas antes). Pasado este límite, el cliente deberá comunicarse con el negocio por teléfono para que el administrador evalúe si realiza el cambio manualmente.

> [!IMPORTANT]
> Los cambios aplicados a un servicio (duración, precio o señas) solo tienen efecto sobre las **nuevas reservas** que se realicen a partir de ese momento. Los turnos que ya fueron agendados previamente conservan el precio y duración con los que fueron creados. En servicios con precio en `$0`, la validación de que el precio sea mayor a la seña se omite.
