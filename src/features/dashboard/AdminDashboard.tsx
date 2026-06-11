import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { formatCurrency, formatDate } from '../../utils/format';
import {
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ShieldCheck,
  HelpCircle,
  AlertCircle,
  Award,
  CheckCircle
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

export const translateStatus = (status: string) => {
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

export const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'CONFIRMED': return 'bg-success/10 text-success';
    case 'COMPLETED': return 'bg-secondary/10 text-secondary';
    case 'PENDING_PAYMENT': return 'bg-amber-100 text-amber-700';
    case 'CANCELLED': return 'bg-danger/10 text-danger';
    case 'RESCHEDULED': return 'bg-primary/10 text-primary';
    case 'NO_SHOW': return 'bg-neutral-100 text-gray-500';
    default: return 'bg-neutral-100 text-gray-500';
  }
};

interface BookingWithClientAndService {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  deposit_amount: number;
  local_amount_paid?: number;
  notes?: string | null;
  quantity?: number;
  clients: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  services: {
    name: string;
    price?: number;
  };
  clientReputation?: {
    total: number;
    noShows: number;
    rate: number;
    isConflictive: boolean;
  };
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    todayCount: 0,
    weekCount: 0,
    monthCount: 0,
    totalClients: 0,
    totalRevenue: 0,
    totalEstimatedRevenue: 0,
    showRate: 100
  });

  const [upcomingBookings, setUpcomingBookings] = useState<BookingWithClientAndService[]>([]);
  const [pastUnresolvedBookings, setPastUnresolvedBookings] = useState<BookingWithClientAndService[]>([]);
  const [popularServices, setPopularServices] = useState<{ name: string; count: number }[]>([]);
  const [topClients, setTopClients] = useState<{ name: string; phone: string; count: number }[]>([]);
  const [peakHours, setPeakHours] = useState<{ hour: string; count: number }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Collected amount modal states (for price 0 bookings completed)
  const [isCollectedAmountModalOpen, setIsCollectedAmountModalOpen] = useState<boolean>(false);
  const [enteredCollectedAmount, setEnteredCollectedAmount] = useState<string>('');
  const [pendingBookingIdToComplete, setPendingBookingIdToComplete] = useState<string | null>(null);

  // Help modal state
  const [helpModal, setHelpModal] = useState<{ isOpen: boolean; title: string; content: string }>({
    isOpen: false,
    title: '',
    content: ''
  });

  const openHelpModal = (title: string, content: string) => {
    setHelpModal({
      isOpen: true,
      title,
      content
    });
  };

  // Robust timezone-aware helper to get current local date and time strings
  const getLocalData = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset).toISOString();
    const dateStr = localISOTime.split('T')[0];
    const timeStr = localISOTime.split('T')[1].substring(0, 8);
    return { dateStr, timeStr };
  };

  async function loadDashboardData() {
    try {
      // Load bookings with clients and services
      const { data: bookings } = await supabase.from('bookings').select('*, clients(*), services(*)');
      // Load clients
      const { data: clients } = await supabase.from('clients').select('id');

      if (bookings && clients) {
        const { dateStr: localDateStr, timeStr: localTimeStr } = getLocalData();

        // Calculate stats
        let today = 0;
        let week = 0;
        let month = 0;
        let revenueSeñas = 0;
        let revenueTotal = 0;
        const serviceCounts: Record<string, number> = {};
        const clientCompletedCounts: Record<string, { name: string; phone: string; count: number }> = {};
        const hourCounts: Record<string, number> = {};

        const todayDate = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(todayDate.getDate() - 7);
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(todayDate.getDate() - 30);

        let completedCount = 0;
        let noShowCount = 0;

        bookings.forEach((b: any) => {
          const bDate = new Date(b.booking_date + 'T00:00:00');

          if (b.booking_date === localDateStr) {
            today++;
          }
          if (bDate >= oneWeekAgo && bDate <= todayDate) {
            week++;
          }
          if (bDate >= oneMonthAgo && bDate <= todayDate) {
            month++;
          }

          // Count completed vs no-show for Show Rate
          if (b.status === 'COMPLETED') {
            completedCount++;
          } else if (b.status === 'NO_SHOW') {
            noShowCount++;
          }

          // Revenue 1: Ingresos por Señas
          // Exclude cancelled and pending payment
          if (b.status === 'CONFIRMED' || b.status === 'RESCHEDULED' || b.status === 'COMPLETED' || b.status === 'NO_SHOW') {
            revenueSeñas += Number(b.deposit_amount || 0);
          }

          // Revenue 2: Ingresos Totales
          if (b.status === 'COMPLETED') {
            const price = Number(b.services?.price || 0);
            const deposit = Number(b.deposit_amount || 0);
            const localPaid = Number(b.local_amount_paid || 0);
            if (localPaid > 0) {
              revenueTotal += deposit + localPaid;
            } else {
              // Fallback for legacy completed bookings or bookings with 0 local cash collected
              if (price > 0) {
                revenueTotal += price * (b.quantity || 1);
              } else {
                revenueTotal += deposit;
              }
            }
          } else if (b.status === 'CONFIRMED' || b.status === 'RESCHEDULED' || b.status === 'NO_SHOW') {
            // Only deposit is paid
            revenueTotal += Number(b.deposit_amount || 0);
          }

          // Popular services counts
          const sName = b.services?.name || 'Desconocido';
          serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;

          // Top clients (only count Completed bookings)
          if (b.status === 'COMPLETED' && b.clients) {
            const cId = b.clients.id;
            const name = `${b.clients.first_name} ${b.clients.last_name}`;
            const phone = b.clients.phone;
            if (!clientCompletedCounts[cId]) {
              clientCompletedCounts[cId] = { name, phone, count: 0 };
            }
            clientCompletedCounts[cId].count++;
          }

          // Hour counts (count confirmed, completed, rescheduled)
          if (b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'RESCHEDULED') {
            const hour = b.booking_time.substring(0, 5);
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          }
        });

        // 1. Sort popular services
        const sortedServices = Object.keys(serviceCounts).map(name => ({
          name,
          count: serviceCounts[name]
        })).sort((a, b) => b.count - a.count).slice(0, 3);

        // 2. Sort top clients
        const sortedClients = Object.values(clientCompletedCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        // 3. Sort peak hours
        const sortedHours = Object.entries(hourCounts)
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        // 4. Calculate Show Rate
        const totalResolved = completedCount + noShowCount;
        const finalShowRate = totalResolved > 0 ? (completedCount / totalResolved) * 100 : 100;

        setStats({
          todayCount: today,
          weekCount: week,
          monthCount: month,
          totalClients: clients.length,
          totalRevenue: revenueSeñas,
          totalEstimatedRevenue: revenueTotal,
          showRate: finalShowRate
        });

        setPopularServices(sortedServices);
        setTopClients(sortedClients);
        setPeakHours(sortedHours);

        // Helper to calculate reputation for a client id
        const getReputation = (clientId: string) => {
          const clientBookings = bookings.filter((allB: any) => allB.client_id === clientId);
          const total = clientBookings.length;
          const noShows = clientBookings.filter((allB: any) => allB.status === 'NO_SHOW').length;
          const rate = total > 0 ? (noShows / total) : 0;
          return {
            total,
            noShows,
            rate,
            isConflictive: total >= 2 && rate >= 0.3
          };
        };

        // Filter upcoming bookings (today and onwards, sorted, not cancelled)
        const sortedUpcoming = (bookings as any[])
          .filter((b: any) => b.booking_date >= localDateStr && b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && b.status !== 'NO_SHOW')
          .map((b: any) => ({
            ...b,
            clientReputation: getReputation(b.client_id)
          }))
          .sort((a: any, b: any) => {
            if (a.booking_date !== b.booking_date) {
              return a.booking_date.localeCompare(b.booking_date);
            }
            return a.booking_time.localeCompare(b.booking_time);
          })
          .slice(0, 5);

        setUpcomingBookings(sortedUpcoming);

        // Filter past unresolved bookings (date/time in past, status CONFIRMED or RESCHEDULED)
        const filteredPastUnresolved = (bookings as any[])
          .filter((b: any) => {
            const isPast = b.booking_date < localDateStr || (b.booking_date === localDateStr && b.booking_time < localTimeStr);
            const isUnresolved = b.status === 'CONFIRMED' || b.status === 'RESCHEDULED';
            return isPast && isUnresolved;
          })
          .map((b: any) => ({
            ...b,
            clientReputation: getReputation(b.client_id)
          }))
          .sort((a: any, b: any) => {
            if (a.booking_date !== b.booking_date) {
              return a.booking_date.localeCompare(b.booking_date);
            }
            return a.booking_time.localeCompare(b.booking_time);
          });

        setPastUnresolvedBookings(filteredPastUnresolved);
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleUpdateStatus = async (
    bookingId: string,
    newStatus: 'COMPLETED' | 'NO_SHOW',
    customAmountPaid?: number
  ) => {
    const booking = upcomingBookings.find(b => b.id === bookingId) || pastUnresolvedBookings.find(b => b.id === bookingId);
    const targetBooking = booking || { services: { price: 0 }, deposit_amount: 0, quantity: 1 };
    const servicePrice = Number(targetBooking.services?.price ?? 0);

    if (newStatus === 'COMPLETED' && servicePrice === 0 && customAmountPaid === undefined) {
      setPendingBookingIdToComplete(bookingId);
      setEnteredCollectedAmount('');
      setIsCollectedAmountModalOpen(true);
      return;
    }

    setUpdatingId(bookingId);
    try {
      let localAmountPaid = 0;
      if (newStatus === 'COMPLETED') {
        if (servicePrice === 0) {
          localAmountPaid = customAmountPaid || 0;
        } else {
          localAmountPaid = Math.max(0, (servicePrice * (targetBooking.quantity || 1)) - Number(targetBooking.deposit_amount || 0));
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

      // Refresh local data
      await loadDashboardData();
    } catch (err) {
      console.error('Error updating booking status:', err);
      alert('Ocurrió un error al intentar actualizar el estado del turno.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-10 font-bold text-lg">Cargando estadísticas...</div>;
  }

  return (
    <div className="space-y-8 text-left">
      {/* Dashboard Heading */}
      <div className="border-b border-neutral-100 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-offblack m-0">Panel de Control</h2>
          <p className="text-gray-400 text-sm font-semibold mt-1">Resumen analítico y estadísticas de turnos</p>
        </div>
        <div className="bg-success/10 text-success border border-success/15 px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 rounded-full">
          <ShieldCheck className="h-4 w-4" /> Administrador Conectado
        </div>
      </div>

      {/* Grid containing Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Metric 1 */}
        <Card className="border border-neutral-100 shadow-sm relative group">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="bg-primary/10 text-primary p-2.5 rounded-xl flex-shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Turnos Hoy</span>
              <h3 className="text-xl font-extrabold text-offblack leading-none mt-1">{stats.todayCount}</h3>
              <span className="text-[9px] font-semibold text-gray-400 block mt-1 truncate">
                Sem: {stats.weekCount} | Mes: {stats.monthCount}
              </span>
            </div>
            <button
              onClick={() => openHelpModal('Turnos de Hoy', 'Muestra la cantidad de citas agendadas para el día de hoy, junto con un resumen de los turnos programados para la semana y el mes actual. Te ayuda a planificar el flujo de trabajo diario.')}
              className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>

        {/* Metric 2 */}
        <Card className="border border-neutral-100 shadow-sm relative group">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="bg-secondary/10 text-secondary p-2.5 rounded-xl flex-shrink-0">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Clientes</span>
              <h3 className="text-xl font-extrabold text-offblack leading-none mt-1">{stats.totalClients}</h3>
              <span className="text-[9px] font-semibold text-gray-400 block mt-1">Registrados</span>
            </div>
            <button
              onClick={() => openHelpModal('Clientes Registrados', 'Indica el número total de clientes únicos guardados en la base de datos (identificados por su correo electrónico único). Te da una idea del tamaño de tu cartera de clientes.')}
              className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>

        {/* Metric 3 */}
        <Card className="border border-neutral-100 shadow-sm relative group">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="bg-success/10 text-success p-2.5 rounded-xl flex-shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Ingresos Señas</span>
              <h3 className="text-xl font-extrabold text-success leading-none mt-1">${formatCurrency(stats.totalRevenue)}</h3>
              <span className="text-[9px] font-semibold text-success/80 block mt-1">Cobro digital MP</span>
            </div>
            <button
              onClick={() => openHelpModal('Ingresos por Señas', 'Suma el monto total recaudado por concepto de señas pagadas en línea a través de Mercado Pago para todos los turnos confirmados, reprogramados, completados o ausentes. Representa el dinero ingresado digitalmente.')}
              className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>

        {/* Metric 4 */}
        <Card className="border border-neutral-100 bg-emerald-50/10 shadow-sm relative group">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="bg-amber-100/70 text-amber-700 p-2.5 rounded-xl flex-shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-amber-800/80 uppercase tracking-wider block">Ingresos Totales</span>
              <h3 className="text-xl font-extrabold text-amber-700 leading-none mt-1">${formatCurrency(stats.totalEstimatedRevenue)}</h3>
              <span className="text-[9px] font-semibold text-amber-700/80 block mt-1">Estimado facturado</span>
            </div>
            <button
              onClick={() => openHelpModal('Ingresos Totales (Estimado)', 'Calcula el ingreso total estimado de tu petshop. Suma el precio completo del servicio para turnos completados (se asume que pagaron el saldo restante en el local) más las señas de los turnos confirmados, reprogramados o inasistencias. Excluye cancelaciones.')}
              className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>

        {/* Metric 5 */}
        <Card className="border border-neutral-100 shadow-sm relative group">
          <CardContent className="flex items-center gap-3 py-5">
            <div className="bg-sky-100 text-sky-700 p-2.5 rounded-xl flex-shrink-0">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Asistencia</span>
              <h3 className="text-xl font-extrabold text-sky-700 leading-none mt-1">{stats.showRate.toFixed(1)}%</h3>
              <span className="text-[9px] font-semibold text-gray-400 block mt-1">Ratio de presencia</span>
            </div>
            <button
              onClick={() => openHelpModal('Tasa de Asistencia (Show Rate)', 'Mide el porcentaje de turnos atendidos exitosamente. Se calcula como: (Turnos Completados / [Turnos Completados + Ausentes]) * 100. Una tasa más alta significa mayor asistencia y menos pérdidas de tiempo por inasistencias.')}
              className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Turnos Pasados por Confirmar */}
      {pastUnresolvedBookings.length > 0 && (
        <div className="bg-amber-50/20 border border-amber-200/50 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-amber-200/30 pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 animate-pulse" />
              <h3 className="text-lg font-bold text-amber-900 m-0">Turnos Pasados Pendientes de Cerrar</h3>
            </div>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {pastUnresolvedBookings.length} {pastUnresolvedBookings.length === 1 ? 'turno pendiente' : 'turnos pendientes'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pastUnresolvedBookings.map((b) => (
              <div
                key={b.id}
                className="bg-white border border-amber-150 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-xs transition-all hover:shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="bg-amber-50 border border-amber-100 text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-700">
                      {formatDate(b.booking_date)} | {b.booking_time.substring(0, 5)} hs
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">
                      Seña: ${formatCurrency(b.deposit_amount)}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-offblack">{b.services?.name}</h4>
                  <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                    Cliente: <strong>{b.clients?.first_name} {b.clients?.last_name}</strong> ({b.clients?.phone})
                    {b.clientReputation?.isConflictive && (
                      <span className="bg-danger/10 text-danger text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center">
                        ⚠️ Alerta: {Math.round(b.clientReputation.rate * 100)}% ausencias
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus(b.id, 'COMPLETED')}
                    disabled={updatingId !== null}
                    className="flex-1 py-2 px-3 bg-success text-white text-xs font-bold rounded-lg cursor-pointer transition-all hover:opacity-90 flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Marcar Completado
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(b.id, 'NO_SHOW')}
                    disabled={updatingId !== null}
                    className="flex-1 py-2 px-3 bg-neutral-100 hover:bg-neutral-200 text-offblack border border-neutral-200 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Marcar Ausente
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout Section: Asymmetric grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Upcoming Bookings (col-span 2) */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Próximos Turnos Agendados
          </h3>

          {upcomingBookings.length === 0 ? (
            <div className="p-8 bg-white border border-dashed border-neutral-200 text-center text-gray-400 font-bold rounded-2xl">
              No hay turnos pendientes para hoy ni fechas futuras.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-neutral-100 p-4 rounded-xl flex items-center justify-between gap-4 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-neutral-50 border border-neutral-100 text-[10px] font-bold px-2 py-0.5 rounded-full text-gray-500">
                        {formatDate(b.booking_date)} | {b.booking_time.substring(0, 5)} hs
                      </span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(b.status)}`}>
                        {translateStatus(b.status)}
                      </span>
                    </div>
                    <h4 className="font-bold text-base text-offblack">{b.services?.name}</h4>
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                      Cliente: <strong>{b.clients?.first_name} {b.clients?.last_name}</strong> ({b.clients?.phone})
                      {b.clientReputation?.isConflictive && (
                        <span className="bg-danger/10 text-danger text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center">
                          ⚠️ Alerta: {Math.round(b.clientReputation.rate * 100)}% ausencias
                        </span>
                      )}
                    </p>
                  </div>
                  {b.deposit_amount > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-gray-400 block uppercase">Seña MP</span>
                      <span className="text-sm font-extrabold text-success">${formatCurrency(b.deposit_amount)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Popular Services & Stats (col-span 1) */}
        <div className="space-y-6">
          {/* Popular services */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-secondary" /> Servicios más Solicitados
            </h3>
            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-4 space-y-4">
                {popularServices.length === 0 ? (
                  <p className="text-sm text-gray-400 font-semibold py-2">Sin datos de servicios registrados.</p>
                ) : (
                  popularServices.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-neutral-50 pb-3 last:border-none last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="bg-neutral-100 text-offblack w-6 h-6 text-xs font-bold flex items-center justify-center rounded-full">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-offblack">{item.name}</span>
                      </div>
                      <span className="bg-secondary/10 text-secondary text-[10px] font-bold px-2.5 py-1 rounded-full">
                        {item.count} turnos
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Clientes Frecuentes */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" /> Clientes Frecuentes
              </h3>
              <button
                onClick={() => openHelpModal('Clientes Frecuentes', 'Lista a los 3 clientes que tienen más visitas finalizadas (turnos en estado "Completado") en la petshop. Te permite identificar a tus clientes más fieles para ofrecerles descuentos o atenciones.')}
                className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-4 space-y-4">
                {topClients.length === 0 ? (
                  <p className="text-sm text-gray-400 font-semibold py-2">Sin datos de visitas finalizadas.</p>
                ) : (
                  topClients.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-neutral-50 pb-3 last:border-none last:pb-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="bg-amber-50 text-amber-700 w-6 h-6 text-xs font-bold flex items-center justify-center rounded-full flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-offblack block truncate">{item.name}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">{item.phone}</span>
                        </div>
                      </div>
                      <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                        {item.count} {item.count === 1 ? 'visita' : 'visitas'}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Horas Pico de Demanda */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-500" /> Horas Pico de Demanda
              </h3>
              <button
                onClick={() => openHelpModal('Horas Pico de Demanda', 'Muestra las 3 franjas horarias más agendadas históricamente. Útil para conocer en qué momentos del día se registra mayor concurrencia y planificar los recursos de la petshop.')}
                className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-4 space-y-4">
                {peakHours.length === 0 ? (
                  <p className="text-sm text-gray-400 font-semibold py-2">Sin datos de horarios.</p>
                ) : (
                  peakHours.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-neutral-50 pb-3 last:border-none last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="bg-sky-50 text-sky-700 w-6 h-6 text-xs font-bold flex items-center justify-center rounded-full">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-offblack">{item.hour} hs</span>
                      </div>
                      <span className="bg-sky-50 text-sky-700 text-[10px] font-bold px-2.5 py-1 rounded-full">
                        {item.count} {item.count === 1 ? 'turno' : 'turnos'}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* MODAL PARA SOLICITAR MONTO COBRADO (SERVICIOS SIN PRECIO DEFINIDO) */}
      <Modal
        isOpen={isCollectedAmountModalOpen}
        onClose={() => {
          setIsCollectedAmountModalOpen(false);
          setPendingBookingIdToComplete(null);
        }}
        title="Registrar Cobro de Turno"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pendingBookingIdToComplete) {
              const amount = parseInt(enteredCollectedAmount, 10) || 0;
              handleUpdateStatus(pendingBookingIdToComplete, 'COMPLETED', amount);
              setIsCollectedAmountModalOpen(false);
              setPendingBookingIdToComplete(null);
            }
          }}
          className="space-y-4 text-left"
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-600 leading-relaxed">
              El precio de este servicio está sin definir. Por favor, ingrese el monto cobrado en el local (sin incluir la seña).
            </p>
            {pendingBookingIdToComplete && (() => {
              const pendingBooking = upcomingBookings.find(b => b.id === pendingBookingIdToComplete) ||
                pastUnresolvedBookings.find(b => b.id === pendingBookingIdToComplete);
              if (pendingBooking && pendingBooking.deposit_amount > 0) {
                return (
                  <div className="bg-amber-50 text-amber-800 border border-amber-100 p-3 rounded-xl text-xs font-semibold">
                    ⚠️ <strong>Seña ya abonada:</strong> Se han pagado ${formatCurrency(pendingBooking.deposit_amount)} de seña. Ingrese únicamente la **diferencia** cobrada presencialmente (sin contemplar la seña).
                  </div>
                );
              }
              return null;
            })()}
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
              onClick={() => {
                setIsCollectedAmountModalOpen(false);
                setPendingBookingIdToComplete(null);
              }}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" className="cursor-pointer">
              Confirmar y Completar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Explication Modal */}
      <Modal
        isOpen={helpModal.isOpen}
        onClose={() => setHelpModal(prev => ({ ...prev, isOpen: false }))}
        title={helpModal.title}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-650 leading-relaxed font-medium">
            {helpModal.content}
          </p>
        </div>
      </Modal>
    </div>
  );
};
