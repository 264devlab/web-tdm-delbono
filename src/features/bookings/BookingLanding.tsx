import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { getAvailableSlots, getAvailableDaysForRange, type BookingSlot } from '../../utils/availability';
import { formatCurrency, formatDate } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { notifications } from '../../lib/notifications';
import { downloadICSFile, getGoogleCalendarUrl } from '../../lib/calendar';
import { Calendar, Clock, CheckCircle2, ShieldCheck, ChevronRight, ChevronLeft, Scissors, User, Mail, Info } from 'lucide-react';
import { normalizePhone } from '../../utils/phone';

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Service {
  id: string;
  category_id: string;
  name: string;
  description: string;
  estimated_duration_minutes: number;
  requires_deposit: boolean;
  deposit_amount: number;
  price: number;
  allow_reschedule: boolean;
  reschedule_limit_hours: number;
  enabled_monday: boolean;
  enabled_tuesday: boolean;
  enabled_wednesday: boolean;
  enabled_thursday: boolean;
  enabled_friday: boolean;
  enabled_saturday: boolean;
  enabled_sunday: boolean;
  max_concurrent_bookings: number;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface BookingLandingProps {
  settings?: any;
}

export const BookingLanding: React.FC<BookingLandingProps> = ({ settings }) => {
  // Wizard steps: 'category' | 'service' | 'date_time' | 'client_info' | 'payment_sim' | 'success'
  const [step, setStep] = useState<'category' | 'service' | 'date_time' | 'client_info' | 'payment_sim' | 'success'>('category');

  // Data lists
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Selected booking choices
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingDate, setBookingDate] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<BookingSlot[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [bookingQuantity, setBookingQuantity] = useState<number>(1);

  // Reset quantity when slot changes
  useEffect(() => {
    setBookingQuantity(1);
  }, [selectedTime]);

  // Custom Calendar state
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState<number>(today.getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(today.getFullYear());
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [checkingAvailability, setCheckingAvailability] = useState<boolean>(false);

  // Client details
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [clientExists, setClientExists] = useState<boolean>(false);
  const [loadingClient, setLoadingClient] = useState<boolean>(false);
  const [clientId, setClientId] = useState<string>('');
  const [clientFormError, setClientFormError] = useState<string>('');

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Payment status
  const [paymentId, setPaymentId] = useState<string>('');
  const [loadingPreference, setLoadingPreference] = useState<boolean>(false);
  const [preferenceError, setPreferenceError] = useState<string>('');

  // 1. Initial load of active categories and services
  useEffect(() => {
    async function loadData() {
      const { data: catData } = await supabase.from('categories').select('*').eq('active', true);
      const { data: servData } = await supabase.from('services').select('*').eq('active', true);

      if (catData) {
        setCategories(catData);
        if (catData.length === 1) {
          setSelectedCategory(catData[0].id);
          setStep('service');
        }
      }
      if (servData) setServices(servData);
    }
    loadData();
  }, []);

  // 2. Listen to reset event from header/logo
  useEffect(() => {
    const handleReset = () => {
      if (categories.length === 1) {
        setStep('service');
        setSelectedCategory(categories[0].id);
      } else {
        setStep('category');
        setSelectedCategory(null);
      }
      setSelectedService(null);
      setBookingDate('');
      setAvailableSlots([]);
      setSelectedTime('');
      setBookingQuantity(1);
      setEmail('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setClientExists(false);
      setClientId('');
      setClientFormError('');
      setPaymentId('');
    };
    window.addEventListener('reset_booking_flow', handleReset);
    return () => window.removeEventListener('reset_booking_flow', handleReset);
  }, [categories]);

  // 3. Refresh available slots whenever date or service changes
  useEffect(() => {
    if (selectedService && bookingDate) {
      setLoadingSlots(true);
      setSelectedTime('');
      setBookingQuantity(1);
      getAvailableSlots({ serviceId: selectedService.id, dateStr: bookingDate })
        .then(slots => {
          setAvailableSlots(slots);
          setLoadingSlots(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingSlots(false);
        });
    }
  }, [selectedService, bookingDate]);

  // 4. Calculate month availability for custom calendar
  useEffect(() => {
    const activeService = selectedService;
    if (!activeService) {
      setAvailableDays(new Set());
      return;
    }

    let isCancelled = false;
    async function loadMonthAvailability() {
      const currentService = activeService;
      if (!currentService) return;

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
          endDateStr
        });

        if (!isCancelled) {
          setAvailableDays(activeDays);
        }
      } catch (err) {
        console.error('Error loading availability calendar:', err);
      } finally {
        if (!isCancelled) setCheckingAvailability(false);
      }
    }

    loadMonthAvailability();
    return () => {
      isCancelled = true;
    };
  }, [selectedService, calendarMonth, calendarYear]);

  // 5. Client Lookup by Phone (Triggers onBlur)
  const handlePhoneSearch = async () => {
    if (!phone) {
      setClientFormError('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setClientId('');
      setClientExists(false);
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone !== phone) {
      setPhone(normalizedPhone); // Update input with normalized phone
    }
    
    if (normalizedPhone.length < 10) {
      setClientFormError('Por favor ingrese un teléfono válido de al menos 10 dígitos.');
      return;
    }
    
    setClientFormError('');
    setLoadingClient(true);

    try {
      const { data: clients, error } = await supabase.from('clients').select('*').eq('phone', normalizedPhone);
      if (error) throw error;

      if (clients && clients.length > 0) {
        const client = clients[0];
        setFirstName(client.first_name);
        setLastName(client.last_name);
        setEmail(client.email);
        setClientId(client.id);
        setClientExists(true);
      } else {
        setFirstName('');
        setLastName('');
        setEmail('');
        setClientId('');
        setClientExists(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClient(false);
    }
  };

  // 6. Submit or retrieve Client & go to next step
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !phone || !email) {
      setClientFormError('Por favor complete todos los datos.');
      return;
    }

    setLoadingClient(true);
    try {
      let finalClientId = clientId;

      if (clientExists) {
        // Update client data in case fields were modified
        const { error } = await supabase.from('clients')
          .update({
            first_name: firstName,
            last_name: lastName,
            email
          })
          .eq('id', clientId);
        if (error) throw error;
      } else {
        // Create new client
        const normalizedPhone = normalizePhone(phone);
        const { data: newClient, error } = await supabase.from('clients').insert({
          email,
          first_name: firstName,
          last_name: lastName,
          phone: normalizedPhone
        }).select();

        if (error) throw error;
        if (newClient && newClient.length > 0) {
          finalClientId = newClient[0].id;
          setClientId(finalClientId);
        }
      }

      // Check if deposit is required
      if (selectedService?.requires_deposit) {
        setStep('payment_sim');
      } else {
        // Confirm booking directly
        await confirmBooking(finalClientId, 'direct_no_deposit');
      }
    } catch (err) {
      console.error(err);
      setClientFormError('Ocurrió un error al registrar tus datos.');
    } finally {
      setLoadingClient(false);
    }
  };

  const handlePayWithMercadoPago = async () => {
    if (!selectedService) return;

    setLoadingPreference(true);
    setPreferenceError('');

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
          title: `Seña - ${selectedService.name}`,
          price: selectedService.deposit_amount,
          quantity: bookingQuantity,

          clientEmail: email,
          clientFirstName: firstName,
          clientLastName: lastName,
          clientPhone: phone,
          serviceId: selectedService.id,
          bookingDate: bookingDate,
          bookingTime: selectedTime,
          bookingQuantity: bookingQuantity,
          servicePrice: selectedService.price,
          depositAmount: selectedService.deposit_amount
        })
      });

      const data = await response.json();
      if (data.success && data.init_point) {
        // Redirect client to Mercado Pago Checkout Pro
        window.location.href = data.init_point;
      } else {
        throw new Error(data.error || 'No se pudo crear la preferencia de pago.');
      }
    } catch (err: any) {
      console.error(err);
      setPreferenceError('Error de conexión con Mercado Pago. Por favor, reintente.');
    } finally {
      setLoadingPreference(false);
    }
  };

  // 7. Final Confirmation of Booking (for direct bookings without deposit)
  const confirmBooking = async (targetClientId: string, payId: string) => {
    if (!selectedService) return;

    try {
      const depositAmountTotal = selectedService.requires_deposit
        ? selectedService.deposit_amount * bookingQuantity
        : 0;

      const { data: newBooking, error } = await supabase.from('bookings').insert({
        client_id: targetClientId,
        service_id: selectedService.id,
        booking_date: bookingDate,
        booking_time: `${selectedTime}:00`,
        duration: selectedService.estimated_duration_minutes,
        deposit_amount: depositAmountTotal,
        payment_id: payId !== 'direct_no_deposit' ? payId : null,
        status: 'CONFIRMED',
        notes: `Reserva online de ${firstName} ${lastName}`,
        quantity: bookingQuantity
      }).select();

      if (error) throw error;

      if (newBooking && newBooking.length > 0) {
        // Dispatch notifications decoupled
        notifications.dispatch('CONFIRMATION', {
          toEmail: email,
          toPhone: phone,
          clientName: `${firstName} ${lastName}`,
          serviceName: selectedService.name,
          date: bookingDate,
          time: selectedTime,
          depositAmount: depositAmountTotal,
          bookingId: newBooking[0].id,
          quantity: bookingQuantity,
          remainingAmount: selectedService.price === 0 ? undefined : (selectedService.price * bookingQuantity) - depositAmountTotal
        });

        setStep('success');
      }
    } catch (err) {
      console.error(err);
      alert('Error al confirmar la reserva.');
    }
  };



  // Helper logic for calendar layout
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

  // Helper for progress indicator step values
  const getStepInfo = () => {
    const hasMultipleCategories = categories.length > 1;
    if (hasMultipleCategories) {
      switch (step) {
        case 'category':
          return { num: 1, label: 'Categoría' };
        case 'service':
          return { num: 2, label: 'Servicio' };
        case 'date_time':
          return { num: 3, label: 'Fecha y Hora' };
        case 'client_info':
          return { num: 4, label: 'Tus Datos' };
        case 'payment_sim':
        case 'success':
        default:
          return { num: 5, label: 'Confirmación' };
      }
    } else {
      switch (step) {
        case 'service':
          return { num: 1, label: 'Servicio' };
        case 'date_time':
          return { num: 2, label: 'Fecha y Hora' };
        case 'client_info':
          return { num: 3, label: 'Tus Datos' };
        case 'payment_sim':
        case 'success':
        default:
          return { num: 4, label: 'Confirmación' };
      }
    }
  };
  const activeStep = getStepInfo();

  const filteredServices = services.filter(s => s.category_id === selectedCategory);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 text-left">
      {/* Visual Header */}
      <div className="mb-8 border-b border-neutral-100 pb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-offblack m-0">Reserva de Turnos</h1>
        <p className="text-gray-400 mt-1 font-semibold text-sm">{settings?.business_name || 'Negocio'}</p>
      </div>

      {/* Progress Tracker - Desktop */}
      <div className={`hidden sm:grid ${categories.length > 1 ? 'grid-cols-5' : 'grid-cols-4'} gap-2 mb-8 text-center text-xs font-bold`}>
        {(categories.length > 1
          ? [
            { label: '1. Categoría', active: step === 'category' },
            { label: '2. Servicio', active: step === 'service' },
            { label: '3. Fecha y Hora', active: step === 'date_time' },
            { label: '4. Tus Datos', active: step === 'client_info' },
            { label: '5. Confirmado', active: step === 'payment_sim' || step === 'success' }
          ]
          : [
            { label: '1. Servicio', active: step === 'service' },
            { label: '2. Fecha y Hora', active: step === 'date_time' },
            { label: '3. Tus Datos', active: step === 'client_info' },
            { label: '4. Confirmado', active: step === 'payment_sim' || step === 'success' }
          ]
        ).map((s, idx) => (
          <div
            key={idx}
            className={`py-2 px-1.5 rounded-lg transition-all border ${s.active
              ? 'bg-primary text-white border-transparent shadow-sm'
              : 'bg-white text-gray-500 border-neutral-200'
              }`}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Progress Tracker - Mobile */}
      <div className="block sm:hidden mb-8">
        <div className="flex justify-between items-center text-xs font-bold text-gray-500 mb-2">
          <span>Paso {activeStep.num} de {categories.length > 1 ? 5 : 4}</span>
          <span className="text-primary uppercase tracking-wider">{activeStep.label}</span>
        </div>
        <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${(activeStep.num / (categories.length > 1 ? 5 : 4)) * 100}%` }}
          />
        </div>
      </div>

      {/* STEP 1: CATEGORY SELECTION */}
      {step === 'category' && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-offblack">Selecciona una Categoría</h3>
          <p className="text-sm text-gray-400 font-semibold mb-4">Elige la categoría general del servicio que necesita tu mascota</p>

          <div className="space-y-3">
            {categories.map(cat => (
              <Card
                key={cat.id}
                className="flat-card-interactive border border-neutral-100 hover:border-primary/20 transition-all cursor-pointer"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setStep('service');
                }}
              >
                <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 text-left">
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center font-bold text-base shrink-0">
                      {cat.name.charAt(0)}
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-sm sm:text-base font-extrabold text-offblack">{cat.name}</h4>
                      <p className="text-xs text-gray-400 font-semibold line-clamp-1 sm:line-clamp-none">{cat.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: SERVICE SELECTION */}
      {step === 'service' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-offblack">Selecciona un Servicio</h3>
            {categories.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => setStep('category')}
                className="text-xs py-1.5 px-3 border border-neutral-200 rounded-lg flex items-center gap-1 hover:bg-neutral-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Atrás
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {filteredServices.length === 0 ? (
              <div className="p-8 text-center text-gray-400 font-semibold italic bg-white border border-dashed border-neutral-200 rounded-2xl">
                No hay servicios cargados en esta categoría.
              </div>
            ) : (
              filteredServices.map(serv => (
                <Card
                  key={serv.id}
                  className="flat-card-interactive border border-neutral-100 hover:border-primary/20 transition-all cursor-pointer"
                  onClick={() => {
                    setSelectedService(serv);
                    setStep('date_time');
                  }}
                >
                  <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                    <div className="flex-1 text-left space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-extrabold text-offblack">{serv.name}</h4>
                        <span className="bg-secondary/10 text-secondary px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-full">
                          {serv.estimated_duration_minutes} min
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-semibold line-clamp-2">{serv.description}</p>

                      {/* Price info visible on mobile under the title/description */}
                      <div className="flex items-center gap-3 pt-1.5 sm:hidden">
                        <span className="text-xs font-extrabold text-offblack">
                          {serv.price === 0 ? 'Sin definir' : `$${formatCurrency(serv.price)}`}
                        </span>
                        {serv.requires_deposit && (
                          <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                            Seña: ${formatCurrency(serv.deposit_amount)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price info on desktop, hidden on mobile */}
                    <div className="hidden sm:flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Precio Total</span>
                        <span className="text-sm font-extrabold text-offblack">
                          {serv.price === 0 ? 'Sin definir' : `$${formatCurrency(serv.price)}`}
                        </span>
                        {serv.requires_deposit && (
                          <span className="text-[9px] font-bold text-primary block mt-0.5">Seña: ${formatCurrency(serv.deposit_amount)}</span>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                    </div>

                    {/* Chevron always visible on mobile at the right side */}
                    <div className="flex sm:hidden shrink-0">
                      <ChevronRight className="h-5 w-5 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* STEP 3: DATE & TIME SELECTION */}
      {step === 'date_time' && selectedService && (
        <Card>
          <CardHeader className="border-b border-neutral-100 pb-4">
            <CardTitle>Selecciona Fecha y Horario</CardTitle>
            <p className="text-sm text-gray-500 font-semibold">
              Para: <strong>{selectedService.name}</strong> ({selectedService.estimated_duration_minutes} mins)
            </p>
          </CardHeader>

          <CardContent className="py-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom Month Calendar Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-neutral-50 p-2 rounded-xl border border-neutral-200/50">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    disabled={isPrevMonthDisabled()}
                    className={`p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    &lt;
                  </button>
                  <span className="text-sm font-bold text-offblack">
                    {MONTHS[calendarMonth]} {calendarYear}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer font-bold"
                  >
                    &gt;
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] sm:text-xs text-gray-400 border-b border-neutral-100 pb-2">
                  {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {getDaysInMonth(calendarYear, calendarMonth).map((day, idx) => {
                    if (!day) return <div key={idx} className="aspect-square"></div>;

                    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                    const todayStr = today.toISOString().split('T')[0];
                    const isPast = dateStr < todayStr;

                    const weekdayMap = selectedService ? [
                      selectedService.enabled_sunday,
                      selectedService.enabled_monday,
                      selectedService.enabled_tuesday,
                      selectedService.enabled_wednesday,
                      selectedService.enabled_thursday,
                      selectedService.enabled_friday,
                      selectedService.enabled_saturday
                    ] : Array(7).fill(false);
                    const isWeekdayEnabled = weekdayMap[day.getDay()];
                    const isDayAvailable = availableDays.has(dateStr);
                    const isSelectable = !isPast && isWeekdayEnabled && isDayAvailable;
                    const isSelected = bookingDate === dateStr;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!isSelectable}
                        onClick={() => setBookingDate(dateStr)}
                        className={`aspect-square text-xs font-bold rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${isSelected
                          ? 'bg-primary text-white border-transparent shadow-sm'
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

              {/* Time Slots */}
              <div className="flex flex-col gap-2 justify-start">
                <label className="text-sm font-bold text-offblack flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-primary" /> Horarios Disponibles
                </label>

                {!bookingDate ? (
                  <div className="p-6 bg-neutral-50 border border-dashed border-neutral-200 text-center text-sm font-bold text-gray-400 rounded-xl flex-1 flex items-center justify-center">
                    Selecciona un día en el calendario.
                  </div>
                ) : loadingSlots ? (
                  <div className="text-center py-6 text-sm font-bold text-gray-400 flex-1 flex items-center justify-center animate-pulse">
                    Cargando horarios...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-4 bg-danger/5 border border-danger/15 text-center text-sm font-bold text-danger rounded-xl flex-1 flex items-center justify-center">
                    Sin horarios disponibles para esta fecha.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 overflow-y-auto max-h-60 p-0.5">
                    {availableSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-2 px-1 text-center font-bold border rounded-lg cursor-pointer text-xs transition-all hover:scale-[1.02] active:scale-[0.98] ${!slot.available
                          ? 'bg-neutral-50 text-gray-300 border-neutral-100 cursor-not-allowed opacity-40'
                          : selectedTime === slot.time
                            ? 'bg-primary text-white border-transparent shadow-sm'
                            : 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50'
                          }`}
                        title={slot.reason}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedTime && (
              <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 text-left">
                <div>
                  <h4 className="text-sm font-bold text-offblack m-0">Cantidad de turnos / mascotas</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-1">¿Para cuántas mascotas deseas agendar el servicio simultáneamente?</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={bookingQuantity}
                    onChange={(e) => setBookingQuantity(Number(e.target.value))}
                    className="border border-neutral-200 p-2.5 text-sm font-bold rounded-lg bg-white focus:outline-none focus:border-primary min-w-[120px]"
                  >
                    {Array.from({ length: availableSlots.find(s => s.time === selectedTime)?.remainingCapacity ?? (selectedService.max_concurrent_bookings ?? 1) }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'Mascota' : 'Mascotas'}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Price breakdown summary */}
            <div className="border-t border-neutral-100 pt-4 mt-4 bg-neutral-50/50 p-4 rounded-xl space-y-2 text-sm text-left">
              <div className="flex justify-between items-center font-bold text-offblack">
                <span>Precio del servicio ({bookingQuantity} {bookingQuantity === 1 ? 'turno' : 'turnos'}):</span>
                <span>{selectedService.price === 0 ? 'Sin definir' : `$${formatCurrency(selectedService.price * bookingQuantity)}`}</span>
              </div>
              {selectedService.requires_deposit && (
                <div className="flex justify-between items-center font-bold text-primary">
                  <span>Monto de Seña (Mercado Pago):</span>
                  <span>${formatCurrency(selectedService.deposit_amount * bookingQuantity)}</span>
                </div>
              )}
              {selectedService.price > 0 && (
                <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                  <span>Restante a pagar en local:</span>
                  <span>
                    ${formatCurrency(
                      selectedService.requires_deposit
                        ? (selectedService.price - selectedService.deposit_amount) * bookingQuantity
                        : selectedService.price * bookingQuantity
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-neutral-100 pt-4 flex justify-between">
              <Button variant="secondary" onClick={() => setStep('service')} className="flex items-center gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button
                variant="primary"
                disabled={!bookingDate || !selectedTime}
                onClick={() => setStep('client_info')}
              >
                Continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: CLIENT DETAILS */}
      {step === 'client_info' && selectedService && (
        <Card>
          <CardHeader>
            <CardTitle>Completa tus Datos</CardTitle>
            <p className="text-sm text-gray-500 font-semibold">
              Turno para el <strong>{formatDate(bookingDate)}</strong> a las <strong>{selectedTime} hs</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleClientSubmit} className="space-y-4">
              <Input
                label="Teléfono Móvil (WhatsApp)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneSearch}
                placeholder="Ej: 2644567890 (Sin 0 ni 15)"
                disabled={loadingClient}
                required
              />

              {clientExists && (
                <div className="bg-success/10 border border-success/20 p-3 rounded-lg text-xs font-bold text-success flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> ¡Hola de nuevo! Autocompletamos tus datos guardados.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nombre"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Tu nombre"
                  disabled={loadingClient}
                  required
                />
                <Input
                  label="Apellido"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Tu apellido"
                  disabled={loadingClient}
                  required
                />
              </div>

              <Input
                label="Correo Electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                error={clientFormError}
                disabled={loadingClient}
                required
              />

              {/* Price breakdown summary */}
              <div className="border-t border-neutral-100 pt-4 bg-neutral-50/50 p-4 rounded-xl space-y-2 text-sm text-left">
                <div className="flex justify-between items-center font-bold text-offblack">
                  <span>Precio del servicio ({bookingQuantity} {bookingQuantity === 1 ? 'turno' : 'turnos'}):</span>
                  <span>{selectedService.price === 0 ? 'Sin definir' : `$${formatCurrency(selectedService.price * bookingQuantity)}`}</span>
                </div>
                {selectedService.requires_deposit && (
                  <div className="flex justify-between items-center font-bold text-primary">
                    <span>Monto de Seña (Mercado Pago):</span>
                    <span>${formatCurrency(selectedService.deposit_amount * bookingQuantity)}</span>
                  </div>
                )}
                {selectedService.price > 0 && (
                  <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                    <span>Restante a pagar en local:</span>
                    <span>
                      ${formatCurrency(
                        selectedService.requires_deposit
                          ? (selectedService.price - selectedService.deposit_amount) * bookingQuantity
                          : selectedService.price * bookingQuantity
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-neutral-100 pt-4 mt-6 flex justify-between">
                <Button type="button" variant="secondary" onClick={() => setStep('date_time')} className="flex items-center gap-1.5">
                  <ChevronLeft className="h-4 w-4" /> Atrás
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={loadingClient}
                  disabled={loadingClient || !email || !firstName || !lastName || !phone}
                >
                  {selectedService.requires_deposit ? 'Ir al Pago' : 'Confirmar Reserva'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: PAYMENT METHOD */}
      {step === 'payment_sim' && selectedService && (
        <Card className="border border-neutral-200">
          <CardHeader className="bg-neutral-50/50 p-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <svg role="img" viewBox="0 0 24 24" className="h-6 w-6 fill-[#009ee3] shrink-0" xmlns="http://www.w3.org/2000/svg">
                <title>Mercado Pago</title>
                <path d="M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z" />
              </svg>
              <CardTitle className="text-offblack">Abonar Seña de Reserva</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="py-6 text-center space-y-6">
            <div className="max-w-md mx-auto space-y-4">
              <h4 className="text-lg font-bold text-offblack">Monto de la Seña a Pagar ({bookingQuantity} {bookingQuantity === 1 ? 'turno' : 'turnos'}):</h4>
              <div className="text-3xl font-extrabold text-primary bg-neutral-50 border border-neutral-200 py-4 rounded-xl tracking-tight">
                ${formatCurrency(selectedService.deposit_amount * bookingQuantity)}
              </div>

              {selectedService.price === 0 ? (
                <div className="bg-amber-50/60 border border-amber-100 p-4 rounded-xl text-xs font-bold text-amber-700 text-left flex gap-3 max-w-lg mx-auto leading-relaxed">
                  <Info className="h-5 w-5 flex-shrink-0 text-amber-600" />
                  <div>
                    Este servicio tiene un precio <strong>a definir en el local</strong>. Hoy solo abonas la seña de <strong>${formatCurrency(selectedService.deposit_amount * bookingQuantity)}</strong> para reservar tu lugar.
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-50/50 p-4 rounded-xl border border-neutral-200 text-xs text-left space-y-2 text-gray-500 font-semibold">
                  <div className="flex justify-between border-b border-neutral-200 pb-1.5">
                    <span>Precio del Servicio:</span>
                    <span>${formatCurrency(selectedService.price * bookingQuantity)}</span>
                  </div>
                  <div className="flex justify-between border-b border-neutral-200 pb-1.5 text-primary">
                    <span>Seña a abonar:</span>
                    <span>-${formatCurrency(selectedService.deposit_amount * bookingQuantity)}</span>
                  </div>
                  <div className="flex justify-between text-success font-extrabold text-sm">
                    <span>Restante a pagar en local:</span>
                    <span>${formatCurrency((selectedService.price - selectedService.deposit_amount) * bookingQuantity)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-xl text-xs font-bold text-blue-700 text-left flex gap-3 max-w-lg mx-auto">
              <ShieldCheck className="h-5 w-5 flex-shrink-0 text-blue-600" />
              <div>
                <span>Al acreditarse la seña, el turno quedará automáticamente confirmado y recibirás los detalles en tu correo.</span>
              </div>
            </div>

            {preferenceError && (
              <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger max-w-lg mx-auto">
                {preferenceError}
              </div>
            )}

            <div className="flex justify-center gap-4 pt-4">
              <Button variant="secondary" onClick={() => setStep('client_info')} className="flex items-center gap-1.5" disabled={loadingPreference}>
                <ChevronLeft className="h-4 w-4" /> Cancelar y Volver
              </Button>
              <button
                type="button"
                onClick={handlePayWithMercadoPago}
                disabled={loadingPreference}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 font-extrabold text-sm text-white rounded-xl transition-all shadow-sm focus:outline-none ${loadingPreference
                  ? 'bg-[#009ee3]/70 cursor-not-allowed pointer-events-none'
                  : 'bg-[#009ee3] hover:bg-[#008cd0] hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                  }`}
              >
                {loadingPreference ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Procesando...
                  </span>
                ) : (
                  <>
                    <svg role="img" viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z" />
                    </svg>
                    Pagar
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 6: SUCCESS & ICS CALENDAR DOWNLOAD */}
      {step === 'success' && selectedService && (
        <Card className="border border-success/20">
          <CardContent className="py-8 text-center space-y-6">
            <div className="flex flex-col items-center justify-center gap-2 text-success">
              <CheckCircle2 className="h-16 w-16 animate-bounce" />
              <h2 className="text-3xl font-extrabold text-offblack mt-2">¡Reserva Confirmada!</h2>
              <p className="text-gray-500 font-semibold">Tu turno ha sido registrado correctamente.</p>
            </div>

            <div className="max-w-md mx-auto bg-neutral-50 border border-neutral-100 p-6 rounded-2xl text-left space-y-3 shadow-inner">
              <h4 className="font-extrabold border-b border-neutral-200 pb-2 text-base text-offblack flex items-center gap-1.5">
                Detalles del Turno
              </h4>

              <div className="space-y-2.5 text-sm text-gray-600 font-semibold">
                <p className="flex items-center gap-2.5">
                  <Scissors className="h-4 w-4 text-secondary flex-shrink-0" />
                  <span><strong>Servicio:</strong> {selectedService.name}</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <Scissors className="h-4 w-4 text-secondary flex-shrink-0" />
                  <span><strong>Cantidad de turnos / mascotas:</strong> {bookingQuantity}</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-secondary flex-shrink-0" />
                  <span><strong>Fecha:</strong> {formatDate(bookingDate)}</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-secondary flex-shrink-0" />
                  <span><strong>Horario:</strong> {selectedTime} hs</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-secondary flex-shrink-0" />
                  <span><strong>Cliente:</strong> {firstName} {lastName}</span>
                </p>

                {/* Price break in ticket */}
                <div className="border-t border-neutral-200/50 pt-2.5 mt-2 space-y-1.5 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Precio Total:</span>
                    <span>{selectedService.price === 0 ? 'Sin definir' : `$${formatCurrency(selectedService.price * bookingQuantity)}`}</span>
                  </div>
                  {selectedService.requires_deposit && (
                    <div className="flex justify-between text-success">
                      <span>Seña Abonada (MP):</span>
                      <span>-${formatCurrency(selectedService.deposit_amount * bookingQuantity)} (Ref: {paymentId})</span>
                    </div>
                  )}
                  {selectedService.price > 0 && (
                    <div className="flex justify-between text-offblack font-bold text-sm border-t border-dashed border-neutral-200 pt-1.5">
                      <span>Restante a pagar en local:</span>
                      <span>
                        ${formatCurrency(
                          selectedService.requires_deposit
                            ? (selectedService.price - selectedService.deposit_amount) * bookingQuantity
                            : selectedService.price * bookingQuantity
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-secondary/5 border border-secondary/15 p-4 rounded-xl text-xs font-bold text-secondary text-left max-w-md mx-auto flex items-start gap-2.5">
              <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Se ha enviado un correo electrónico de confirmación a <strong>{email}</strong> y un mensaje por WhatsApp a <strong>{phone}</strong>.</span>
            </div>

            <div className="space-y-3 max-w-sm mx-auto pt-4">
              {/* 1. Google Calendar */}
              <a
                href={getGoogleCalendarUrl({
                  serviceName: selectedService.name,
                  date: bookingDate,
                  time: selectedTime,
                  durationMinutes: selectedService.estimated_duration_minutes,
                  businessName: settings?.business_name || 'Negocio',
                  address: settings?.address || ''
                })}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center flex items-center justify-center gap-2 no-underline py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer text-sm"
              >
                Agregar a Google Calendar
              </a>

              {/* 2. Otros Calendarios */}
              <Button
                variant="secondary"
                onClick={() => downloadICSFile({
                  serviceName: selectedService.name,
                  date: bookingDate,
                  time: selectedTime,
                  durationMinutes: selectedService.estimated_duration_minutes,
                  businessName: settings?.business_name || 'Negocio',
                  address: settings?.address || ''
                })}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                Otros Calendarios (.ics)
              </Button>

              {/* 4. Finalizar Button */}
              <div className="border-t border-neutral-100 pt-4 mt-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (categories.length === 1) {
                      setStep('service');
                      setSelectedCategory(categories[0].id);
                    } else {
                      setStep('category');
                      setSelectedCategory(null);
                    }
                    setSelectedService(null);
                    setBookingDate('');
                    setSelectedTime('');
                    setBookingQuantity(1);
                    setEmail('');
                    setFirstName('');
                    setLastName('');
                    setPhone('');
                    setClientExists(false);
                    setClientId('');
                    setPaymentId('');
                  }}
                  className="w-full py-3 bg-secondary hover:bg-teal-700 text-white rounded-xl text-sm"
                >
                  Finalizar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
