import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../utils/format';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Modal } from '../../components/ui/Modal';
import {
  Download,
  BarChart2,
  DollarSign,
  Calendar,
  Users,
  Briefcase,
  HelpCircle,
  RefreshCw
} from 'lucide-react';

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

export const ReportsManager: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);

  // Date and dropdown filters state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Supabase raw data state
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);

  // Confirmation modal state
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
    onConfirm: () => { },
    showCancel: true
  });

  // Help modal state
  const [helpModal, setHelpModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({
    isOpen: false,
    title: '',
    content: ''
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

  const openHelpModal = (title: string, content: string) => {
    setHelpModal({
      isOpen: true,
      title,
      content
    });
  };

  // Load all raw data once on mount or refresh
  async function loadAllData() {
    setLoading(true);
    try {
      const { data: bookings } = await supabase.from('bookings').select('*, clients(*), services(*)');
      const { data: clients } = await supabase.from('clients').select('*');
      const { data: services } = await supabase.from('services').select('*');
      const { data: categories } = await supabase.from('categories').select('*');

      if (bookings) setAllBookings(bookings);
      if (clients) setAllClients(clients);
      if (services) setAllServices(services);
      if (categories) setAllCategories(categories);
    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  // Preset handlers
  const setPresetThisMonth = () => {
    const now = new Date();
    const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    const todayStr = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
    setStartDate(startStr);
    setEndDate(todayStr);
  };

  const setPresetLastMonth = () => {
    const now = new Date();
    const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const tzOffset1 = firstDayPrevMonth.getTimezoneOffset() * 60000;
    const startStr = new Date(firstDayPrevMonth.getTime() - tzOffset1).toISOString().split('T')[0];

    const tzOffset2 = lastDayPrevMonth.getTimezoneOffset() * 60000;
    const endStr = new Date(lastDayPrevMonth.getTime() - tzOffset2).toISOString().split('T')[0];

    setStartDate(startStr);
    setEndDate(endStr);
  };

  const setPresetLast30Days = () => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    const todayStr = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const tzOffset30 = thirtyDaysAgo.getTimezoneOffset() * 60000;
    const startStr = new Date(thirtyDaysAgo.getTime() - tzOffset30).toISOString().split('T')[0];

    setStartDate(startStr);
    setEndDate(todayStr);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedServiceId('all');
    setSelectedStatus('all');
  };

  // Reactive filtering logic
  const filteredBookings = allBookings.filter((b: any) => {
    if (startDate && b.booking_date < startDate) return false;
    if (endDate && b.booking_date > endDate) return false;
    if (selectedServiceId !== 'all' && b.service_id !== selectedServiceId) return false;
    if (selectedStatus !== 'all' && b.status !== selectedStatus) return false;
    return true;
  });

  const filteredClients = allClients.filter((c: any) => {
    if (!c.created_at) return true;
    const clientDate = c.created_at.split('T')[0];
    if (startDate && clientDate < startDate) return false;
    if (endDate && clientDate > endDate) return false;
    return true;
  });

  // Calculate stats in memory based on filtered data
  const clientsCount = filteredClients.length;
  const bookingsCount = filteredBookings.length;
  const servicesCount = allServices.filter(s => s.active).length;

  let depositRevenue = 0;
  let localRevenue = 0;

  // Categories revenue mapping helper
  const categoryMap: Record<string, string> = {};
  allCategories.forEach(cat => {
    categoryMap[cat.id] = cat.name;
  });

  const categoryRevenue: Record<string, number> = {};
  let newClientBookings = 0;
  let returningClientBookings = 0;

  // Weekday seasonality helper
  const weekdayStats = [
    { name: 'Lunes', bookings: 0, revenue: 0 },
    { name: 'Martes', bookings: 0, revenue: 0 },
    { name: 'Miércoles', bookings: 0, revenue: 0 },
    { name: 'Jueves', bookings: 0, revenue: 0 },
    { name: 'Viernes', bookings: 0, revenue: 0 },
    { name: 'Sábado', bookings: 0, revenue: 0 },
    { name: 'Domingo', bookings: 0, revenue: 0 }
  ];

  // No-Show list counter
  const noShowClientsMap: Record<string, { name: string; email: string; phone: string; count: number }> = {};

  filteredBookings.forEach((b: any) => {
    // 1. Calculate revenues
    if (b.status === 'CONFIRMED' || b.status === 'RESCHEDULED' || b.status === 'COMPLETED' || b.status === 'NO_SHOW') {
      depositRevenue += Number(b.deposit_amount || 0);
    }

    let totalValue = 0;
    if (b.status === 'COMPLETED') {
      totalValue = Number(b.services?.price || 0) * (b.quantity || 1);
      const remaining = Math.max(0, totalValue - Number(b.deposit_amount || 0));
      localRevenue += remaining;
    } else if (b.status === 'CONFIRMED' || b.status === 'RESCHEDULED' || b.status === 'NO_SHOW') {
      totalValue = Number(b.deposit_amount || 0);
    }

    // 2. Revenues by category
    const catId = b.services?.category_id || 'other';
    const catName = categoryMap[catId] || 'Otros';
    categoryRevenue[catName] = (categoryRevenue[catName] || 0) + totalValue;

    // 3. Client retention logic (prior booking analysis)
    const clientBookings = allBookings.filter(ob => ob.client_id === b.client_id);
    const hasPriorBooking = clientBookings.some(ob => {
      if (ob.id === b.id) return false;
      if (ob.booking_date < b.booking_date) return true;
      if (ob.booking_date === b.booking_date && ob.booking_time < b.booking_time) return true;
      return false;
    });
    if (hasPriorBooking) {
      returningClientBookings++;
    } else {
      newClientBookings++;
    }

    // 4. Weekday seasonality
    const bDateObj = new Date(b.booking_date + 'T00:00:00');
    const dayOfWeek = bDateObj.getDay(); // 0=Sunday, 1=Monday, etc.
    const mapIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // map 0 to Sunday(6), 1 to Monday(0), etc.
    if (mapIndex >= 0 && mapIndex <= 6) {
      weekdayStats[mapIndex].bookings++;
      weekdayStats[mapIndex].revenue += totalValue;
    }

    // 5. No-Show list
    if (b.status === 'NO_SHOW' && b.clients) {
      const cId = b.clients.id;
      const name = `${b.clients.first_name} ${b.clients.last_name}`;
      const email = b.clients.email;
      const phone = b.clients.phone;
      if (!noShowClientsMap[cId]) {
        noShowClientsMap[cId] = { name, email, phone, count: 0 };
      }
      noShowClientsMap[cId].count++;
    }
  });

  const totalRev = depositRevenue + localRevenue;
  const depositPct = totalRev > 0 ? (depositRevenue / totalRev) * 100 : 0;
  const localPct = totalRev > 0 ? (localRevenue / totalRev) * 100 : 0;

  const totalB = newClientBookings + returningClientBookings;
  const newPct = totalB > 0 ? (newClientBookings / totalB) * 100 : 0;
  const retPct = totalB > 0 ? (returningClientBookings / totalB) * 100 : 0;

  // 6. Occupancy calculation helper
  const getDaysInRange = (start: string, end: string) => {
    const startDateObj = new Date(start + 'T00:00:00');
    const endDateObj = new Date(end + 'T00:00:00');
    let count = 0;
    let current = new Date(startDateObj);
    while (current <= endDateObj) {
      if (current.getDay() !== 0) { // Exclude Sundays
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  let workingDays = 0;
  if (startDate && endDate) {
    workingDays = getDaysInRange(startDate, endDate);
  } else {
    // Default to last 30 days
    const endStr = new Date().toISOString().split('T')[0];
    const startObj = new Date();
    startObj.setDate(startObj.getDate() - 30);
    const startStr = startObj.toISOString().split('T')[0];
    workingDays = getDaysInRange(startStr, endStr);
  }
  if (workingDays === 0) workingDays = 1;
  const totalCapacity = workingDays * 16; // 8 hours * 2 concurrent slots avg
  const bookingsInPeriod = filteredBookings.filter(b => b.status !== 'CANCELLED').length;
  const occupancyRate = Math.min(100, (bookingsInPeriod / totalCapacity) * 100);

  // Sorted list of No-Show clients
  const sortedNoShows = Object.values(noShowClientsMap)
    .sort((a, b) => b.count - a.count)
    .filter(c => c.count > 0);

  // Helper to trigger download of string content as a CSV file
  const downloadCSV = (filename: string, csvContent: string) => {
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

  // Export Clients CSV
  const exportClients = () => {
    if (filteredClients.length === 0) {
      showConfirm({
        title: 'Sin datos',
        message: 'No existen registros de clientes para exportar con los filtros actuales.',
        confirmText: 'Entendido',
        variant: 'primary',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    const headers = ['ID', 'Email', 'Nombre', 'Apellido', 'Teléfono', 'Fecha Registro'];
    const rows = filteredClients.map((c: any) => [
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

  // Export Bookings CSV
  const exportBookings = () => {
    if (filteredBookings.length === 0) {
      showConfirm({
        title: 'Sin datos',
        message: 'No existen registros de turnos para exportar con los filtros actuales.',
        confirmText: 'Entendido',
        variant: 'primary',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    const headers = ['ID Reserva', 'Cliente Email', 'Cliente Nombre', 'Servicio', 'Fecha Turno', 'Hora Turno', 'Duración (Min)', 'Cantidad', 'Seña Pagada ($)', 'Estado', 'ID Pago MP', 'Fecha Creación'];
    const rows = filteredBookings.map((b: any) => [
      b.id,
      b.clients?.email || 'N/A',
      `${b.clients?.first_name || ''} ${b.clients?.last_name || ''}`,
      b.services?.name || 'N/A',
      formatDate(b.booking_date),
      b.booking_time,
      b.duration,
      b.quantity || 1,
      formatCurrency(b.deposit_amount),
      translateStatus(b.status),
      b.payment_id || 'N/A',
      formatDate(b.created_at)
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_turnos.csv', csvContent);
  };

  // Export Services CSV
  const exportServices = () => {
    if (allServices.length === 0) {
      return;
    }

    const headers = ['ID', 'Servicio', 'Duración (Min)', 'Activo', 'Seña Requiere', 'Monto Seña', 'Precio Total', 'Max Turnos Simultáneos'];
    const rows = allServices.map((s: any) => [
      s.id,
      s.name,
      s.estimated_duration_minutes,
      s.active ? 'SÍ' : 'NO',
      s.requires_deposit ? 'SÍ' : 'NO',
      formatCurrency(s.deposit_amount),
      formatCurrency(s.price),
      s.max_concurrent_bookings
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_servicios.csv', csvContent);
  };

  // Export Revenues (Señas) CSV
  const exportRevenues = () => {
    const paidBookings = filteredBookings.filter((b: any) =>
      b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'RESCHEDULED' || b.status === 'NO_SHOW'
    );

    if (paidBookings.length === 0) {
      showConfirm({
        title: 'Sin datos',
        message: 'No existen registros de cobro de señas para el período e filtros seleccionados.',
        confirmText: 'Entendido',
        variant: 'primary',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

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
    downloadCSV('reporte_ingresos_señas.csv', csvContent);
  };

  // Export Total Revenues (Señas + Saldos Presenciales) CSV
  const exportTotalRevenues = () => {
    const activeBookings = filteredBookings.filter((b: any) =>
      b.status !== 'CANCELLED' && b.status !== 'PENDING_PAYMENT'
    );

    if (activeBookings.length === 0) {
      showConfirm({
        title: 'Sin datos',
        message: 'No existen registros de facturación (confirmados/completados) en el rango activo.',
        confirmText: 'Entendido',
        variant: 'primary',
        showCancel: false,
        onConfirm: () => { }
      });
      return;
    }

    const headers = [
      'ID Reserva', 'Fecha Turno', 'Cliente Email', 'Cliente Nombre', 'Servicio',
      'Precio Servicio', 'Cantidad', 'Seña Cobrada', 'Saldo Pendiente/Cobrado Local',
      'Ingreso Total Recaudado/Estimado', 'Estado', 'Fecha Actualización'
    ];
    const rows = activeBookings.map((b: any) => {
      const price = Number(b.services?.price || 0);
      const qty = Number(b.quantity || 1);
      const totalValue = price * qty;
      const deposit = Number(b.deposit_amount || 0);
      const remaining = b.status === 'COMPLETED' ? Math.max(0, totalValue - deposit) : 0;
      const finalRevenue = b.status === 'COMPLETED' ? totalValue : deposit;

      return [
        b.id,
        formatDate(b.booking_date),
        b.clients?.email || 'N/A',
        `${b.clients?.first_name || ''} ${b.clients?.last_name || ''}`,
        b.services?.name || 'N/A',
        formatCurrency(price),
        qty,
        formatCurrency(deposit),
        formatCurrency(remaining),
        formatCurrency(finalRevenue),
        translateStatus(b.status),
        formatDate(b.updated_at)
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.map((val: any) => `"${val || ''}"`).join(','))].join('\n');
    downloadCSV('reporte_ingresos_totales.csv', csvContent);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Reportería y Exportaciones</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Filtrar, descargar y analizar planillas de control administrativo</p>
      </div>

      {/* Date filters and options */}
      <Card className="border border-neutral-100 shadow-sm">
        <CardContent className="py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1">Fecha Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full font-semibold focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1">Fecha Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full font-semibold focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1">Filtrar por Servicio</label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full font-semibold focus:outline-none"
              >
                <option value="all">Todos los Servicios</option>
                {allServices.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1">Filtrar por Estado</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full font-semibold focus:outline-none"
              >
                <option value="all">Todos los Estados</option>
                <option value="PENDING_PAYMENT">Pendiente Pago</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="RESCHEDULED">Reprogramado</option>
                <option value="COMPLETED">Completado</option>
                <option value="NO_SHOW">Ausente</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-50">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={setPresetThisMonth}
                className="py-1 px-3 bg-neutral-100 hover:bg-neutral-200 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Este Mes
              </button>
              <button
                onClick={setPresetLastMonth}
                className="py-1 px-3 bg-neutral-100 hover:bg-neutral-200 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Mes Pasado
              </button>
              <button
                onClick={setPresetLast30Days}
                className="py-1 px-3 bg-neutral-100 hover:bg-neutral-200 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Últimos 30 días
              </button>
              <button
                onClick={clearFilters}
                className="py-1 px-3 bg-neutral-105 border border-neutral-200 hover:bg-neutral-200/50 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Limpiar Filtros
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={loadAllData}
                className="py-1.5 px-3 text-xs rounded-lg flex items-center gap-1.5 min-w-0"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refrescar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando métricas de reportes...</div>
      ) : (
        <div className="space-y-8">
          {/* Summary widgets grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Clientes */}
            <Card className="border border-neutral-100 shadow-sm relative group">
              <CardContent className="py-5 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Clientes</span>
                  <p className="text-xl font-extrabold text-offblack m-0 leading-tight">{clientsCount}</p>
                  <span className="text-[9px] font-semibold text-gray-450 mt-0.5 block truncate">Registrados en rango</span>
                </div>
                <button
                  onClick={() => openHelpModal('Métrica: Clientes', 'Muestra el número total de clientes que se registraron (crearon su cuenta) dentro del rango de fechas seleccionado. Si no hay filtro, muestra el total histórico.')}
                  className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>

            {/* Reservas */}
            <Card className="border border-neutral-100 shadow-sm relative group">
              <CardContent className="py-5 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-secondary" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Reservas</span>
                  <p className="text-xl font-extrabold text-offblack m-0 leading-tight">{bookingsCount}</p>
                  <span className="text-[9px] font-semibold text-gray-450 mt-0.5 block">Turnos filtrados</span>
                </div>
                <button
                  onClick={() => openHelpModal('Métrica: Reservas', 'Muestra la cantidad total de turnos/reservas que coinciden con los filtros actuales de fecha, servicio y estado. Te permite cuantificar el volumen de citas.')}
                  className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>

            {/* Servicios */}
            <Card className="border border-neutral-100 shadow-sm relative group">
              <CardContent className="py-5 flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-warning" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Servicios Activos</span>
                  <p className="text-xl font-extrabold text-offblack m-0 leading-tight">{servicesCount}</p>
                  <span className="text-[9px] font-semibold text-gray-455 mt-0.5 block">En catálogo</span>
                </div>
                <button
                  onClick={() => openHelpModal('Métrica: Servicios Activos', 'Muestra la cantidad de servicios vigentes y activos en tu catálogo que los clientes pueden reservar online.')}
                  className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>

            {/* Recaudado Señas */}
            <Card className="border border-neutral-100 shadow-sm relative group">
              <CardContent className="py-5 flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-success" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-success/80 uppercase block">Recaudado Señas</span>
                  <p className="text-xl font-extrabold text-success m-0 leading-tight">${formatCurrency(depositRevenue)}</p>
                  <span className="text-[9px] font-semibold text-success/80 mt-0.5 block">Cobro digital MP</span>
                </div>
                <button
                  onClick={() => openHelpModal('Métrica: Recaudado Señas', 'Suma total de los montos cobrados en concepto de seña a través de la pasarela digital (Mercado Pago) para los turnos filtrados. Representa los fondos líquidos capturados en la web.')}
                  className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>

            {/* Ingresos Totales */}
            <Card className="border border-neutral-100 bg-emerald-50/10 shadow-sm relative group">
              <CardContent className="py-5 flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-amber-800/80 block uppercase">Ingresos Totales</span>
                  <p className="text-xl font-extrabold text-amber-700 m-0 leading-tight">${formatCurrency(totalRev)}</p>
                  <span className="text-[9px] font-semibold text-amber-700/80 mt-0.5 block">Señas + Saldo Local</span>
                </div>
                <button
                  onClick={() => openHelpModal('Métrica: Ingresos Totales', 'Suma total de ingresos para los turnos filtrados. Para turnos "Completados" calcula el precio completo del servicio (se asume que pagaron el saldo en el local), mientras que para turnos "Confirmados", "Reprogramados" o "Ausentes" contabiliza únicamente la seña.')}
                  className="text-gray-300 hover:text-gray-500 absolute top-2 right-2 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Reports Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Report 1: Desglose de Caja */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Desglose de Caja (Digital vs. Presencial)
                </h4>
                <button
                  onClick={() => openHelpModal('Reporte: Desglose de Caja', 'Muestra la división de ingresos entre cobros digitales por Mercado Pago (señas) y cobros físicos en la tienda (saldo restante abonado al terminar el servicio). Te ayuda a entender cuánto efectivo/caja física debes manejar contra los cobros en línea.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Señas Online (Mercado Pago)</span>
                      <span>${formatCurrency(depositRevenue)} ({depositPct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-success h-full" style={{ width: `${depositPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Saldo Presencial (Tienda)</span>
                      <span>${formatCurrency(localRevenue)} ({localPct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full" style={{ width: `${localPct}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Report 2: Ingresos por Categoría */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Ingresos por Categoría de Servicio
                </h4>
                <button 
                  onClick={() => openHelpModal('Reporte: Ingresos por Categoría', 'Distribuye la facturación estimada total entre las diferentes categorías de servicios. Te permite saber qué tipo de servicio genera mayor facturación.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4 h-[180px] overflow-y-auto">
                {Object.keys(categoryRevenue).length === 0 ? (
                  <p className="text-xs text-gray-400 font-semibold py-2">Sin datos de ingresos por categoría en el período.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(categoryRevenue).map(([cat, amount], index) => {
                      const pct = totalRev > 0 ? (amount / totalRev) * 100 : 0;
                      const colors = ['bg-primary', 'bg-secondary', 'bg-success', 'bg-danger', 'bg-indigo-650'];
                      const barColor = colors[index % colors.length];
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <span className="text-gray-600">{cat}</span>
                            <span className="text-offblack">${formatCurrency(amount)} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
                            <div className={`${barColor} h-full transition-all duration-300`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Report 3: Retención de Clientes */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Retención de Clientes (Nuevos vs. Recurrentes)
                </h4>
                <button
                  onClick={() => openHelpModal('Reporte: Retención de Clientes', 'Compara cuántos turnos fueron agendados por clientes nuevos (su primer turno registrado en la historia) contra clientes recurrentes (que ya tenían reservas anteriores). Sirve para medir si los clientes vuelven a elegir tu negocio.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Clientes Nuevos (Primera cita)</span>
                      <span>{newClientBookings} turnos ({newPct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full" style={{ width: `${newPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Clientes Recurrentes (Fieles)</span>
                      <span>{returningClientBookings} turnos ({retPct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full" style={{ width: `${retPct}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Report 4: Ocupación */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Tasa de Ocupación de la Agenda
                </h4>
                <button
                  onClick={() => openHelpModal('Reporte: Ocupación de la Agenda', 'Calcula la proporción de tiempo de la agenda que estuvo ocupada con turnos frente a la capacidad total de turnos disponible (se estima una capacidad de 16 turnos diarios de lunes a sábado). Te indica si tienes espacio libre para meter más reservas o si estás al límite.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>Ocupación de Turnos</span>
                    <span>{bookingsInPeriod} / {totalCapacity} slots ({occupancyRate.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden">
                    <div className={`h-full ${occupancyRate > 80 ? 'bg-danger' : occupancyRate > 50 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${occupancyRate}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1">
                    *Estimación de agenda laboral basada en {workingDays} {workingDays === 1 ? 'día hábil' : 'días hábiles'} en el período.
                  </p>
                </div>
              </Card>
            </div>

            {/* Report 5: Estacionalidad */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Estacionalidad y Tráfico Semanal
                </h4>
                <button
                  onClick={() => openHelpModal('Reporte: Estacionalidad', 'Muestra qué días de la semana (Lunes a Domingo) tienen el mayor flujo de turnos e ingresos. Te permite detectar tendencias semanales de reservas para organizar mejor el stock y personal.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4 h-[180px] overflow-y-auto">
                <div className="space-y-2">
                  {weekdayStats.map(day => (
                    <div key={day.name} className="flex justify-between items-center text-xs font-bold border-b border-neutral-50 pb-1.5 last:border-none last:pb-0">
                      <span className="text-gray-600">{day.name}</span>
                      <div className="text-right">
                        <span className="text-offblack">{day.bookings} {day.bookings === 1 ? 'turno' : 'turnos'}</span>
                        <span className="text-success ml-3">${formatCurrency(day.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Report 6: Registro de Ausencias */}
            <div className="space-y-3 text-left">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-offblack text-base flex items-center gap-1.5">
                  Registro de Inasistencias (Clientes con Ausencias)
                </h4>
                <button
                  onClick={() => openHelpModal('Reporte: Registro de Inasistencias', 'Listado de los clientes que han reservado turnos pero han faltado a la cita (estado "Ausente"). Te ayuda a monitorear clientes problemáticos para contactarlos o aplicar políticas restrictivas.')}
                  className="text-gray-300 hover:text-gray-500 cursor-pointer transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              <Card className="border border-neutral-100 shadow-sm p-4 h-[180px] overflow-y-auto">
                {sortedNoShows.length === 0 ? (
                  <p className="text-xs text-gray-400 font-semibold py-2">No se registran clientes con ausencias en este período.</p>
                ) : (
                  <div className="space-y-3">
                    {sortedNoShows.map((c, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs border-b border-neutral-50 pb-2 last:border-none last:pb-0">
                        <div className="min-w-0">
                          <span className="font-bold text-offblack block truncate">{c.name}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">{c.phone}</span>
                        </div>
                        <span className="bg-danger/10 text-danger font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                          {c.count} {c.count === 1 ? 'ausencia' : 'ausencias'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Action grid */}
          <div className="space-y-4 max-w-2xl text-left">
            <h3 className="text-lg font-bold text-offblack flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" /> Descarga de Reportes (CSV)
            </h3>

            <div className="bg-white border border-neutral-100 rounded-2xl divide-y divide-neutral-100 overflow-hidden shadow-sm">
              {/* Row 1: Clients */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Listado de Clientes</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Nombres, correos, celulares y fechas de registro de clientes (filtrado por rango).</p>
                </div>
                <Button variant="secondary" onClick={exportClients} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 2: Bookings */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Planilla de Reservas (Turnos)</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Historial completo con estados, servicios y detalles de seña (con filtros activos).</p>
                </div>
                <Button variant="secondary" onClick={exportBookings} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 3: Services */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Catálogo de Servicios</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Configuraciones de duración, seña y precio de los servicios.</p>
                </div>
                <Button variant="secondary" onClick={exportServices} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 4: Revenues (Señas) */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Libro de Ingresos (Señas MP)</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Detalles de pagos de señas cobradas por Mercado Pago (con filtros activos).</p>
                </div>
                <Button variant="secondary" onClick={exportRevenues} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Row 5: Total Revenues */}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-offblack m-0 text-sm">Libro de Ingresos Totales</h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">Detalles del total facturado estimado (señas cobradas y saldos presenciales de turnos completados).</p>
                </div>
                <Button variant="secondary" onClick={exportTotalRevenues} className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg">
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

      {/* HELP EXPLANATION MODAL */}
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
