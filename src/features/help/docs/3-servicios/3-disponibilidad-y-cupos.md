# Horarios, Disponibilidad y Capacidad Simultánea

El sistema cuenta con un motor inteligente de cálculo de disponibilidad. Cada servicio puede tener su propio esquema de días, horarios y cantidad de cupos simultáneos habilitados.

![Disponibilidad y Cupos](/help/images/3-servicios/3-disponibilidad-y-cupos.webp)

## El Modal "Configurar disponibilidad"
Para definir las franjas horarias específicas de cada servicio, debes presionar el **ícono del reloj azul** junto al nombre del servicio en la pantalla de gestión del catálogo. Esto abrirá el modal **"Configurar disponibilidad - [Nombre del Servicio]"**.

La interfaz cuenta con las siguientes características:
1. **Pestañas de Días de la Semana (Lunes a Domingo):** Permite alternar la vista para editar por separado los horarios de cada día.
2. **Listado de Rangos Habilitados:** Muestra las horas activas del día seleccionado (ej: `09:00 hs a 13:00 hs`).
   - Puedes eliminar cualquier franja presionando el botón del **tachito de basura** rojo junto a ella.
   - Si un día no tiene franjas horarias cargadas, se mostrará un mensaje indicando que se utilizarán los **horarios por defecto del sistema** (de 09:00 a 13:00 hs y de 16:00 a 20:00 hs).
3. **Agregar Rango Horario:** Un formulario con los campos **Hora Inicio** y **Hora Fin** y un botón **(+)** para agregar una nueva franja al día activo.
4. **Herramientas de Copiado Rápido:**
   - **Copiar a Lunes-Viernes (📅):** Copia los rangos horarios que configuraste en el día activo a todos los días de la semana laboral (Lunes a Viernes).
   - **Copiar a Todos los Días (🔁):** Copia la configuración del día activo a los 7 días de la semana completa (Lunes a Domingo).

> [!NOTE]
> Recuerda presionar **"Guardar Horarios"** al finalizar en el modal para impactar los cambios en Supabase. La disponibilidad se calculará en tiempo real en la landing web restando las citas activas (`Confirmado`, `Reprogramado`), descontando los feriados y bloqueos manuales, y validando que la duración estimada del servicio quepa dentro de las franjas horarias configuradas.
