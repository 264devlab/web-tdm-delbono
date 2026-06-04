import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { getAvailableSlots, getAvailableDaysForRange, type BookingSlot } from '../../utils/availability';
import { formatCurrency, formatDate } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card';
import { notifications } from '../../lib/notifications';
import { 
  Calendar, Clock, Scissors, User, 
  CheckCircle2, AlertTriangle, 
  RefreshCw, Trash2, XCircle, Home
} from 'lucide-react';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const BookingStatus: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Rules and modification states
  const [canModify, setCanModify] = useState<boolean>(true);
  const [hoursLeft, setHoursLeft] = useState<number>(0);
  const [limitHours, setLimitHours] = useState<number>(12);
  const [alreadyStartedOrPassed, setAlreadyStartedOrPassed] = useState<boolean>(false);

  // Cancellation states
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Rescheduling states
  const [showRescheduleForm, setShowRescheduleForm] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [rescheduling, setRescheduling] = useState<boolean>(false);

  // Calendar month visual selector
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState<number>(today.getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(today.getFullYear());
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [checkingAvailability, setCheckingAvailability] = useState<boolean>(false);

  const fetchBooking = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, clients(*), services(*)')
        .eq('id', id);

      if (error) throw error;
      if (!data || data.length === 0) {
        setErrorMsg('No pudimos encontrar la reserva solicitada. Por favor verifica el enlace.');
        return;
      }
      
      const bk = data[0];
      setBooking(bk);

      // Verify cancellation & reschedule time-limits
      const bookingDateTimeStr = `${bk.booking_date}T${bk.booking_time}`;
      const bookingDateObj = new Date(bookingDateTimeStr);
      const now = new Date();
      const diffMs = bookingDateObj.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      const allowed = bk.services.allow_reschedule;
      const limit = bk.services.reschedule_limit_hours;

      setLimitHours(limit);
      setHoursLeft(diffHours);
      setAlreadyStartedOrPassed(diffHours <= 0);

      const activeStatus = bk.status === 'CONFIRMED' || bk.status === 'RESCHEDULED';
      setCanModify(allowed && diffHours >= limit && activeStatus);

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Ocurrió un error al obtener la información del turno.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [id]);

  // Load calendar month availability when calendarMonth/calendarYear changes
  useEffect(() => {
    if (!booking?.services) return;
    
    let isCancelled = false;
    async function loadMonthAvailability() {
      const currentService = booking.services;
      setCheckingAvailability(true);
      
      const firstDayOfMonthStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
      const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
      const lastDayOfMonthStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const todayStr = new Date().toISOString().split('T')[0];
      const maxDateObj = new Date();
      maxDateObj.setDate(maxDateObj.getDate() + 60);
      const maxDateStr = maxDateObj.toISOString().split('T')[0];

      const startDateStr = firstDayOfMonthStr < todayStr ? todayStr : firstDayOfMonthStr;
      const endDateStr = lastDayOfMonthStr > maxDateStr ? maxDateStr : lastDayOfMonthStr;

      if (startDateStr > endDateStr) {
        setAvailableDays(new Set());
        setCheckingAvailability(false);
        return;
      }

      try {
        const activeDays = await getAvailableDaysForRange({
          serviceId: currentService.id,
          startDateStr,
          endDateStr,
          quantity: booking.quantity || 1,
          excludeBookingId: booking.id
        });

        if (!isCancelled) {
          setAvailableDays(activeDays);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!isCancelled) setCheckingAvailability(false);
      }
    }

    loadMonthAvailability();
    return () => {
      isCancelled = true;
    };
  }, [booking, calendarMonth, calendarYear]);

  // Load slots for selected date
  useEffect(() => {
    if (booking?.services && rescheduleDate) {
      setLoadingSlots(true);
      setRescheduleTime('');
      getAvailableSlots({ 
        serviceId: booking.services.id, 
        dateStr: rescheduleDate,
        quantity: booking.quantity || 1,
        excludeBookingId: booking.id
      })
        .then(slots => {
          setAvailableSlots(slots);
          setLoadingSlots(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingSlots(false);
        });
    }
  }, [booking, rescheduleDate]);

  const handleCancelBooking = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'CANCELLED' })
        .eq('id', id);

      if (error) throw error;

      await notifications.dispatch('CANCELLATION', {
        toEmail: booking.clients.email,
        toPhone: booking.clients.phone,
        clientName: `${booking.clients.first_name} ${booking.clients.last_name}`,
        serviceName: booking.services.name,
        date: booking.booking_date,
        time: booking.booking_time.substring(0, 5),
        depositAmount: booking.deposit_amount,
        quantity: booking.quantity || 1
      });

      await fetchBooking();
      setShowCancelConfirm(false);
    } catch (err) {
      console.error(err);
      alert('Error al cancelar la reserva.');
    } finally {
      setCancelling(false);
    }
  };

  const handleRescheduleBooking = async () => {
    if (!rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          booking_date: rescheduleDate,
          booking_time: `${rescheduleTime}:00`,
          status: 'RESCHEDULED'
        })
        .eq('id', id);

      if (error) throw error;

      await notifications.dispatch('RESCHEDULE', {
        toEmail: booking.clients.email,
        toPhone: booking.clients.phone,
        clientName: `${booking.clients.first_name} ${booking.clients.last_name}`,
        serviceName: booking.services.name,
        date: rescheduleDate,
        time: rescheduleTime,
        depositAmount: booking.deposit_amount,
        bookingId: booking.id,
        quantity: booking.quantity || 1
      });

      await fetchBooking();
      setShowRescheduleForm(false);
      setRescheduleDate('');
      setRescheduleTime('');
    } catch (err) {
      console.error(err);
      alert('Error al reprogramar el turno.');
    } finally {
      setRescheduling(false);
    }
  };

  // Helper calendar layouts
  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    const days = [];
    let startDay = date.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1; // Align to start on Monday

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const isPrevMonthDisabled = () => {
    return calendarYear < today.getFullYear() || (calendarYear === today.getFullYear() && calendarMonth <= today.getMonth());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <span className="bg-success/15 text-success border border-success/20 py-1 px-3 text-xs font-bold rounded-full">Confirmado</span>;
      case 'RESCHEDULED':
        return <span className="bg-primary/15 text-primary border border-primary/20 py-1 px-3 text-xs font-bold rounded-full">Reprogramado</span>;
      case 'CANCELLED':
        return <span className="bg-danger/15 text-danger border border-danger/20 py-1 px-3 text-xs font-bold rounded-full">Cancelado</span>;
      case 'COMPLETED':
        return <span className="bg-secondary/15 text-secondary border border-secondary/20 py-1 px-3 text-xs font-bold rounded-full">Completado</span>;
      case 'NO_SHOW':
        return <span className="bg-warning/15 text-warning border border-warning/20 py-1 px-3 text-xs font-bold rounded-full">No Asistió</span>;
      default:
        return <span className="bg-gray-100 text-gray-500 py-1 px-3 text-xs font-bold rounded-full">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="flex justify-center">
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
        </div>
        <p className="text-gray-400 font-semibold animate-pulse">Obteniendo los detalles de tu turno...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-danger/10 text-danger p-4 rounded-full">
            <AlertTriangle className="h-12 w-12" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-offblack">Acceso no Válido</h2>
          <p className="text-gray-400 font-semibold mt-2">{errorMsg}</p>
        </div>
        <div className="pt-2">
          <Link to="/">
            <Button variant="primary" className="flex items-center gap-2 mx-auto">
              <Home className="h-4 w-4" /> Ir a Reservas
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isCancelled = booking.status === 'CANCELLED';
  const isCompleted = booking.status === 'COMPLETED';

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 text-left">
      <div className="mb-6 border-b border-neutral-100 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-offblack m-0">Gestionar mi Turno</h1>
          <p className="text-gray-400 mt-0.5 font-semibold text-xs">Consulta, reprograma o cancela tu cita</p>
        </div>
        <Link to="/">
          <Button variant="ghost" className="text-xs flex items-center gap-1.5 py-1.5 px-3 border border-neutral-200 hover:bg-neutral-50 rounded-lg">
            <Home className="h-3.5 w-3.5" /> Inicio
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {/* Reservation Status & Card Overview */}
        <Card className="border border-neutral-100">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3 border-b border-neutral-100">
            <div>
              <CardTitle className="text-base font-extrabold text-offblack">Resumen del Turno</CardTitle>
              <p className="text-[10px] text-gray-400 font-bold font-mono mt-0.5">ID: {booking.id.substring(0, 8)}...</p>
            </div>
            {getStatusBadge(booking.status)}
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600 font-semibold">
              <p className="flex items-center gap-2.5">
                <Scissors className="h-4 w-4 text-secondary shrink-0" />
                <span><strong>Servicio:</strong> {booking.services.name}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Scissors className="h-4 w-4 text-secondary shrink-0" />
                <span><strong>Cantidad:</strong> {booking.quantity || 1} { (booking.quantity || 1) === 1 ? 'turno' : 'turnos' }</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-secondary shrink-0" />
                <span><strong>Fecha:</strong> {formatDate(booking.booking_date)}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-secondary shrink-0" />
                <span><strong>Horario:</strong> {booking.booking_time.substring(0, 5)} hs ({booking.duration} min)</span>
              </p>
              <p className="flex items-center gap-2.5">
                <User className="h-4 w-4 text-secondary shrink-0" />
                <span><strong>Cliente:</strong> {booking.clients.first_name} {booking.clients.last_name}</span>
              </p>
            </div>

            <div className="border-t border-neutral-200/50 pt-4 bg-neutral-50/50 p-4 rounded-xl space-y-2 text-xs text-gray-500">
              <div className="flex justify-between font-semibold text-offblack text-sm">
                <span>Precio Total:</span>
                <span>${formatCurrency(booking.services.price * (booking.quantity || 1))}</span>
              </div>
              {booking.deposit_amount > 0 ? (
                <>
                  <div className="flex justify-between text-success">
                    <span>Seña Abonada (MP):</span>
                    <span>-${formatCurrency(booking.deposit_amount)}</span>
                  </div>
                  <div className="flex justify-between text-offblack font-bold text-sm border-t border-dashed border-neutral-200 pt-2 mt-1">
                    <span>Restante a pagar en local:</span>
                    <span>${formatCurrency((booking.services.price * (booking.quantity || 1)) - booking.deposit_amount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-offblack font-bold text-sm border-t border-dashed border-neutral-200 pt-2 mt-1">
                  <span>Restante a pagar en local:</span>
                  <span>${formatCurrency(booking.services.price * (booking.quantity || 1))}</span>
                </div>
              )}
            </div>
          </CardContent>

          {/* Action Row */}
          {!isCancelled && !isCompleted && !showRescheduleForm && !showCancelConfirm && (
            <CardFooter className="justify-center sm:justify-end gap-3 flex-wrap">
              {canModify ? (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-xs text-danger hover:bg-danger/5 border border-transparent hover:border-danger/20 py-2.5 px-4 rounded-xl"
                  >
                    Cancelar Turno
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={() => {
                      setRescheduleDate('');
                      setRescheduleTime('');
                      setShowRescheduleForm(true);
                    }}
                    className="text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reprogramar Turno
                  </Button>
                </>
              ) : (
                <div className="w-full bg-yellow-50 border border-warning/15 p-3 rounded-xl flex gap-2.5 text-xs text-warning font-semibold text-left">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <div>
                    {alreadyStartedOrPassed ? (
                      <span>Este turno ya comenzó o ya ha pasado, por lo tanto no puede ser cancelado ni reprogramado.</span>
                    ) : !booking.services.allow_reschedule ? (
                      <span>Este servicio no permite reprogramaciones ni cancelaciones online.</span>
                    ) : (
                      <span>
                        Límite superado: Las cancelaciones y reprogramaciones deben realizarse con al menos <strong>{limitHours} horas</strong> de anticipación. Restan {(hoursLeft < 0 ? 0 : hoursLeft).toFixed(1)} horas. Por favor comunícate directamente al negocio.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardFooter>
          )}
        </Card>

        {/* CANCELLATION DIALOG CONTAINER */}
        {showCancelConfirm && (
          <Card className="border border-danger/20 bg-danger/2">
            <CardContent className="space-y-4">
              <div className="flex gap-3 text-left">
                <div className="bg-danger/10 text-danger p-2.5 rounded-xl shrink-0 h-fit">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-offblack">¿Seguro que deseas cancelar tu turno?</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-1">
                    Esta acción es irreversible y tu horario quedará liberado para otros clientes.
                  </p>
                </div>
              </div>

              {booking.deposit_amount > 0 && (
                <div className="bg-yellow-50 border border-warning/15 p-3.5 rounded-xl text-xs text-warning font-semibold text-left">
                  ⚠️ <strong>Nota sobre la seña:</strong> Has abonado una seña de <strong>${formatCurrency(booking.deposit_amount)}</strong>. Nos pondremos en contacto contigo a la brevedad para coordinar la devolución o reubicación del saldo según corresponda.
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-end gap-2.5">
              <Button 
                variant="secondary" 
                disabled={cancelling}
                onClick={() => setShowCancelConfirm(false)}
                className="py-2 px-3 text-xs"
              >
                No, mantener turno
              </Button>
              <Button 
                variant="primary" 
                isLoading={cancelling}
                onClick={handleCancelBooking}
                className="bg-danger hover:bg-rose-700 text-white border-transparent py-2 px-3 text-xs"
              >
                Sí, cancelar turno
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* RESCHEDULE FORM CONTAINER */}
        {showRescheduleForm && (
          <Card className="border border-secondary/15">
            <CardHeader className="border-b border-neutral-100 pb-3">
              <CardTitle className="text-base text-secondary flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" /> Selecciona tu Nueva Fecha y Horario
              </CardTitle>
            </CardHeader>
            <CardContent className="py-4 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Month Calendar Grid */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-neutral-50 p-2 rounded-xl border border-neutral-200/50">
                    <button 
                      type="button"
                      onClick={handlePrevMonth}
                      disabled={isPrevMonthDisabled()}
                      className="p-1 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      &lt;
                    </button>
                    <span className="text-xs font-bold text-offblack">
                      {MONTHS[calendarMonth]} {calendarYear}
                    </span>
                    <button 
                      type="button"
                      onClick={handleNextMonth}
                      className="p-1 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 font-bold cursor-pointer"
                    >
                      &gt;
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-gray-400 border-b border-neutral-100 pb-1.5">
                    {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(calendarYear, calendarMonth).map((day, idx) => {
                      if (!day) return <div key={idx} className="aspect-square"></div>;
                      
                      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                      const todayStr = today.toISOString().split('T')[0];
                      const isPast = dateStr < todayStr;
                      
                      const currentService = booking.services;
                      const weekdayMap = [
                        currentService.enabled_sunday,
                        currentService.enabled_monday,
                        currentService.enabled_tuesday,
                        currentService.enabled_wednesday,
                        currentService.enabled_thursday,
                        currentService.enabled_friday,
                        currentService.enabled_saturday
                      ];
                      const isWeekdayEnabled = weekdayMap[day.getDay()];
                      const isDayAvailable = availableDays.has(dateStr);
                      const isSelectable = !isPast && isWeekdayEnabled && isDayAvailable;
                      const isSelected = rescheduleDate === dateStr;

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!isSelectable}
                          onClick={() => setRescheduleDate(dateStr)}
                          className={`aspect-square text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'bg-primary text-white border-transparent'
                              : isSelectable
                                ? 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50 hover:border-primary/20'
                                : 'bg-neutral-50 text-gray-300 border-transparent opacity-40 line-through cursor-not-allowed'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>

                  {checkingAvailability && (
                    <p className="text-[10px] text-gray-400 font-bold text-center animate-pulse">
                      Verificando días disponibles...
                    </p>
                  )}
                </div>

                {/* Time Slots Grid */}
                <div className="flex flex-col gap-2 justify-start">
                  <label className="text-xs font-bold text-offblack flex items-center gap-1.5 mb-2">
                    <Clock className="h-3.5 w-3.5 text-secondary" /> Horarios Libres
                  </label>

                  {!rescheduleDate ? (
                    <div className="p-4 bg-neutral-50 border border-dashed border-neutral-200 text-center text-xs font-bold text-gray-400 rounded-xl flex-1 flex items-center justify-center">
                      Elige un día en el calendario.
                    </div>
                  ) : loadingSlots ? (
                    <div className="text-center py-4 text-xs font-bold text-gray-400 flex-1 flex items-center justify-center animate-pulse">
                      Buscando horarios...
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="p-4 bg-danger/5 border border-danger/15 text-center text-xs font-bold text-danger rounded-xl flex-1 flex items-center justify-center">
                      Sin horarios libres en esta fecha.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 overflow-y-auto max-h-48 p-0.5">
                      {availableSlots.map((slot, idx) => (
                        <button
                          key={idx}
                          disabled={!slot.available}
                          onClick={() => setRescheduleTime(slot.time)}
                          className={`py-2 px-1 text-center font-bold border rounded-lg cursor-pointer text-xs transition-all ${
                            !slot.available 
                              ? 'bg-neutral-50 text-gray-300 border-neutral-100 cursor-not-allowed opacity-40' 
                              : rescheduleTime === slot.time
                                ? 'bg-primary text-white border-transparent'
                                : 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50'
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2.5">
              <Button 
                variant="secondary" 
                disabled={rescheduling}
                onClick={() => setShowRescheduleForm(false)}
                className="py-2 px-3 text-xs"
              >
                Volver
              </Button>
              <Button 
                variant="primary" 
                isLoading={rescheduling}
                disabled={!rescheduleDate || !rescheduleTime}
                onClick={handleRescheduleBooking}
                className="py-2 px-4 text-xs"
              >
                Confirmar Reprogramación
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* FEEDBACK FOR COMPLETED/CANCELLED STATES */}
        {isCancelled && (
          <div className="bg-danger/5 border border-danger/15 p-4 rounded-xl flex gap-3 text-xs text-danger font-semibold">
            <XCircle className="h-5 w-5 shrink-0" />
            <div>
              <span>Este turno ha sido cancelado. Puedes agendar un nuevo turno en nuestro portal.</span>
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="bg-secondary/5 border border-secondary/15 p-4 rounded-xl flex gap-3 text-xs text-secondary font-semibold">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <span>Este turno ya fue completado. ¡Gracias por confiar en nosotros! 🐾</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
