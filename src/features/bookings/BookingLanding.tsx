import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { getAvailableSlots, type BookingSlot } from '../../utils/availability';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { notifications } from '../../lib/notifications';
import { downloadICSFile, getGoogleCalendarUrl } from '../../lib/calendar';
import { Calendar, Clock, CheckCircle2, ShieldCheck, CreditCard, ChevronRight, ChevronLeft, Scissors, User, Mail } from 'lucide-react';

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

  // Payment status
  const [paymentId, setPaymentId] = useState<string>('');

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
      const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
      const candidateDays: string[] = [];
      const todayStr = new Date().toISOString().split('T')[0];

      // Service weekday configuration (0=Sunday, 1=Monday, etc.)
      const weekdayMap = [
        currentService.enabled_sunday,
        currentService.enabled_monday,
        currentService.enabled_tuesday,
        currentService.enabled_wednesday,
        currentService.enabled_thursday,
        currentService.enabled_friday,
        currentService.enabled_saturday
      ];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        // Filter out past dates
        if (dateStr < todayStr) continue;

        // Filter out by active weekdays
        const dateObj = new Date(calendarYear, calendarMonth, d);
        const dayOfWeek = dateObj.getDay();
        if (!weekdayMap[dayOfWeek]) continue;

        candidateDays.push(dateStr);
      }

      try {
        const checkPromises = candidateDays.map(async (dayStr) => {
          const slots = await getAvailableSlots({ serviceId: currentService.id, dateStr: dayStr });
          const hasSlots = slots.some(s => s.available);
          return { dayStr, hasSlots };
        });

        const results = await Promise.all(checkPromises);

        if (!isCancelled) {
          const activeDays = new Set<string>();
          results.forEach(r => {
            if (r.hasSlots) {
              activeDays.add(r.dayStr);
            }
          });
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

  // 5. Client Lookup by Email (Triggers onBlur)
  const handleEmailSearch = async () => {
    if (!email) {
      setClientFormError('');
      setFirstName('');
      setLastName('');
      setPhone('');
      setClientId('');
      setClientExists(false);
      return;
    }
    if (!email.includes('@')) {
      setClientFormError('Por favor ingrese un correo electrónico válido');
      return;
    }
    setClientFormError('');
    setLoadingClient(true);

    try {
      const { data: clients, error } = await supabase.from('clients').select('*').eq('email', email);
      if (error) throw error;

      if (clients && clients.length > 0) {
        const client = clients[0];
        setFirstName(client.first_name);
        setLastName(client.last_name);
        setPhone(client.phone);
        setClientId(client.id);
        setClientExists(true);
      } else {
        setFirstName('');
        setLastName('');
        setPhone('');
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
            phone
          })
          .eq('id', clientId);
        if (error) throw error;
      } else {
        // Create new client
        const { data: newClient, error } = await supabase.from('clients').insert({
          email,
          first_name: firstName,
          last_name: lastName,
          phone
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

  // 7. Final Confirmation of Booking
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
          quantity: bookingQuantity
        });

        setStep('success');
      }
    } catch (err) {
      console.error(err);
      alert('Error al confirmar la reserva.');
    }
  };

  // 8. Simulate Mercado Pago Webhook
  const handlePaymentSuccessSim = async () => {
    const mockPaymentId = `mp_${Math.floor(10000000 + Math.random() * 90000000)}`;
    setPaymentId(mockPaymentId);
    await confirmBooking(clientId, mockPaymentId);
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
        <p className="text-gray-400 mt-1 font-semibold text-sm">Tienda de Mascotas Del Bono</p>
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
            className={`py-2 px-1.5 rounded-lg transition-all border ${
              s.active 
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
                        <span className="text-xs font-extrabold text-offblack">${serv.price.toFixed(0)}</span>
                        {serv.requires_deposit && (
                          <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                            Seña: ${serv.deposit_amount.toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price info on desktop, hidden on mobile */}
                    <div className="hidden sm:flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Precio Total</span>
                        <span className="text-sm font-extrabold text-offblack">${serv.price.toFixed(0)}</span>
                        {serv.requires_deposit && (
                          <span className="text-[9px] font-bold text-primary block mt-0.5">Seña: ${serv.deposit_amount.toFixed(0)}</span>
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
                        className={`aspect-square text-xs font-bold rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center ${
                          isSelected
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
                        className={`py-2 px-1 text-center font-bold border rounded-lg cursor-pointer text-xs transition-all hover:scale-[1.02] active:scale-[0.98] ${
                          !slot.available 
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
                <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
              </div>
              {selectedService.requires_deposit ? (
                <>
                  <div className="flex justify-between items-center font-bold text-primary">
                    <span>Monto de Seña (Mercado Pago):</span>
                    <span>${(selectedService.deposit_amount * bookingQuantity).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                    <span>Restante a pagar en local:</span>
                    <span>${((selectedService.price - selectedService.deposit_amount) * bookingQuantity).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                  <span>Restante a pagar en local:</span>
                  <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
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
              Turno para el <strong>{bookingDate}</strong> a las <strong>{selectedTime} hs</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleClientSubmit} className="space-y-4">
              <Input
                label="Correo Electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailSearch}
                placeholder="ejemplo@correo.com"
                error={clientFormError}
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
                label="Teléfono Móvil (WhatsApp)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2645012345"
                disabled={loadingClient}
                required
              />

              {/* Price breakdown summary */}
              <div className="border-t border-neutral-100 pt-4 bg-neutral-50/50 p-4 rounded-xl space-y-2 text-sm text-left">
                <div className="flex justify-between items-center font-bold text-offblack">
                  <span>Precio del servicio ({bookingQuantity} {bookingQuantity === 1 ? 'turno' : 'turnos'}):</span>
                  <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
                </div>
                {selectedService.requires_deposit ? (
                  <>
                    <div className="flex justify-between items-center font-bold text-primary">
                      <span>Monto de Seña (Mercado Pago):</span>
                      <span>${(selectedService.deposit_amount * bookingQuantity).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                      <span>Restante a pagar en local:</span>
                      <span>${((selectedService.price - selectedService.deposit_amount) * bookingQuantity).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center font-extrabold text-success border-t border-dashed border-neutral-200 pt-2 text-base">
                    <span>Restante a pagar en local:</span>
                    <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
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

      {/* STEP 5: PAYMENT SIMULATION */}
      {step === 'payment_sim' && selectedService && (
        <Card className="border border-secondary/20">
          <CardHeader className="bg-secondary/5 p-4 border-b border-neutral-100">
            <div className="flex items-center gap-2 text-secondary">
              <CreditCard className="h-6 w-6" />
              <CardTitle className="text-offblack">Pasarela de Pago (Simulador Mercado Pago)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="py-6 text-center space-y-6">
            <div className="max-w-md mx-auto space-y-4">
              <h4 className="text-lg font-bold text-offblack">Monto de la Seña a Pagar ({bookingQuantity} {bookingQuantity === 1 ? 'turno' : 'turnos'}):</h4>
              <div className="text-3xl font-extrabold text-primary bg-neutral-50 border border-neutral-200 py-4 rounded-xl tracking-tight">
                ${(selectedService.deposit_amount * bookingQuantity).toFixed(2)}
              </div>

              <div className="bg-neutral-50/50 p-4 rounded-xl border border-neutral-200 text-xs text-left space-y-2 text-gray-500 font-semibold">
                <div className="flex justify-between border-b border-neutral-200 pb-1.5">
                  <span>Precio del Servicio:</span>
                  <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-neutral-200 pb-1.5 text-primary">
                  <span>Seña a abonar:</span>
                  <span>-${(selectedService.deposit_amount * bookingQuantity).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-success font-extrabold text-sm">
                  <span>Restante a pagar en local:</span>
                  <span>${((selectedService.price - selectedService.deposit_amount) * bookingQuantity).toFixed(2)}</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 font-semibold mt-2">
                Esta es una simulación del webhook de Mercado Pago para procesar y autorizar la reserva de forma segura.
              </p>
            </div>

            <div className="bg-yellow-50/50 border border-warning/20 p-4 rounded-xl text-xs font-bold text-warning text-left flex gap-3 max-w-lg mx-auto">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <div>
                <span>Tu reserva está temporalmente retenida. Al confirmar el pago exitoso, la base de datos registrará el webhook de MP, agendará tu turno y te enviará confirmación automática por WhatsApp y Mail.</span>
              </div>
            </div>

            <div className="flex justify-center gap-4 pt-4">
              <Button variant="secondary" onClick={() => setStep('client_info')} className="flex items-center gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Cancelar y Volver
              </Button>
              <Button variant="primary" onClick={handlePaymentSuccessSim} className="bg-success hover:bg-emerald-600">
                Simular Pago Exitoso
              </Button>
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
                  <span><strong>Fecha:</strong> {bookingDate}</span>
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
                    <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
                  </div>
                  {selectedService.requires_deposit ? (
                    <>
                      <div className="flex justify-between text-success">
                        <span>Seña Abonada (MP):</span>
                        <span>-${(selectedService.deposit_amount * bookingQuantity).toFixed(2)} (Ref: {paymentId})</span>
                      </div>
                      <div className="flex justify-between text-offblack font-bold text-sm border-t border-dashed border-neutral-200 pt-1.5">
                        <span>Restante a pagar en local:</span>
                        <span>${((selectedService.price - selectedService.deposit_amount) * bookingQuantity).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-offblack font-bold text-sm border-t border-dashed border-neutral-200 pt-1.5">
                      <span>Restante a pagar en local:</span>
                      <span>${(selectedService.price * bookingQuantity).toFixed(2)}</span>
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
                  businessName: settings?.business_name || 'Tienda de Mascotas Del Bono',
                  address: settings?.address || 'Av. Del Bono 123, San Juan'
                })}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center flex items-center justify-center gap-2 no-underline py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer text-sm"
              >
                Agregar a Google Calendar
              </a>

              {/* 2. Apple Calendar */}
              <Button 
                variant="secondary" 
                onClick={() => downloadICSFile({
                  serviceName: selectedService.name,
                  date: bookingDate,
                  time: selectedTime,
                  durationMinutes: selectedService.estimated_duration_minutes,
                  businessName: settings?.business_name || 'Tienda de Mascotas Del Bono',
                  address: settings?.address || 'Av. Del Bono 123, San Juan'
                })}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                Agregar a Apple Calendar (Descargar .ics)
              </Button>

              {/* 3. Otros Calendarios */}
              <Button 
                variant="ghost" 
                onClick={() => downloadICSFile({
                  serviceName: selectedService.name,
                  date: bookingDate,
                  time: selectedTime,
                  durationMinutes: selectedService.estimated_duration_minutes,
                  businessName: settings?.business_name || 'Tienda de Mascotas Del Bono',
                  address: settings?.address || 'Av. Del Bono 123, San Juan'
                })}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gray-500 hover:text-offblack"
              >
                Descargar para otros Calendarios (.ics)
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
