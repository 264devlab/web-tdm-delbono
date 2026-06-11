# Creación Manual de Turnos

A diferencia de los clientes que reservan de forma autónoma desde la landing web, el administrador tiene la capacidad de registrar turnos de forma manual. Esto es fundamental para agendar citas recibidas por llamada telefónica, mensajes de redes sociales o clientes que se presentan directamente en el local.

![Crear Turno Manualmente](/help/images/2-calendario/2-creacion-manual.webp)

## Procedimiento paso a paso
1. Haz clic en el botón **"Nuevo Turno"** ubicado en la esquina superior del calendario.
2. **Seleccionar Servicio:** Elige la categoría y el servicio específico que solicita el cliente.
3. **Establecer Fecha y Hora:** 
   - Elige el día de la cita.
   - El selector de horario te mostrará las horas libres disponibles. 
   - *Nota:* A diferencia de los clientes web, el administrador puede forzar y registrar un turno en un horario fuera de la disponibilidad habitual si así lo requiere.
4. **Datos del Cliente:**
   - **Correo Electrónico (Clave Única):** Ingresa el email del cliente.
   - Si el email ya está registrado en tu base de datos, el sistema autocompletará automáticamente el Nombre, Apellido y Teléfono del cliente.
   - Si es un cliente nuevo, completa los campos de Nombre, Apellido y Teléfono. El sistema creará su ficha automáticamente al guardar el turno.
5. **Notas o Instrucciones Especiales:** Puedes añadir notas como características de la mascota (ej: "Miedoso", "Traer bozal", "Corte con tijera").
6. **Confirmar Registro:** Presiona **"Crear Reserva"**.

> [!NOTE]
> Los turnos creados manualmente por el administrador se registran directamente con el estado `Confirmado`, omitiendo el paso de pago de seña en línea (pendiente de pago). Esto asume que el cliente pagará la totalidad del servicio una vez finalizado el trabajo en la tienda física.
