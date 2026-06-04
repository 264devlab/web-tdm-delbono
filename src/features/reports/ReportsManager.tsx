import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../utils/format';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Download, BarChart2, DollarSign, Calendar, Users, Briefcase } from 'lucide-react';

export const ReportsManager: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState({
    clientsCount: 0,
    bookingsCount: 0,
    servicesCount: 0,
    totalRevenue: 0
  });

  // Confirmation/Alert Modal states
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
    async function loadStats() {
      setLoading(true);
      const { data: clients } = await supabase.from('clients').select('id');
      const { data: bookings } = await supabase.from('bookings').select('deposit_amount, status');
      const { data: services } = await supabase.from('services').select('id');

      if (clients && bookings && services) {
        let rev = 0;
        bookings.forEach((b: any) => {
          if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
            rev += Number(b.deposit_amount || 0);
          }
        });
        
        setStats({
          clientsCount: clients.length,
          bookingsCount: bookings.length,
          servicesCount: services.length,
          totalRevenue: rev
        });
      }
      setLoading(false);
    }
    loadStats();
  }, []);

  // Helper to trigger download of string content as a CSV file
  const downloadCSV = (filename: string, csvContent: string) => {
    // Add UTF-8 BOM so Excel opens it with proper encoding
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 1. Export Clients
  const exportClients = async () => {
    const { data: clients, error } = await supabase.from('clients').select('*');
    if (error || !clients) {
      showConfirm({
        title: 'Error de Exportación',
        message: 'Ocurrió un error al intentar exportar los clientes.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    const headers = ['ID', 'Email', 'Nombre', 'Apellido', 'Teléfono', 'Fecha Registro'];
    const rows = clients.map((c: any) => [
      c.id,
      c.email,
      c.first_name,
      c.last_name,
      c.phone,
      formatDate(c.created_at)
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_clientes.csv', csvContent);
  };

  // 2. Export Bookings (Turnos)
  const exportBookings = async () => {
    const { data: bookings, error } = await supabase.from('bookings').select('*, clients(*), services(*)');
    if (error || !bookings) {
      showConfirm({
        title: 'Error de Exportación',
        message: 'Ocurrió un error al intentar exportar la planilla de turnos.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    const headers = ['ID Reserva', 'Cliente Email', 'Cliente Nombre', 'Servicio', 'Fecha Turno', 'Hora Turno', 'Duración (Min)', 'Seña Pagada ($)', 'Estado', 'ID Pago MP', 'Fecha Creación'];
    const rows = bookings.map((b: any) => [
      b.id,
      b.clients?.email || 'N/A',
      `${b.clients?.first_name || ''} ${b.clients?.last_name || ''}`,
      b.services?.name || 'N/A',
      formatDate(b.booking_date),
      b.booking_time,
      b.duration,
      formatCurrency(b.deposit_amount),
      b.status,
      b.payment_id || 'N/A',
      formatDate(b.created_at)
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_turnos.csv', csvContent);
  };

  // 3. Export Services
  const exportServices = async () => {
    const { data: services, error } = await supabase.from('services').select('*, categories(*)');
    if (error || !services) {
      showConfirm({
        title: 'Error de Exportación',
        message: 'Ocurrió un error al intentar exportar el catálogo de servicios.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    const headers = ['ID', 'Categoría', 'Servicio', 'Descripción', 'Duración (Min)', 'Activo', 'Seña Requiere', 'Monto Seña', 'Max Turnos Simultáneos'];
    const rows = services.map((s: any) => [
      s.id,
      s.categories?.name || 'N/A',
      s.name,
      s.description || '',
      s.estimated_duration_minutes,
      s.active ? 'SÍ' : 'NO',
      s.requires_deposit ? 'SÍ' : 'NO',
      formatCurrency(s.deposit_amount),
      s.max_concurrent_bookings
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_servicios.csv', csvContent);
  };

  // 4. Export Revenues
  const exportRevenues = async () => {
    const { data: bookings, error } = await supabase.from('bookings').select('*, clients(*), services(*)');
    if (error || !bookings) {
      showConfirm({
        title: 'Error de Exportación',
        message: 'Ocurrió un error al intentar exportar el reporte de ingresos.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    // Filter only confirmed/completed revenues
    const paidBookings = bookings.filter((b: any) => b.status === 'CONFIRMED' || b.status === 'COMPLETED');

    const headers = ['ID Reserva', 'Fecha Turno', 'Cliente Email', 'Cliente Nombre', 'Servicio', 'Seña Cobrada', 'Referencia Pago MP', 'Fecha Transacción'];
    const rows = paidBookings.map((b: any) => [
      b.id,
      formatDate(b.booking_date),
      b.clients?.email || 'N/A',
      `${b.clients?.first_name || ''} ${b.clients?.last_name || ''}`,
      b.services?.name || 'N/A',
      formatCurrency(b.deposit_amount),
      b.payment_id || 'N/A',
      formatDate(b.updated_at)
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_ingresos.csv', csvContent);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Reportería y Exportaciones</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Descargar planillas de control administrativo compatibles con MS Excel</p>
      </div>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando métricas de reportes...</div>
      ) : (
        <div className="space-y-8">
          {/* Summary widgets grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-5 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <span className="text-[10px] font-bold text-gray-450 uppercase">Clientes</span>
                  <p className="text-xl font-extrabold text-offblack m-0">{stats.clientsCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-5 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-secondary" />
                <div>
                  <span className="text-[10px] font-bold text-gray-450 uppercase">Reservas</span>
                  <p className="text-xl font-extrabold text-offblack m-0">{stats.bookingsCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-neutral-100 shadow-sm">
              <CardContent className="py-5 flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-warning" />
                <div>
                  <span className="text-[10px] font-bold text-gray-450 uppercase">Servicios Activos</span>
                  <p className="text-xl font-extrabold text-offblack m-0">{stats.servicesCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-neutral-100 bg-emerald-50/20 shadow-sm">
              <CardContent className="py-5 flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-success" />
                <div>
                  <span className="text-[10px] font-bold text-success/80 uppercase">Recaudado Señas</span>
                  <p className="text-xl font-extrabold text-success m-0">${formatCurrency(stats.totalRevenue)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action grid */}
          <div className="space-y-4 max-w-2xl text-left">
            <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" /> Descarga de Reportes
            </h3>

            <div className="bg-white border border-neutral-100 rounded-2xl divide-y divide-neutral-100 overflow-hidden shadow-sm">
              {/* Row 1: Clients */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Listado de Clientes</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Nombres, correos, celulares y fechas de registro de clientes.</p>
                </div>
                <Button variant="secondary" onClick={exportClients} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 2: Bookings */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Planilla de Reservas (Turnos)</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Historial completo con estados, servicios y detalles de seña.</p>
                </div>
                <Button variant="secondary" onClick={exportBookings} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 3: Services */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Catálogo de Servicios</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Configuraciones de duración, seña y concurrencia por servicio.</p>
                </div>
                <Button variant="secondary" onClick={exportServices} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 4: Revenues */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Libro de Ingresos (Señas MP)</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Detalles de pagos procesados mediante pasarela de pago.</p>
                </div>
                <Button variant="secondary" onClick={exportRevenues} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL CONFIRMATION DIALOG */}
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
