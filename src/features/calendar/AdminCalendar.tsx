import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { getAvailableSlots, type BookingSlot } from '../../utils/availability';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { notifications } from '../../lib/notifications';
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, CheckCircle, XCircle, RefreshCw, CalendarRange, Plus } from 'lucide-react';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const CALENDAR_HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

const translateStatus = (status: string) => {
  switch (status) {
    case 'PENDING_PAYMENT': return 'Pendiente Pago';
    case 'CONFIRMED': return 'Confirmado';
    case 'CANCELLED': return 'Cancelado';
    case 'RESCHEDULED': return 'Reprogramado';
    case 'COMPLETED': return 'Completado';
    case 'NO_SHOW': return 'Ausente';
    default: return status;
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'CONFIRMED': return 'bg-success/10 text-success';
    case 'COMPLETED': return 'bg-secondary/10 text-secondary';
    case 'PENDING_PAYMENT': return 'bg-amber-100 text-amber-700';
    case 'CANCELLED': return 'bg-danger/10 text-danger';
    case 'RESCHEDULED': return 'bg-primary/10 text-primary';
    default: return 'bg-neutral-100 text-gray-500';
  }
};

interface Booking {
  id: string;
  client_id: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  duration: number;
  deposit_amount: number;
  payment_id: string | null;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | 'NO_SHOW';
  notes: string | null;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  services: {
    name: string;
    estimated_duration_minutes: number;
  };
}

interface Service {
  id: string;
  name: string;
  estimated_duration_minutes: number;
}

