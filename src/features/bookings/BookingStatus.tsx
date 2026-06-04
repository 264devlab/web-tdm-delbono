import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { getAvailableSlots, getAvailableDaysForRange, type BookingSlot } from '../../utils/availability';
import { formatCurrency, formatDate } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card';
import { notifications } from '../../lib/notifications';
import { downloadICSFile, getGoogleCalendarUrl } from '../../lib/calendar';
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

export const BookingStatus: React.FC<{ settings?: any }> = ({ settings }) => {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Mercado Pago Payment Return states & logic
  const [paymentUpdateMsg, setPaymentUpdateMsg] = useState<{ type: 'success' | 'danger' | 'warning', text: string } | null>(null);
  const [loadingPreference, setLoadingPreference] = useState<boolean>(false);

  const handlePaymentReturn = async (status: string, paymentIdVal: string | null) => {
    if (!booking) return;

    try {
      if (status === 'success' || status === 'approved') {
        setPaymentUpdateMsg({ type: 'success', text: '¡Pago acreditado! Tu turno ha sido confirmado con éxito. 🐾' });
        
        const { error } = await supabase
          .from('bookings')
          .update({
            status: 'CONFIRMED',
            payment_id: paymentIdVal
          })
          .eq('id', booking.id);

        if (error) throw error;

        // Dispatch confirmation notifications now that payment is approved
        notifications.dispatch('CONFIRMATION', {
          toEmail: booking.clients.email,
          toPhone: booking.clients.phone,
          clientName: `${booking.clients.first_name} ${booking.clients.last_name}`,
          serviceName: booking.services.name,
          date: booking.booking_date,
          time: booking.booking_time.substring(0, 5),
          depositAmount: booking.deposit_amount,
          bookingId: booking.id,
          quantity: booking.quantity,
          remainingAmount: (booking.services.price * booking.quantity) - booking.deposit_amount
        });

        await fetchBooking();

        // Clear search parameters from URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

      } else if (status === 'failure' || status === 'rejected' || status === 'cancelled') {
        setPaymentUpdateMsg({ type: 'danger', text: 'El pago fue rechazado o cancelado. Inténtalo de nuevo.' });
      } else if (status === 'pending' || status === 'in_process') {
        setPaymentUpdateMsg({ type: 'warning', text: 'Tu pago está pendiente de procesamiento por Mercado Pago. Te notificaremos al confirmarse.' });
      }
    } catch (err) {
      console.error('Error al procesar retorno de pago:', err);
      setPaymentUpdateMsg({ type: 'danger', text: 'Ocurrió un error al intentar confirmar tu reserva y registrar el pago.' });
    }
  };

  const handleRepayWithMercadoPago = async () => {
    if (!booking) return;

    setLoadingPreference(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const waApiKey = import.meta.env.VITE_WA_API_KEY;
      if (waApiKey) {
        headers['x-api-key'] = waApiKey;
      }

      const response = await fetch('/api/payment/create_preference', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: `Seña - ${booking.services.name}`,
          price: booking.deposit_amount / booking.quantity,
          quantity: booking.quantity,
          bookingId: booking.id
        })
      });

      const data = await response.json();
      if (data.success && data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error(data.error || 'No se pudo crear la preferencia de pago.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al conectar con Mercado Pago. Por favor, reintente.');
    } finally {
      setLoadingPreference(false);
    }
  };

  // Read URL query parameters for payment status from Mercado Pago redirect
  useEffect(() => {
    if (!booking) return;
    const params = new URLSearchParams(window.location.search);
    
    // Support both custom payment_status and Mercado Pago's native status/collection_status query parameters
    let paymentStatus = params.get('payment_status');
    if (!paymentStatus) {
      const mpStatus = params.get('status') || params.get('collection_status');
      if (mpStatus === 'approved') {
        paymentStatus = 'success';
      } else if (mpStatus === 'pending' || mpStatus === 'in_process') {
        paymentStatus = 'pending';
      } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
        paymentStatus = 'failure';
      }
    }
    
    const paymentIdParam = params.get('payment_id') || params.get('collection_id');

    if (paymentStatus && booking.status === 'PENDING_PAYMENT') {
      handlePaymentReturn(paymentStatus, paymentIdParam);
    }
  }, [booking]);

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
      case 'PENDING_PAYMENT':
        return <span className="bg-amber-100 text-amber-700 border border-amber-200 py-1 px-3 text-xs font-bold rounded-full">Pendiente de Pago</span>;
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
        {paymentUpdateMsg && (
          <div className={`p-4 rounded-xl border text-xs font-bold ${
            paymentUpdateMsg.type === 'success' 
              ? 'bg-success/10 border-success/20 text-success' 
              : paymentUpdateMsg.type === 'danger'
                ? 'bg-danger/10 border-danger/20 text-danger'
                : 'bg-warning/10 border-warning/20 text-warning'
          }`}>
            {paymentUpdateMsg.text}
          </div>
        )}
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

            {/* Calendar Integration Buttons */}
            {(booking.status === 'CONFIRMED' || booking.status === 'RESCHEDULED') && (
              <div className="border-t border-neutral-200/50 pt-4 space-y-3 text-left">
                <h5 className="font-bold text-offblack m-0 text-xs">Añadir a tu Calendario:</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href={getGoogleCalendarUrl({
                      serviceName: booking.services.name,
                      date: booking.booking_date,
                      time: booking.booking_time.substring(0, 5),
                      durationMinutes: booking.services.estimated_duration_minutes,
                      businessName: settings?.business_name || 'Tienda de Mascotas Del Bono',
                      address: settings?.address || 'Av. Del Bono 123, San Juan'
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full text-center flex items-center justify-center gap-2 no-underline py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer text-xs"
                  >
                    Google Calendar
                  </a>
                  <Button
                    variant="secondary"
                    onClick={() => downloadICSFile({
                      serviceName: booking.services.name,
                      date: booking.booking_date,
                      time: booking.booking_time.substring(0, 5),
                      durationMinutes: booking.services.estimated_duration_minutes,
                      businessName: settings?.business_name || 'Tienda de Mascotas Del Bono',
                      address: settings?.address || 'Av. Del Bono 123, San Juan'
                    })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs"
                  >
                    Otros Calendarios (.ics)
                  </Button>
                </div>
              </div>
            )}

            {booking.status === 'PENDING_PAYMENT' && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-left space-y-3 mt-4">
                <h5 className="font-bold text-amber-800 m-0 flex items-center gap-1.5 text-xs">
                  <Clock className="h-4 w-4" /> Reserva Pendiente de Pago
                </h5>
                <p className="text-[11px] text-amber-700 font-semibold m-0 leading-relaxed">
                  Para confirmar este turno de forma definitiva, debes completar el pago de la seña (${formatCurrency(booking.deposit_amount)}).
                </p>
                <button
                  type="button"
                  onClick={handleRepayWithMercadoPago}
                  disabled={loadingPreference}
                  className={`flex items-center justify-center gap-2 px-6 py-2.5 font-extrabold text-xs text-white rounded-xl transition-all shadow-sm focus:outline-none w-full ${
                    loadingPreference 
                      ? 'bg-[#009ee3]/70 cursor-not-allowed pointer-events-none' 
                      : 'bg-[#009ee3] hover:bg-[#008cd0] hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  {loadingPreference ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Procesando...
                    </span>
                  ) : (
                    <>
                      <svg role="img" viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z" />
                      </svg>
                      Pagar
                    </>
                  )}
                </button>
              </div>
            )}
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
