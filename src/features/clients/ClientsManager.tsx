import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { formatDate } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { User, Phone, Mail, Calendar, Trash2, LayoutGrid, List } from 'lucide-react';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';

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

interface Client {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
}

interface Booking {
  id: string;
  client_id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  services: {
    name: string;
  };
}

export const ClientsManager: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedClientBookings, setSelectedClientBookings] = useState<Booking[]>([]);
  const [activeClientName, setActiveClientName] = useState<string>('');

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'bookings-desc'>('name-asc');
  
  // Confirmation Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'warning' | 'primary';
    showCancel?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    showCancel: true
  });

  const showConfirm = (config: {
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'warning' | 'primary';
    showCancel?: boolean;
  }) => {
    setConfirmConfig({
      isOpen: true,
      showCancel: true,
      ...config
    });
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const { data: clientList } = await supabase.from('clients').select('*');
      const { data: bookingList } = await supabase.from('bookings').select('*, services(name)');
      
      if (clientList) setClients(clientList);
      if (bookingList) setBookings(bookingList);
      setLoading(false);
    }
    loadData();
  }, []);

  const getClientBookingCount = (clientId: string) => {
    return bookings.filter(b => b.client_id === clientId).length;
  };

  const getClientNoShowStats = (clientId: string) => {
    const clientBookings = bookings.filter(b => b.client_id === clientId);
    const total = clientBookings.length;
    const noShows = clientBookings.filter(b => b.status === 'NO_SHOW').length;
    const rate = total > 0 ? (noShows / total) : 0;
    return {
      total,
      noShows,
      rate,
      isConflictive: total >= 2 && rate >= 0.3
    };
  };

  const handleSelectClient = (client: Client) => {
    const cb = bookings.filter(b => b.client_id === client.id).sort((a, b) => b.booking_date.localeCompare(a.booking_date));
    setSelectedClientBookings(cb);
    setActiveClientName(`${client.first_name} ${client.last_name}`);
  };

  const sortedAndFilteredClients = clients
    .filter(c => {
      const term = search.toLowerCase();
      return (
        c.first_name.toLowerCase().includes(term) ||
        c.last_name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.phone.includes(term)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name-asc') {
        const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
        const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'name-desc') {
        const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
        const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
        return nameB.localeCompare(nameA);
      } else if (sortBy === 'bookings-desc') {
        return getClientBookingCount(b.id) - getClientBookingCount(a.id);
      }
      return 0;
    });

  const handleDeleteClient = (client: Client) => {
    const clientBookings = bookings.filter(b => b.client_id === client.id);
    const todayStr = new Date().toISOString().split('T')[0];
    const hasPending = clientBookings.some(b => 
      b.booking_date >= todayStr && 
      ['CONFIRMED', 'RESCHEDULED', 'PENDING_PAYMENT'].includes(b.status)
    );

    const message = hasPending
      ? `⚠️ ATENCIÓN: El cliente ${client.first_name} ${client.last_name} tiene turnos pendientes activos. Si continúas, se borrará permanentemente al cliente y se CANCELARÁN y borrarán todos sus turnos (incluyendo los pendientes).`
      : `¿Seguro que deseas eliminar a ${client.first_name} ${client.last_name}? Se borrarán permanentemente sus datos de contacto y todo su historial de turnos (${clientBookings.length} turnos).`;

    showConfirm({
      title: hasPending ? 'Eliminar Cliente con Turnos Pendientes' : 'Eliminar Cliente',
      message: message,
      confirmText: 'Confirmar Eliminación',
      variant: 'danger',
      onConfirm: async () => {
        try {
          // 1. Delete associated bookings first to bypass restrict constraint if not cascaded natively
          if (clientBookings.length > 0) {
            const { error: bookingErr } = await supabase.from('bookings').delete().eq('client_id', client.id);
            if (bookingErr) throw bookingErr;
          }

          // 2. Delete the client
          const { error: clientErr } = await supabase.from('clients').delete().eq('id', client.id);
          if (clientErr) throw clientErr;

          // Update local state
          setClients(prev => prev.filter(c => c.id !== client.id));
          // Remove client's bookings from local bookings list state to refresh the UI immediately
          setBookings(prev => prev.filter(b => b.client_id !== client.id));
          
          if (activeClientName === `${client.first_name} ${client.last_name}`) {
            setActiveClientName('');
            setSelectedClientBookings([]);
          }
        } catch (err: any) {
          console.error(err);
          showConfirm({
            title: 'Error de Eliminación',
            message: 'Ocurrió un error inesperado al intentar eliminar al cliente y sus turnos asociados.',
            confirmText: 'Entendido',
            variant: 'danger',
            showCancel: false,
            onConfirm: () => {}
          });
        }
      }
    });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Base de Clientes</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Directorio de contactos de clientes y sus historiales de reserva</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between border-b border-neutral-100 pb-4">
        {/* Search */}
        <div className="flex flex-col md:flex-row gap-2.5 max-w-md flex-1">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono..."
            className="flex-1"
          />
        </div>

        {/* Sort and View Mode Toggles */}
        <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
          {/* Sorting */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-neutral-200 p-2 text-xs font-bold rounded-lg bg-white focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="name-asc">Nombre (A-Z)</option>
              <option value="name-desc">Nombre (Z-A)</option>
              <option value="bookings-desc">Más Turnos</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-neutral-200 p-1 bg-neutral-50 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md cursor-pointer transition-all border-none ${
                viewMode === 'grid' ? 'bg-primary text-white shadow-2xs' : 'bg-transparent text-gray-500 hover:text-offblack'
              }`}
              title="Vista Cuadrícula"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md cursor-pointer transition-all border-none ${
                viewMode === 'list' ? 'bg-primary text-white shadow-2xs' : 'bg-transparent text-gray-500 hover:text-offblack'
              }`}
              title="Vista Lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando base de datos de clientes...</div>
      ) : (
        /* ASYMMETRIC GRID: 2 Columns for directories, 1 Column for history detail */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Directories List */}          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-lg font-bold text-offblack">Clientes Registrados ({sortedAndFilteredClients.length})</h3>
            
            {sortedAndFilteredClients.length === 0 ? (
              <div className="p-8 bg-white border border-dashed border-neutral-200 text-center text-gray-400 font-bold rounded-2xl">
                Ningún cliente coincide con la búsqueda.
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedAndFilteredClients.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="bg-white border border-neutral-100 p-4 rounded-xl cursor-pointer hover:border-primary/30 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-base text-offblack m-0 flex items-center gap-2 flex-wrap">
                        <User className="h-4 w-4 text-primary" /> {c.first_name} {c.last_name}
                        {getClientNoShowStats(c.id).isConflictive && (
                          <span className="bg-danger/10 text-danger text-[9px] font-bold px-2 py-0.5 rounded-full inline-flex items-center shrink-0">
                            ⚠️ Alerta Inasistencias ({Math.round(getClientNoShowStats(c.id).rate * 100)}%)
                          </span>
                        )}
                      </h4>
                      
                      <div className="text-xs text-gray-500 font-semibold space-y-1.5">
                        <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-gray-450" /> {c.email}</p>
                        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-450" /> {c.phone}</p>
                      </div>
                    </div>
 
                    <div className="mt-4 pt-3 border-t border-dashed border-neutral-100 flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-semibold">Total turnos:</span>
                      <div className="flex items-center gap-2">
                        <span className="bg-secondary/10 text-secondary px-2.5 py-0.5 rounded-full font-bold">
                          {getClientBookingCount(c.id)}
                        </span>
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClient(c);
                          }}
                          className="p-1 min-w-0 border-none hover:bg-neutral-50 rounded-lg"
                          title="Eliminar cliente"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-neutral-100 rounded-xl shadow-xs overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-150 font-bold text-gray-505">
                      <th className="p-3">Nombre</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Teléfono</th>
                      <th className="p-3 text-center">Turnos</th>
                      <th className="p-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sortedAndFilteredClients.map(c => (
                      <tr 
                        key={c.id}
                        onClick={() => handleSelectClient(c)}
                        className="hover:bg-neutral-50/50 cursor-pointer transition-all align-middle"
                      >
                        <td className="p-3 font-extrabold text-offblack flex items-center gap-1.5 flex-wrap">
                          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-primary" /> {c.first_name} {c.last_name}</span>
                          {getClientNoShowStats(c.id).isConflictive && (
                            <span className="bg-danger/10 text-danger text-[8px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center shrink-0">
                              ⚠️ Inasistencias ({Math.round(getClientNoShowStats(c.id).rate * 100)}%)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500 font-semibold">{c.email}</td>
                        <td className="p-3 text-gray-500 font-semibold">{c.phone}</td>
                        <td className="p-3 text-center font-bold">
                          <span className="bg-secondary/10 text-secondary px-2.5 py-0.5 rounded-full font-bold">
                            {getClientBookingCount(c.id)}
                          </span>
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteClient(c)}
                            className="p-1 min-w-0 border-none hover:bg-neutral-50 rounded-lg"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History details panel */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
              <Calendar className="h-5 w-5 text-secondary" /> Historial de Reservas
            </h3>
            
            {!activeClientName ? (
              <div className="p-6 bg-neutral-50 border border-dashed border-neutral-200 text-center text-xs font-bold text-gray-450 rounded-xl">
                Haz clic sobre un cliente de la lista para ver sus reservas pasadas y futuras.
              </div>
            ) : (
              <Card className="border border-neutral-100 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base text-offblack m-0">Reservas de {activeClientName}</CardTitle>
                  {(() => {
                    const client = clients.find(c => `${c.first_name} ${c.last_name}` === activeClientName);
                    if (client) {
                      return (
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteClient(client)}
                          className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg shrink-0"
                          title="Eliminar cliente"
                        >
                          <Trash2 className="h-4.5 w-4.5 text-danger" />
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </CardHeader>
                <CardContent className="space-y-3 py-2">
                  {(() => {
                    const client = clients.find(c => `${c.first_name} ${c.last_name}` === activeClientName);
                    if (client) {
                      const stats = getClientNoShowStats(client.id);
                      if (stats.isConflictive) {
                        return (
                          <div className="bg-danger/5 border border-danger/10 p-2.5 rounded-lg text-xs font-semibold text-danger mb-2 text-left">
                            ⚠️ Este cliente tiene una alta tasa de inasistencia del <strong>{Math.round(stats.rate * 100)}%</strong> ({stats.noShows} ausencias de {stats.total} turnos).
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}

                  {selectedClientBookings.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No registra turnos todavía.</p>
                  ) : (
                    <div className="max-h-[50dvh] overflow-y-auto pr-1 space-y-2.5">
                      {selectedClientBookings.map(b => (
                        <div key={b.id} className="border border-neutral-200 p-3 bg-neutral-50 rounded-lg space-y-1.5 text-left">
                          <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500">
                            <span>{formatDate(b.booking_date)} | {b.booking_time.substring(0, 5)} hs</span>
                            <span className={`px-2 py-0.5 rounded-full font-bold ${getStatusBadgeClass(b.status)}`}>
                              {translateStatus(b.status)}
                            </span>
                          </div>
                          <p className="font-bold text-xs text-offblack">{b.services?.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        variant={confirmConfig.variant}
        showCancel={confirmConfig.showCancel}
      />
    </div>
  );
};
