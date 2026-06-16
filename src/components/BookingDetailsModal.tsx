import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { getAvailableSlots, type BookingSlot } from '../utils/availability';
import { formatCurrency, formatDate } from '../utils/format';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { notifications } from '../lib/notifications';
import { CalendarRange, Clock, Scissors, User, Phone, Mail, CheckCircle, XCircle, RefreshCw, Save } from 'lucide-react';

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
  local_amount_paid?: number;
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
    price?: number;
  };
  quantity?: number;
}

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onStatusChange?: (updatedBooking: Booking) => void;
}

export const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({ isOpen, onClose, booking, onStatusChange }) => {
  const [clientStats, setClientStats] = useState<{ total: number; noShows: number; rate: number } | null>(null);
  const [loadingClientStats, setLoadingClientStats] = useState<boolean>(false);

  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleSlots, setRescheduleSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState<string>('');
  const [loadingReschedSlots, setLoadingReschedSlots] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [notes, setNotes] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);
  
  // Custom amount modal states inside component
  const [isCollectedAmountModalOpen, setIsCollectedAmountModalOpen] = useState<boolean>(false);
  const [enteredCollectedAmount, setEnteredCollectedAmount] = useState<string>('');

  useEffect(() => {
    if (isOpen && booking) {
      setNotes(booking.notes || '');
      setIsRescheduling(false);
      setErrorMsg('');
      setClientStats(null);
      
      setLoadingClientStats(true);
      supabase
        .from('bookings')
        .select('status')
        .eq('client_id', booking.client_id)
        .then(({ data, error }) => {
          if (data && !error) {
            const total = data.length;
            const noShows = data.filter((b: any) => b.status === 'NO_SHOW').length;
            const rate = total > 0 ? (noShows / total) : 0;
            setClientStats({ total, noShows, rate });
          }
          setLoadingClientStats(false);
        });
    }
  }, [isOpen, booking]);

  useEffect(() => {
    if (booking && rescheduleDate) {
      setLoadingReschedSlots(true);
      getAvailableSlots({
        serviceId: booking.service_id,
        dateStr: rescheduleDate,
        quantity: booking.quantity || 1,
        excludeBookingId: booking.id
      })
        .then((slots: BookingSlot[]) => {
          setRescheduleSlots(slots);
          setLoadingReschedSlots(false);
        });
    }
  }, [booking, rescheduleDate]);

  const updateStatus = async (
    bookingId: string,
    newStatus: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | 'NO_SHOW',
    customAmountPaid?: number
  ) => {
    if (!booking) return;

    const servicePrice = Number(booking.services?.price ?? 0);
    if (newStatus === 'COMPLETED' && servicePrice === 0 && customAmountPaid === undefined) {
      // Trigger local modal
      setEnteredCollectedAmount('');
      setIsCollectedAmountModalOpen(true);
      return;
    }

    try {
      let localAmountPaid = 0;
      if (newStatus === 'COMPLETED') {
        if (servicePrice === 0) {
          localAmountPaid = customAmountPaid || 0;
        } else {
          localAmountPaid = Math.max(0, (servicePrice * (booking.quantity || 1)) - Number(booking.deposit_amount || 0));
        }
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          status: newStatus,
          local_amount_paid: localAmountPaid
        })
        .eq('id', bookingId);

      if (error) throw error;

      const updated = { ...booking, status: newStatus, local_amount_paid: localAmountPaid };
      if (onStatusChange) onStatusChange(updated);

      if (newStatus === 'CANCELLED') {
        notifications.dispatch('CANCELLATION', {
          toEmail: booking.clients.email,
          toPhone: booking.clients.phone,
          clientName: `${booking.clients.first_name} ${booking.clients.last_name}`,
          serviceName: booking.services.name,
          date: booking.booking_date,
          time: booking.booking_time.substring(0, 5),
          depositAmount: booking.deposit_amount
        });
      }

      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al actualizar el estado del turno.');
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!booking || !rescheduleDate || !rescheduleTime) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          booking_date: rescheduleDate,
          booking_time: `${rescheduleTime}:00`,
          status: 'RESCHEDULED'
        })
        .eq('id', booking.id);

      if (error) throw error;

      notifications.dispatch('RESCHEDULE', {
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

      const updated = { ...booking, booking_date: rescheduleDate, booking_time: `${rescheduleTime}:00`, status: 'RESCHEDULED' as const };
      if (onStatusChange) onStatusChange(updated);

      setIsRescheduling(false);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al reprogramar el turno.');
    }
  };

  const handleSaveNotes = async () => {
    if (!booking) return;
    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ notes })
        .eq('id', booking.id);

      if (error) throw error;
      
      if (onStatusChange) onStatusChange({ ...booking, notes });
      setErrorMsg('');
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al guardar notas.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && booking !== null}
        onClose={onClose}
        title="Gestión de Turno"
        size="lg"
      >
        {booking && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div className="space-y-5 border-r border-neutral-100 pr-0 md:pr-6">
              <div className="bg-neutral-50 border border-neutral-100 p-4 rounded-xl space-y-2">
                <h3 className="text-base font-extrabold border-b border-neutral-200 pb-2 text-offblack">{booking.services?.name}</h3>
                <p className="text-sm flex items-center gap-2 text-gray-600 font-semibold"><CalendarRange className="h-4 w-4 text-primary" /> <strong>Fecha:</strong> {formatDate(booking.booking_date)}</p>
                <p className="text-sm flex items-center gap-2 text-gray-600 font-semibold"><Clock className="h-4 w-4 text-primary" /> <strong>Hora:</strong> {booking.booking_time.substring(0, 5)} hs ({booking.duration} min)</p>
                <p className="text-sm flex items-center gap-2 text-gray-600 font-semibold"><Scissors className="h-4 w-4 text-primary" /> <strong>Cantidad:</strong> {booking.quantity || 1} {(booking.quantity || 1) === 1 ? 'turno' : 'turnos'}</p>
                <p className="text-sm text-gray-600 font-semibold flex items-center gap-2">
                  <strong>Estado Actual:</strong>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(booking.status)}`}>
                    {translateStatus(booking.status)}
                  </span>
                </p>
              </div>

              <div className="space-y-2.5">
                <h4 className="font-extrabold text-xs text-gray-400 border-b border-neutral-100 pb-1.5 uppercase">Datos del Cliente</h4>
                <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><User className="h-4 w-4 text-gray-400" /> {booking.clients?.first_name} {booking.clients?.last_name}</p>
                <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><Phone className="h-4 w-4 text-gray-400" /> {booking.clients?.phone}</p>
                <p className="text-sm flex items-center gap-2.5 text-gray-600 font-semibold"><Mail className="h-4 w-4 text-gray-400" /> {booking.clients?.email}</p>
                {loadingClientStats ? (
                  <p className="text-[10px] text-gray-400 animate-pulse font-semibold">Calculando reputación...</p>
                ) : clientStats && clientStats.total >= 2 && clientStats.rate >= 0.3 ? (
                  <div className="bg-danger/10 border border-danger/20 text-danger p-2.5 rounded-xl text-xs font-bold mt-1">
                    ⚠️ Alerta Inasistencias: {Math.round(clientStats.rate * 100)}% de ausencias ({clientStats.noShows} de {clientStats.total} turnos)
                  </div>
                ) : null}
              </div>
              
              <div className="space-y-2.5">
                <h4 className="font-extrabold text-xs text-gray-400 border-b border-neutral-100 pb-1.5 uppercase">Notas Internas</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Llega en auto, requiere corte corto, etc."
                  className="border border-neutral-200 p-2.5 rounded-lg w-full h-20 text-sm focus:outline-none focus:border-primary"
                />
                <Button variant="secondary" onClick={handleSaveNotes} isLoading={isSavingNotes} className="w-full text-xs py-2 flex items-center justify-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Guardar Notas
                </Button>
              </div>

              <div className="space-y-1.5 border-t border-neutral-100 pt-4 text-gray-600 font-semibold text-sm text-left">
                <div className="flex justify-between">
                  <span>Precio Total:</span>
                  <span>{((booking.services as any)?.price || 0) === 0 ? 'Sin definir' : `$${formatCurrency(((booking.services as any)?.price || 0) * (booking.quantity || 1))}`}</span>
                </div>
                {booking.deposit_amount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Seña Abonada (MP):</span>
                    <span>-${formatCurrency(booking.deposit_amount)}</span>
                  </div>
                )}
                {((booking.services as any)?.price || 0) > 0 && (
                  <div className="flex justify-between text-offblack font-bold border-t border-dashed border-neutral-200 pt-1.5 mt-1">
                    <span>Resta pagar en local:</span>
                    <span>
                      ${formatCurrency(
                        booking.deposit_amount > 0
                          ? (((booking.services as any)?.price || 0) * (booking.quantity || 1)) - booking.deposit_amount
                          : ((booking.services as any)?.price || 0) * (booking.quantity || 1)
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5 flex flex-col justify-between">
              {errorMsg && (
                <div className="bg-danger/10 border border-danger/20 text-danger p-2.5 rounded-xl text-xs font-bold">
                  {errorMsg}
                </div>
              )}
              {!isRescheduling ? (
                <div className="space-y-4">
                  <h4 className="font-extrabold text-xs text-gray-400 border-b border-neutral-100 pb-1.5 uppercase">Acciones Rápidas</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => updateStatus(booking.id, 'COMPLETED')}
                      className="text-xs flex justify-center items-center gap-1.5 py-3 rounded-xl cursor-pointer hover:bg-neutral-50"
                      disabled={booking.status === 'CANCELLED' || booking.status === 'COMPLETED'}
                    >
                      <CheckCircle className="h-4 w-4 text-success" /> Completado
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => updateStatus(booking.id, 'NO_SHOW')}
                      className="text-xs flex justify-center items-center gap-1.5 py-3 rounded-xl cursor-pointer hover:bg-neutral-50"
                      disabled={booking.status === 'CANCELLED' || booking.status === 'COMPLETED'}
                    >
                      <XCircle className="h-4 w-4 text-warning" /> No Asistió
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setIsRescheduling(true)}
                      className="text-xs flex justify-center items-center gap-1.5 py-3 rounded-xl cursor-pointer hover:bg-neutral-50"
                      disabled={booking.status === 'CANCELLED' || booking.status === 'COMPLETED'}
                    >
                      <RefreshCw className="h-4 w-4 text-secondary" /> Reprogramar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => updateStatus(booking.id, 'CANCELLED')}
                      className="text-xs border-danger/25 text-danger hover:bg-danger/5 hover:border-danger flex justify-center items-center gap-1.5 py-3 rounded-xl cursor-pointer"
                      disabled={booking.status === 'CANCELLED'}
                    >
                      <XCircle className="h-4 w-4 text-danger" /> Cancelar Turno
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-secondary/5 border border-secondary/15 p-4 rounded-xl space-y-4 text-left flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-extrabold text-sm text-secondary border-b border-secondary/10 pb-1.5 mb-3">Reprogramar Turno</h4>

                    <div className="flex flex-col gap-1.5 mb-3">
                      <label className="text-xs font-bold text-offblack">Nueva Fecha:</label>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="font-bold text-sm border border-neutral-200 p-2.5 rounded-lg bg-white focus:outline-none focus:border-primary"
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
                        <div className="grid grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {rescheduleSlots.map((slot, idx) => (
                            <button
                              key={idx}
                              type="button"
                              disabled={!slot.available}
                              onClick={() => setRescheduleTime(slot.time)}
                              className={`py-1.5 text-center font-bold border rounded-lg text-xs cursor-pointer ${!slot.available
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
                  </div>

                  <div className="flex gap-2 justify-end pt-3 border-t border-secondary/10">
                    <Button variant="ghost" onClick={() => setIsRescheduling(false)} className="py-1.5 px-3.5 text-xs rounded-lg cursor-pointer">
                      Volver
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!rescheduleDate || !rescheduleTime}
                      onClick={handleRescheduleSubmit}
                      className="py-1.5 px-3.5 text-xs rounded-lg cursor-pointer"
                    >
                      Confirmar
                    </Button>
                  </div>
                </div>
              )}

              {!isRescheduling && (
                <div className="flex justify-end pt-4 border-t border-neutral-100">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onClose}
                    className="cursor-pointer"
                  >
                    Cerrar
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal para monto personalizado */}
      <Modal
        isOpen={isCollectedAmountModalOpen}
        onClose={() => setIsCollectedAmountModalOpen(false)}
        title="Registrar Cobro de Turno"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (booking) {
              const amount = parseInt(enteredCollectedAmount, 10) || 0;
              updateStatus(booking.id, 'COMPLETED', amount);
              setIsCollectedAmountModalOpen(false);
            }
          }}
          className="space-y-4 text-left"
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-600 leading-relaxed">
              El precio de este servicio está sin definir. Por favor, ingrese el monto cobrado en el local (sin incluir la seña).
            </p>
            {booking && booking.deposit_amount > 0 && (
              <div className="bg-amber-50 text-amber-800 border border-amber-100 p-3 rounded-xl text-xs font-semibold">
                ⚠️ <strong>Seña ya abonada:</strong> Se han pagado ${formatCurrency(booking.deposit_amount)} de seña. Ingrese únicamente la **diferencia** cobrada presencialmente.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-bold text-offblack">Monto Cobrado ($)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={enteredCollectedAmount}
              onChange={(e) => setEnteredCollectedAmount(e.target.value)}
              placeholder="Ej. 1500"
              className="border border-neutral-200 p-2.5 rounded-lg w-full bg-white text-sm font-semibold focus:outline-none focus:border-primary"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCollectedAmountModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Confirmar y Completar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
