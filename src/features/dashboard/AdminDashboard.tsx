import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { formatCurrency, formatDate } from '../../utils/format';
import { Calendar, Users, DollarSign, TrendingUp, Clock, ShieldCheck } from 'lucide-react';

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
    default: return 'bg-neutral-100 text-gray-500';
  }
};

interface BookingWithClientAndService {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  deposit_amount: number;
  clients: {
    first_name: string;
    last_name: string;
    phone: string;
  };
  services: {
    name: string;
  };
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    todayCount: 0,
    weekCount: 0,
    monthCount: 0,
    totalClients: 0,
    totalRevenue: 0
  });
  
  const [upcomingBookings, setUpcomingBookings] = useState<BookingWithClientAndService[]>([]);
  const [popularServices, setPopularServices] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        // Load bookings
        const { data: bookings } = await supabase.from('bookings').select('*, clients(*), services(*)');
        // Load clients
        const { data: clients } = await supabase.from('clients').select('id');
        
        if (bookings && clients) {
          const todayStr = new Date().toISOString().split('T')[0];
          
          // Calculate stats
          let today = 0;
          let week = 0;
          let month = 0;
          let revenue = 0;
          const serviceCounts: Record<string, number> = {};

          const todayDate = new Date();
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(todayDate.getDate() - 7);
          const oneMonthAgo = new Date();
          oneMonthAgo.setDate(todayDate.getDate() - 30);

          bookings.forEach((b: any) => {
            const bDate = new Date(b.booking_date + 'T00:00:00');
            
            if (b.booking_date === todayStr) {
              today++;
            }
            if (bDate >= oneWeekAgo && bDate <= todayDate) {
              week++;
            }
            if (bDate >= oneMonthAgo && bDate <= todayDate) {
              month++;
            }

            if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
              revenue += Number(b.deposit_amount || 0);
            }

            // Popular services
            const sName = b.services?.name || 'Desconocido';
            serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
          });

          // Sort popular services
          const sortedServices = Object.keys(serviceCounts).map(name => ({
            name,
            count: serviceCounts[name]
          })).sort((a, b) => b.count - a.count).slice(0, 3);

          setStats({
            todayCount: today,
            weekCount: week,
            monthCount: month,
            totalClients: clients.length,
            totalRevenue: revenue
          });

          setPopularServices(sortedServices);

          // Get upcoming bookings (today and onwards, sorted)
          const sortedUpcoming = (bookings as any[])
            .filter((b: any) => b.booking_date >= todayStr && b.status !== 'CANCELLED')
            .sort((a: any, b: any) => {
              if (a.booking_date !== b.booking_date) {
                return a.booking_date.localeCompare(b.booking_date);
              }
              return a.booking_time.localeCompare(b.booking_time);
            })
            .slice(0, 5);

          setUpcomingBookings(sortedUpcoming);
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <Card className="md:col-span-2 border border-neutral-100 shadow-sm">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="bg-primary/10 text-primary p-3.5 rounded-2xl flex-shrink-0">
              <Calendar className="h-7 w-7" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Turnos para Hoy</span>
              <h3 className="text-3xl font-extrabold text-offblack leading-none mt-1">{stats.todayCount}</h3>
              <span className="text-xs font-bold text-gray-400 block mt-1">
                Semana: {stats.weekCount} | Mes: {stats.monthCount}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2 */}
        <Card className="md:col-span-1 border border-neutral-100 shadow-sm">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="bg-secondary/10 text-secondary p-3.5 rounded-2xl flex-shrink-0">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clientes</span>
              <h3 className="text-2xl font-extrabold text-offblack mt-1">{stats.totalClients}</h3>
              <span className="text-xs font-semibold text-gray-400">Registrados</span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3 */}
        <Card className="md:col-span-1 border border-neutral-100 bg-emerald-50/20 shadow-sm">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="bg-success/10 text-success p-3.5 rounded-2xl flex-shrink-0">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ingresos Señas</span>
              <h3 className="text-2xl font-extrabold text-success mt-1">${formatCurrency(stats.totalRevenue)}</h3>
              <span className="text-xs font-semibold text-success/80">Pagos confirmados</span>
            </div>
          </CardContent>
        </Card>
      </div>

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
                    <p className="text-xs text-gray-500 font-medium">
                      Cliente: <strong>{b.clients?.first_name} {b.clients?.last_name}</strong> ({b.clients?.phone})
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

        {/* Right Side: Popular Services & Quick Actions (col-span 1) */}
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
        </div>
      </div>
    </div>
  );
};
