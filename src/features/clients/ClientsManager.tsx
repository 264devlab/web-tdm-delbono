import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { User, Phone, Mail, Calendar, Search } from 'lucide-react';

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

  const handleSelectClient = (client: Client) => {
    const cb = bookings.filter(b => b.client_id === client.id).sort((a, b) => b.booking_date.localeCompare(a.booking_date));
    setSelectedClientBookings(cb);
    setActiveClientName(`${client.first_name} ${client.last_name}`);
  };

  const filteredClients = clients.filter(c => {
    const term = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(term) ||
      c.last_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.phone.includes(term)
    );
  });

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Base de Clientes</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Directorio de contactos de clientes y sus historiales de reserva</p>
      </div>

      <div className="flex flex-col md:flex-row gap-2.5 max-w-md">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o teléfono..."
          className="flex-1"
        />
        <Button variant="secondary" className="flex items-center gap-1.5 min-w-[100px] py-2.5 rounded-lg">
          <Search className="h-4 w-4" /> Buscar
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando base de datos de clientes...</div>
      ) : (
        /* ASYMMETRIC GRID: 2 Columns for directories, 1 Column for history detail */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Directories List */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-lg font-bold text-offblack">Clientes Registrados ({filteredClients.length})</h3>
            
            {filteredClients.length === 0 ? (
              <div className="p-8 bg-white border border-dashed border-neutral-200 text-center text-gray-400 font-bold rounded-2xl">
                Ningún cliente coincide con la búsqueda.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClients.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="bg-white border border-neutral-100 p-4 rounded-xl cursor-pointer hover:border-primary/30 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-base text-offblack m-0 flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" /> {c.first_name} {c.last_name}
                      </h4>
                      
                      <div className="text-xs text-gray-500 font-semibold space-y-1.5">
                        <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-gray-450" /> {c.email}</p>
                        <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-450" /> {c.phone}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-dashed border-neutral-100 flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-semibold">Total turnos:</span>
                      <span className="bg-secondary/10 text-secondary px-2.5 py-0.5 rounded-full font-bold">
                        {getClientBookingCount(c.id)}
                      </span>
                    </div>
                  </div>
                ))}
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-offblack">Reservas de {activeClientName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 py-2">
                  {selectedClientBookings.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No registra turnos todavía.</p>
                  ) : (
                    <div className="max-h-[50dvh] overflow-y-auto pr-1 space-y-2.5">
                      {selectedClientBookings.map(b => (
                        <div key={b.id} className="border border-neutral-200 p-3 bg-neutral-50 rounded-lg space-y-1.5 text-left">
                          <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500">
                            <span>{b.booking_date} | {b.booking_time.substring(0, 5)} hs</span>
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
    </div>
  );
};