export const AdminCalendar: React.FC = () => {
  // Calendar views
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals state
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [isManualBookingOpen, setIsManualBookingOpen] = useState<boolean>(false);
  
  // Rescheduling details
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleSlots, setRescheduleSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState<string>('');
  const [loadingReschedSlots, setLoadingReschedSlots] = useState<boolean>(false);

  // Manual booking details
  const [services, setServices] = useState<Service[]>([]);
  const [manualServiceId, setManualServiceId] = useState<string>('');
  const [manualEmail, setManualEmail] = useState<string>('');
  const [manualFirstName, setManualFirstName] = useState<string>('');
  const [manualLastName, setManualLastName] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>('');
  const [manualSlots, setManualSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [manualTime, setManualTime] = useState<string>('');
  const [manualClientExists, setManualClientExists] = useState<boolean>(false);
  const [manualNotes, setManualNotes] = useState<string>('');
  const [loadingManualSlots, setLoadingManualSlots] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string>('');

  // Weekly dates calculation
  const getWeekDates = (baseDateStr: string) => {
    const baseDate = new Date(baseDateStr + 'T00:00:00');
    const day = baseDate.getDay();
    const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(baseDate.setDate(diff));

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  // Monthly calendar dates calculation
  const getDaysInMonth = (baseDateStr: string) => {
    const baseDate = new Date(baseDateStr + 'T00:00:00');
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    
    let startOffset = firstDay.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }

    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  // Day View Renderer
  const renderDayView = () => {
    return (
      <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden text-left">
        <div className="bg-neutral-50 p-4 border-b border-neutral-150 flex justify-between items-center">
          <span className="text-sm font-bold text-offblack">Horario</span>
          <span className="text-sm font-bold text-offblack">Turnos del Día ({currentDate})</span>
        </div>

        <div className="divide-y divide-neutral-100">
          {CALENDAR_HOURS.map(hour => {
            const hourPrefix = hour.split(':')[0];
            const hourBookings = bookings.filter(b => 
              b.booking_date === currentDate && 
              b.booking_time.startsWith(hourPrefix)
            );

            return (
              <div key={hour} className="flex min-h-[60px] transition-all hover:bg-neutral-50/20">
                <div className="w-20 shrink-0 bg-neutral-50/50 border-r border-neutral-100 p-3 text-xs font-bold text-gray-500 flex items-center justify-center">
                  {hour} hs
                </div>
                
                <div className="flex-1 p-3 flex flex-wrap gap-2 items-center">
                  {hourBookings.length === 0 ? (
                    <span className="text-[10px] font-semibold text-gray-300 italic">Sin turnos agendados</span>
                  ) : (
                    hourBookings.map(b => (
                      <div 
                        key={b.id}
                        onClick={() => {
                          setSelectedBooking(b);
                          setIsDetailsOpen(true);
                        }}
                        className={`text-xs py-2 px-3 border border-neutral-200 rounded-xl cursor-pointer shadow-xs transition-all hover:scale-[1.02] flex items-center gap-2 max-w-xs ${
                          b.status === 'CANCELLED' ? 'bg-danger/5 opacity-60' : 'bg-white hover:border-primary/30'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${b.status === 'CONFIRMED' ? 'bg-success' : b.status === 'COMPLETED' ? 'bg-secondary' : 'bg-warning'}`} />
                        <div>
                          <p className="font-extrabold text-offblack m-0 leading-tight">{b.services?.name}</p>
                          <p className="text-[10px] text-gray-500 font-semibold m-0">{b.booking_time.substring(0, 5)} hs | {b.clients?.first_name} {b.clients?.last_name}.</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Week View Renderer
  const renderWeekView = () => {
    const weekDates = getWeekDates(currentDate);

    return (
      <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-x-auto text-left">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-150">
              <th className="w-20 p-3 text-xs font-bold text-gray-500 text-center border-r border-neutral-100">Horario</th>
              {weekDates.map((date, idx) => {
                const dateStr = date.toISOString().split('T')[0];
                const isFocused = dateStr === currentDate;
                return (
                  <th key={idx} className={`p-3 text-xs font-bold text-offblack text-center border-r border-neutral-100 last:border-r-0 ${isFocused ? 'bg-primary/5 text-primary' : ''}`}>
                    <div>{WEEKDAYS[idx]}</div>
                    <div className="text-[10px] text-gray-400 font-semibold mt-0.5">{dateStr.substring(5)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {CALENDAR_HOURS.map(hour => {
              const hourPrefix = hour.split(':')[0];
              return (
                <tr key={hour} className="hover:bg-neutral-50/10">
                  <td className="w-20 bg-neutral-50/50 p-2 text-[10px] font-bold text-gray-500 text-center border-r border-neutral-100 align-middle">
                    {hour} hs
                  </td>
                  
                  {weekDates.map((date, idx) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const dayBookings = bookings.filter(b => 
                      b.booking_date === dateStr && 
                      b.booking_time.startsWith(hourPrefix)
                    );

                    return (
                      <td key={idx} className="p-2 border-r border-neutral-100 last:border-r-0 align-middle min-w-[90px]">
                        <div className="flex flex-col gap-1.5 justify-center">
                          {dayBookings.map(b => (
                            <div 
                              key={b.id}
                              onClick={() => {
                                setSelectedBooking(b);
                                setIsDetailsOpen(true);
                              }}
                              className={`text-[9px] p-1.5 border border-neutral-200 rounded-lg cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-1 shadow-2xs ${
                                b.status === 'CANCELLED' ? 'bg-danger/5 opacity-60 line-through' : 'bg-white hover:border-primary/25'
                              }`}
                              title={`${b.services?.name} - ${b.booking_time.substring(0, 5)} hs`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.status === 'CONFIRMED' ? 'bg-success' : b.status === 'COMPLETED' ? 'bg-secondary' : 'bg-warning'}`} />
                              <span className="font-extrabold truncate text-offblack leading-none">{b.services?.name}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Month View Renderer
  const renderMonthView = () => {
    const days = getDaysInMonth(currentDate);
    const dateObj = new Date(currentDate + 'T00:00:00');
    const monthName = MONTHS[dateObj.getMonth()];
    const yearNum = dateObj.getFullYear();

    return (
      <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm p-4 space-y-4 text-left">
        <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
          <h3 className="text-base font-bold text-offblack m-0">{monthName} de {yearNum}</h3>
          <span className="text-[10px] font-bold text-gray-400">Haz clic en un día para enfocar</span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] sm:text-xs text-gray-400 border-b border-neutral-100 pb-2">
          {WEEKDAYS.map((d, i) => <div key={i}>{d.substring(0, 3)}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, idx) => {
            if (!day) return <div key={idx} className="aspect-square bg-neutral-50/20 border border-transparent rounded-lg"></div>;

            const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            const dayBookings = bookings.filter(b => b.booking_date === dateStr);
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            const isFocused = currentDate === dateStr;

            return (
              <div 
                key={idx}
                onClick={() => {
                  setCurrentDate(dateStr);
                  setView('day');
                }}
                className={`min-h-[70px] p-1.5 border rounded-lg cursor-pointer transition-all flex flex-col justify-between ${
                  isFocused 
                    ? 'border-primary bg-primary/5 shadow-2xs' 
                    : isToday
                      ? 'border-secondary/35 bg-secondary/5'
                      : 'border-neutral-200 hover:border-primary/20 bg-white'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-extrabold ${isFocused ? 'text-primary' : 'text-gray-400'}`}>
                    {day.getDate()}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="bg-primary/10 text-primary text-[8px] font-bold px-1.5 py-0.2 rounded-full">
                      {dayBookings.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1 mt-1 overflow-y-auto max-h-[45px] pr-0.5">
                  {dayBookings.slice(0, 3).map(b => (
                    <div 
                      key={b.id} 
                      className={`text-[8px] px-1 py-0.5 rounded border border-neutral-100 font-bold truncate flex items-center gap-1 ${
                        b.status === 'CANCELLED' ? 'bg-danger/5 opacity-50 line-through' : 'bg-neutral-50'
                      }`}
                      title={`${b.booking_time.substring(0, 5)} - ${b.services?.name}`}
                    >
                      <span className={`w-1 h-1 rounded-full shrink-0 ${b.status === 'CONFIRMED' ? 'bg-success' : b.status === 'COMPLETED' ? 'bg-secondary' : 'bg-warning'}`} />
                      <span>{b.booking_time.substring(0, 5)}</span>
                    </div>
                  ))}
                  {dayBookings.length > 3 && (
                    <div className="text-[7px] text-gray-400 font-bold text-center">
                      +{dayBookings.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 1. Fetch bookings based on range
  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*, clients(*), services(*)');

        if (error) throw error;

        if (data) {
          const filterDateObj = new Date(currentDate + 'T00:00:00');
          let filtered = data as Booking[];

          if (view === 'day') {
            filtered = filtered.filter(b => b.booking_date === currentDate);
          } else if (view === 'week') {
            const startOfWeek = new Date(filterDateObj);
            startOfWeek.setDate(filterDateObj.getDate() - filterDateObj.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            const startStr = startOfWeek.toISOString().split('T')[0];
            const endStr = endOfWeek.toISOString().split('T')[0];

            filtered = filtered.filter(b => b.booking_date >= startStr && b.booking_date <= endStr);
          } else if (view === 'month') {
            const currentYear = filterDateObj.getFullYear();
            const currentMonth = filterDateObj.getMonth(); // 0-11
            
            filtered = filtered.filter(b => {
              const bDate = new Date(b.booking_date + 'T00:00:00');
              return bDate.getFullYear() === currentYear && bDate.getMonth() === currentMonth;
            });
          }

          // Sort by date, then time
          filtered.sort((a, b) => {
            if (a.booking_date !== b.booking_date) {
              return a.booking_date.localeCompare(b.booking_date);
            }
            return a.booking_time.localeCompare(b.booking_time);
          });

          setBookings(filtered);
        }
      } catch (err) {
        console.error('Error fetching bookings:', err);
      } finally {
        setLoading(false);
      }
    }

    loadBookings();
  }, [currentDate, view]);

  // Load active services list for manual booking
  useEffect(() => {
    supabase.from('services').select('id, name, estimated_duration_minutes').eq('active', true)
      .then(({ data }: any) => {
        if (data) {
          setServices(data);
          if (data.length > 0) setManualServiceId(data[0].id);
        }
      });
  }, []);

  // Fetch rescheduling slots
  useEffect(() => {
    if (selectedBooking && rescheduleDate) {
      setLoadingReschedSlots(true);
      getAvailableSlots({ serviceId: selectedBooking.service_id, dateStr: rescheduleDate })
        .then((slots: BookingSlot[]) => {
          setRescheduleSlots(slots);
          setLoadingReschedSlots(false);
        });
    }
  }, [selectedBooking, rescheduleDate]);

  // Fetch manual booking slots
  useEffect(() => {
    if (manualServiceId && manualDate) {
      setLoadingManualSlots(true);
      getAvailableSlots({ serviceId: manualServiceId, dateStr: manualDate })
        .then((slots: BookingSlot[]) => {
          setManualSlots(slots);
          setLoadingManualSlots(false);
        });
    }
  }, [manualServiceId, manualDate]);

  // Handle client search for manual booking
  const handleManualEmailSearch = async () => {
    if (!manualEmail) return;
    try {
      const { data } = await supabase.from('clients').select('*').eq('email', manualEmail);
      if (data && data.length > 0) {
        setManualFirstName(data[0].first_name);
        setManualLastName(data[0].last_name);
        setManualPhone(data[0].phone);
        setManualClientExists(true);
      } else {
        setManualFirstName('');
        setManualLastName('');
        setManualPhone('');
        setManualClientExists(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Status Updater Actions
  const updateStatus = async (bookingId: string, newStatus: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | 'NO_SHOW') => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', bookingId);

      if (error) throw error;

      if (selectedBooking) {
        // Find booking in local state and refresh
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
        
        // Notify client if cancelled
        if (newStatus === 'CANCELLED') {
          notifications.dispatch('CANCELLATION', {
            toEmail: selectedBooking.clients.email,
            toPhone: selectedBooking.clients.phone,
            clientName: `${selectedBooking.clients.first_name} ${selectedBooking.clients.last_name}`,
            serviceName: selectedBooking.services.name,
            date: selectedBooking.booking_date,
            time: selectedBooking.booking_time.substring(0, 5),
            depositAmount: selectedBooking.deposit_amount
          });
        }
        
        setIsDetailsOpen(false);
        setSelectedBooking(null);
      }
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el estado.');
    }
  };

  // Reschedule Booking Action
  const handleRescheduleSubmit = async () => {
    if (!selectedBooking || !rescheduleDate || !rescheduleTime) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          booking_date: rescheduleDate,
          booking_time: `${rescheduleTime}:00`,
          status: 'RESCHEDULED'
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      // Dispatch notifications
      notifications.dispatch('RESCHEDULE', {
        toEmail: selectedBooking.clients.email,
        toPhone: selectedBooking.clients.phone,
        clientName: `${selectedBooking.clients.first_name} ${selectedBooking.clients.last_name}`,
        serviceName: selectedBooking.services.name,
        date: rescheduleDate,
        time: rescheduleTime,
        depositAmount: selectedBooking.deposit_amount,
        bookingId: selectedBooking.id
      });

      // Update state
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { 
        ...b, 
        booking_date: rescheduleDate, 
        booking_time: `${rescheduleTime}:00`,
        status: 'RESCHEDULED'
      } : b));

      setIsRescheduling(false);
      setIsDetailsOpen(false);
      setSelectedBooking(null);
    } catch (err) {
      console.error(err);
      alert('Error al reprogramar el turno.');
    }
  };

  // Create Manual Booking Action
  const handleManualBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail || !manualFirstName || !manualLastName || !manualPhone || !manualDate || !manualTime || !manualServiceId) {
      setManualError('Complete todos los campos obligatorios.');
      return;
    }
    setManualError('');

    try {
      let finalClientId = '';
      
      // Get or create client
      if (manualClientExists) {
        const { data } = await supabase.from('clients').select('id').eq('email', manualEmail);
        if (data && data.length > 0) finalClientId = data[0].id;
      } else {
        const { data, error } = await supabase.from('clients').insert({
          email: manualEmail,
          first_name: manualFirstName,
          last_name: manualLastName,
          phone: manualPhone
        }).select();
        
        if (error) throw error;
        if (data && data.length > 0) finalClientId = data[0].id;
      }

      const selectedServiceObj = services.find(s => s.id === manualServiceId);
      if (!selectedServiceObj) return;

      const { data: newBooking, error: bkErr } = await supabase.from('bookings').insert({
        client_id: finalClientId,
        service_id: manualServiceId,
        booking_date: manualDate,
        booking_time: `${manualTime}:00`,
        duration: selectedServiceObj.estimated_duration_minutes,
        deposit_amount: 0, // Manual bookings do not process deposit
        status: 'CONFIRMED',
        notes: manualNotes
      }).select('*, clients(*), services(*)');

      if (bkErr) throw bkErr;

      if (newBooking && newBooking.length > 0) {
        // Dispatch notifications
        notifications.dispatch('CONFIRMATION', {
          toEmail: manualEmail,
          toPhone: manualPhone,
          clientName: `${manualFirstName} ${manualLastName}`,
          serviceName: selectedServiceObj.name,
          date: manualDate,
          time: manualTime,
          depositAmount: 0,
          bookingId: newBooking[0].id
        });

        // Add to calendar state directly if matches current filters
        setBookings(prev => [...prev, newBooking[0] as Booking].sort((a, b) => {
          if (a.booking_date !== b.booking_date) {
            return a.booking_date.localeCompare(b.booking_date);
          }
          return a.booking_time.localeCompare(b.booking_time);
        }));

        // Reset and close
        setIsManualBookingOpen(false);
        setManualEmail('');
        setManualFirstName('');
        setManualLastName('');
        setManualPhone('');
        setManualDate('');
        setManualTime('');
        setManualNotes('');
      }
    } catch (err) {
      console.error(err);
      setManualError('Error al crear el turno manual.');
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Calendar header controls */}
      <div className="border-b border-neutral-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-offblack m-0">Calendario Administrativo</h2>
          <p className="text-gray-400 text-sm font-semibold mt-1">Visualizar, gestionar y agendar turnos manualmente</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Day/Week/Month Switcher */}
          <div className="flex border border-neutral-200 p-1 bg-neutral-50 rounded-xl">
            {(['day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`py-1.5 px-3.5 text-xs font-bold uppercase rounded-lg cursor-pointer transition-all ${
                  view === v ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-offblack hover:bg-neutral-200/50'
                }`}
              >
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          <Button 
            variant="primary" 
            onClick={() => setIsManualBookingOpen(true)}
            className="flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl"
          >
            <Plus className="h-4 w-4" /> Crear Turno
          </Button>
        </div>
      </div>

      {/* Date selector navigation */}
      <div className="flex items-center gap-3 bg-white p-4 border border-neutral-100 rounded-2xl shadow-sm">
        <CalendarIcon className="h-5 w-5 text-primary flex-shrink-0" />
        <span className="text-sm font-bold text-gray-400">Fecha de enfoque:</span>
        <input
          type="date"
          value={currentDate}
          onChange={(e) => setCurrentDate(e.target.value)}
          className="font-bold border border-neutral-200 px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:border-primary"
        />
        <Button 
          variant="secondary" 
          onClick={() => setCurrentDate(new Date().toISOString().split('T')[0])}
          className="py-1.5 px-3 text-xs rounded-lg"
        >
          Hoy
        </Button>
      </div>

      {/* Bookings Grid / Timeline */}
      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400 animate-pulse">Cargando turnos de la agenda...</div>
      ) : (
        <>
          {view === 'day' && renderDayView()}
          {view === 'week' && renderWeekView()}
          {view === 'month' && renderMonthView()}
        </>
      )}

      {/* DETAIL MODAL WITH ACTIONS */}
      <Modal
        isOpen={isDetailsOpen && selectedBooking !== null}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedBooking(null);
        }}
        title="Gestión de Turno"
      >
        {selectedBooking && (
          <div className="space-y-6">
            {/* Booking Overview info */}
            <div className="bg-neutral-50 border border-neutral-100 p-4 rounded-xl space-y-2">
              <h3 className="text-base font-extrabold border-b border-neutral-200 pb-2 text-offblack">{selectedBooking.services?.name}</h3>
              <p className="text-sm flex items-center gap-2 text-gray-600 font-semibold"><CalendarRange className="h-4 w-4 text-primary" /> <strong>Fecha:</strong> {selectedBooking.booking_date}</p>
              <p className="text-sm flex items-center gap-2 text-gray-600 font-semibold"><Clock className="h-4 w-4 text-primary" /> <strong>Hora:</strong> {selectedBooking.booking_time.substring(0, 5)} hs ({selectedBooking.duration} min)</p>
              <p className="text-sm text-gray-600 font-semibold flex items-center gap-2">
                <strong>Estado Actual:</strong> 
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(selectedBooking.status)}`}>
                  {translateStatus(selectedBooking.status)}
                </span>
              </p>
            </div>

            {/* Client Info */}
            <div className="space-y-2.5">
              <h4 className="font-extrabold text-xs text-gray-400 border-b border-neutral-100 pb-1.5 uppercase">Datos del Cliente</h4>
              <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><User className="h-4 w-4 text-gray-400" /> {selectedBooking.clients?.first_name} {selectedBooking.clients?.last_name}</p>
              <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><Phone className="h-4 w-4 text-gray-400" /> {selectedBooking.clients?.phone}</p>
              <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><Mail className="h-4 w-4 text-gray-400" /> {selectedBooking.clients?.email}</p>
            </div>

            {/* Price Details */}
            <div className="space-y-1.5 border-t border-neutral-100 pt-4 text-gray-600 font-semibold text-sm text-left">
              <div className="flex justify-between">
                <span>Precio Total:</span>
                <span>${(selectedBooking.services as any)?.price?.toFixed(2) || '0.00'}</span>
              </div>
              {selectedBooking.deposit_amount > 0 ? (
                <>
                  <div className="flex justify-between text-success">
                    <span>Seña Abonada (MP):</span>
                    <span>-${selectedBooking.deposit_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-offblack font-bold border-t border-dashed border-neutral-200 pt-1.5 mt-1">
                    <span>Resta pagar en local:</span>
                    <span>${(((selectedBooking.services as any)?.price || 0) - selectedBooking.deposit_amount).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-success font-bold border-t border-dashed border-neutral-200 pt-1.5 mt-1">
                  <span>Resta pagar en local:</span>
                  <span>${((selectedBooking.services as any)?.price || 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Change Status Action Row */}
            {!isRescheduling && (
              <div className="space-y-3 pt-4 border-t border-neutral-100">
                <h4 className="font-extrabold text-xs text-gray-400 uppercase">Acciones Rápidas</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="secondary" 
                    onClick={() => updateStatus(selectedBooking.id, 'COMPLETED')}
                    className="text-xs flex justify-center gap-1.5 py-2.5 rounded-lg"
                    disabled={selectedBooking.status === 'CANCELLED' || selectedBooking.status === 'COMPLETED'}
                  >
                    <CheckCircle className="h-4 w-4 text-success" /> Completado
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => updateStatus(selectedBooking.id, 'NO_SHOW')}
                    className="text-xs flex justify-center gap-1.5 py-2.5 rounded-lg"
                    disabled={selectedBooking.status === 'CANCELLED' || selectedBooking.status === 'COMPLETED'}
                  >
                    <XCircle className="h-4 w-4 text-warning" /> No Asistió
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => setIsRescheduling(true)}
                    className="text-xs flex justify-center gap-1.5 py-2.5 rounded-lg"
                    disabled={selectedBooking.status === 'CANCELLED' || selectedBooking.status === 'COMPLETED'}
                  >
                    <RefreshCw className="h-4 w-4 text-secondary" /> Reprogramar
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => updateStatus(selectedBooking.id, 'CANCELLED')}
                    className="text-xs border-danger/20 text-danger hover:bg-danger/5 hover:border-danger flex justify-center gap-1.5 py-2.5 rounded-lg"
                    disabled={selectedBooking.status === 'CANCELLED'}
                  >
                    <XCircle className="h-4 w-4 text-danger" /> Cancelar Turno
                  </Button>
                </div>
              </div>
            )}

            {/* RESCHEDULING CONTAINER */}
            {isRescheduling && (
              <div className="bg-secondary/5 border border-secondary/15 p-4 rounded-xl space-y-4 text-left">
                <h4 className="font-extrabold text-sm text-secondary m-0">Reprogramar Turno</h4>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-offblack">Nueva Fecha:</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="font-bold text-sm border border-neutral-200 p-2 rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-offblack">Nuevo Horario:</label>
                  {!rescheduleDate ? (
                    <span className="text-xs text-gray-400 font-semibold italic">Seleccione fecha primero.</span>
                  ) : loadingReschedSlots ? (
                    <span className="text-xs font-bold text-gray-400">Buscando horarios libres...</span>
                  ) : rescheduleSlots.length === 0 ? (
                    <span className="text-xs text-danger font-bold">No hay horarios libres para esta fecha.</span>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {rescheduleSlots.map((slot, idx) => (
                        <button
                          key={idx}
                          disabled={!slot.available}
                          onClick={() => setRescheduleTime(slot.time)}
                          className={`py-1.5 text-center font-bold border rounded-lg text-xs cursor-pointer ${
                            !slot.available
                              ? 'bg-neutral-50 text-gray-300 border-neutral-100 cursor-not-allowed'
                              : rescheduleTime === slot.time
                                ? 'bg-primary text-white border-transparent shadow-sm'
                                : 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50'
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" onClick={() => setIsRescheduling(false)} className="py-1.5 px-3 text-xs rounded-lg">
                    Volver
                  </Button>
                  <Button 
                    variant="primary" 
                    disabled={!rescheduleDate || !rescheduleTime} 
                    onClick={handleRescheduleSubmit}
                    className="py-1.5 px-3 text-xs rounded-lg"
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MANUAL BOOKING CREATOR MODAL */}
      <Modal
        isOpen={isManualBookingOpen}
        onClose={() => setIsManualBookingOpen(false)}
        title="Crear Turno Manualmente"
      >
        <form onSubmit={handleManualBookingSubmit} className="space-y-4">
          {manualError && (
            <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger">
              {manualError}
            </div>
          )}

          <div className="flex flex-col gap-1.5 w-full text-left">
            <label className="text-sm font-bold text-offblack">Seleccionar Servicio</label>
            <select
              value={manualServiceId}
              onChange={(e) => setManualServiceId(e.target.value)}
              className="border border-neutral-200 p-2.5 rounded-lg w-full bg-white text-sm font-semibold focus:outline-none focus:border-primary"
            >
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.estimated_duration_minutes} min)</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <Input
              label="Correo Electrónico Cliente"
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="cliente@correo.com"
              className="flex-1"
              required
            />
            <Button type="button" variant="secondary" onClick={handleManualEmailSearch} className="mb-1 py-2.5 rounded-lg">
              Buscar
            </Button>
          </div>

          {manualClientExists && (
            <div className="bg-success/10 border border-success/20 p-2 rounded-lg text-xs font-bold text-success">
              Cliente encontrado. Datos autocompletados.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Nombre"
              type="text"
              value={manualFirstName}
              onChange={(e) => setManualFirstName(e.target.value)}
              placeholder="Nombre"
              required
            />
            <Input
              label="Apellido"
              type="text"
              value={manualLastName}
              onChange={(e) => setManualLastName(e.target.value)}
              placeholder="Apellido"
              required
            />
          </div>

          <Input
            label="Celular (WhatsApp)"
            type="tel"
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            placeholder="2645012345"
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 pt-3">
            <div className="flex flex-col gap-1.5 w-full text-left">
              <label className="text-sm font-bold text-offblack">Seleccionar Fecha</label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="border border-neutral-200 p-2.5 rounded-lg text-sm bg-white font-semibold focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full text-left">
              <label className="text-sm font-bold text-offblack">Horario Libre</label>
              {!manualDate ? (
                <span className="text-xs text-gray-400 font-semibold italic mt-3">Seleccione fecha primero</span>
              ) : loadingManualSlots ? (
                <span className="text-xs font-bold text-gray-400 mt-3 animate-pulse">Cargando...</span>
              ) : manualSlots.length === 0 ? (
                <span className="text-xs text-danger font-bold mt-3">Sin slots libres en este día</span>
              ) : (
                <select
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="border border-neutral-200 p-2.5 rounded-lg w-full bg-white text-sm font-semibold focus:outline-none focus:border-primary"
                  required
                >
                  <option value="">Seleccione hora...</option>
                  {manualSlots.map((s, idx) => (
                    <option key={idx} value={s.time} disabled={!s.available}>
                      {s.time} {!s.available ? '(Reservado)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full text-left">
            <label className="text-sm font-bold text-offblack">Notas Internas (Opcional)</label>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Ej. Llega en auto, requiere corte corto, etc."
              className="border border-neutral-200 p-2.5 rounded-lg w-full h-20 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={() => setIsManualBookingOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Crear Turno
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
