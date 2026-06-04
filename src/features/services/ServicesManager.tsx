import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatCurrency } from '../../utils/format';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Clock, Info, Calendar, Shield, Sliders } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

interface Service {
  id: string;
  category_id: string;
  name: string;
  description: string;
  estimated_duration_minutes: number;
  active: boolean;
  enabled_monday: boolean;
  enabled_tuesday: boolean;
  enabled_wednesday: boolean;
  enabled_thursday: boolean;
  enabled_friday: boolean;
  enabled_saturday: boolean;
  enabled_sunday: boolean;
  max_concurrent_bookings: number;
  requires_deposit: boolean;
  deposit_amount: number;
  price: number;
  allow_reschedule: boolean;
  reschedule_limit_hours: number;
}

interface ServiceHour {
  id?: string;
  service_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DAYS_OF_WEEK = [
  { name: 'Lunes', value: 1 },
  { name: 'Martes', value: 2 },
  { name: 'Miércoles', value: 3 },
  { name: 'Jueves', value: 4 },
  { name: 'Viernes', value: 5 },
  { name: 'Sábado', value: 6 },
  { name: 'Domingo', value: 0 }
];

export const ServicesManager: React.FC = () => {
  const [tab, setTab] = useState<'services' | 'categories'>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals toggles
  const [isServiceModalOpen, setIsServiceModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  
  // Selected items for editing
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Service form states
  const [sCategoryId, setSCategoryId] = useState<string>('');
  const [sName, setSName] = useState<string>('');
  const [sDescription, setSDescription] = useState<string>('');
  const [sDuration, setSDuration] = useState<number>(60);
  const [sActive, setSActive] = useState<boolean>(true);
  const [sEnabledMon, setSEnabledMon] = useState<boolean>(true);
  const [sEnabledTue, setSEnabledTue] = useState<boolean>(true);
  const [sEnabledWed, setSEnabledWed] = useState<boolean>(true);
  const [sEnabledThu, setSEnabledThu] = useState<boolean>(true);
  const [sEnabledFri, setSEnabledFri] = useState<boolean>(true);
  const [sEnabledSat, setSEnabledSat] = useState<boolean>(true);
  const [sEnabledSun, setSEnabledSun] = useState<boolean>(false);
  const [sMaxConcurrent, setSMaxConcurrent] = useState<number>(1);
  const [sRequiresDeposit, setSRequiresDeposit] = useState<boolean>(false);
  const [sDepositAmount, setSDepositAmount] = useState<number>(0);
  const [sPrice, setSPrice] = useState<number>(0);
  const [sAllowReschedule, setSAllowReschedule] = useState<boolean>(true);
  const [sRescheduleLimit, setSRescheduleLimit] = useState<number>(12);

  // Category form states
  const [cName, setCName] = useState<string>('');
  const [cDescription, setCDescription] = useState<string>('');
  const [cActive, setCActive] = useState<boolean>(true);

  // Service Hours states
  const [isHoursModalOpen, setIsHoursModalOpen] = useState<boolean>(false);
  const [selectedHoursService, setSelectedHoursService] = useState<Service | null>(null);
  const [hoursList, setHoursList] = useState<ServiceHour[]>([]);
  const [loadingHours, setLoadingHours] = useState<boolean>(false);
  const [hoursError, setHoursError] = useState<string>('');
  const [selectedDayTab, setSelectedDayTab] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>('09:00');
  const [newEndTime, setNewEndTime] = useState<string>('13:00');

  // Confirmation dialog states
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

  const startEditHours = async (service: Service) => {
    setSelectedHoursService(service);
    setIsHoursModalOpen(true);
    setLoadingHours(true);
    setHoursError('');
    setSelectedDayTab(1); // Lunes por defecto
    try {
      const { data, error } = await supabase
        .from('service_hours')
        .select('*')
        .eq('service_id', service.id);
      
      if (error) throw error;
      setHoursList(data || []);
    } catch (err: any) {
      console.error(err);
      setHoursError('Error al cargar los horarios de disponibilidad.');
    } finally {
      setLoadingHours(false);
    }
  };

  const addShift = (day: number) => {
    if (!newStartTime || !newEndTime) {
      alert('Por favor selecciona hora de inicio y fin.');
      return;
    }
    if (newStartTime >= newEndTime) {
      alert('La hora de inicio debe ser anterior a la hora de fin.');
      return;
    }

    const formattedStart = `${newStartTime}:00`;
    const formattedEnd = `${newEndTime}:00`;

    const hasOverlap = hoursList.some(h => 
      h.day_of_week === day && 
      ((formattedStart >= h.start_time && formattedStart < h.end_time) ||
       (formattedEnd > h.start_time && formattedEnd <= h.end_time) ||
       (formattedStart <= h.start_time && formattedEnd >= h.end_time))
    );

    if (hasOverlap) {
      alert('El rango horario se superpone con uno existente para este día.');
      return;
    }

    const newShift: ServiceHour = {
      service_id: selectedHoursService!.id,
      day_of_week: day,
      start_time: formattedStart,
      end_time: formattedEnd
    };

    setHoursList([...hoursList, newShift]);
  };

  const deleteShift = (indexToDelete: number) => {
    setHoursList(hoursList.filter((_, idx) => idx !== indexToDelete));
  };

  const copyShiftsToWeekdays = () => {
    if (!selectedHoursService) return;
    const currentDayShifts = hoursList.filter(h => h.day_of_week === selectedDayTab);
    if (currentDayShifts.length === 0) {
      showConfirm({
        title: 'Copiar Horarios',
        message: 'No hay horarios definidos para este día. Esto eliminará los horarios de los demás días hábiles. ¿Continuar?',
        confirmText: 'Continuar',
        variant: 'warning',
        onConfirm: () => {
          performCopyShiftsToWeekdays();
        }
      });
      return;
    }
    performCopyShiftsToWeekdays();
  };

  const performCopyShiftsToWeekdays = () => {
    if (!selectedHoursService) return;
    const currentDayShifts = hoursList.filter(h => h.day_of_week === selectedDayTab);
    const weekdays = [1, 2, 3, 4, 5];
    let newList = hoursList.filter(h => !weekdays.includes(h.day_of_week));

    weekdays.forEach(day => {
      currentDayShifts.forEach(shift => {
        newList.push({
          service_id: selectedHoursService.id,
          day_of_week: day,
          start_time: shift.start_time,
          end_time: shift.end_time
        });
      });
    });

    setHoursList(newList);
  };

  const copyShiftsToAllDays = () => {
    if (!selectedHoursService) return;
    const currentDayShifts = hoursList.filter(h => h.day_of_week === selectedDayTab);
    if (currentDayShifts.length === 0) {
      showConfirm({
        title: 'Copiar Horarios',
        message: 'No hay horarios definidos para este día. Esto eliminará los horarios de todos los demás días. ¿Continuar?',
        confirmText: 'Continuar',
        variant: 'warning',
        onConfirm: () => {
          performCopyShiftsToAllDays();
        }
      });
      return;
    }
    performCopyShiftsToAllDays();
  };

  const performCopyShiftsToAllDays = () => {
    if (!selectedHoursService) return;
    const currentDayShifts = hoursList.filter(h => h.day_of_week === selectedDayTab);
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    let newList: ServiceHour[] = [];

    allDays.forEach(day => {
      currentDayShifts.forEach(shift => {
        newList.push({
          service_id: selectedHoursService.id,
          day_of_week: day,
          start_time: shift.start_time,
          end_time: shift.end_time
        });
      });
    });

    setHoursList(newList);
  };

  const handleHoursSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHoursService) return;

    setLoadingHours(true);
    setHoursError('');
    try {
      const { error: delError } = await supabase
        .from('service_hours')
        .delete()
        .eq('service_id', selectedHoursService.id);
      
      if (delError) throw delError;

      if (hoursList.length > 0) {
        const insertPayload = hoursList.map(h => ({
          service_id: selectedHoursService.id,
          day_of_week: h.day_of_week,
          start_time: h.start_time,
          end_time: h.end_time
        }));

        const { error: insError } = await supabase
          .from('service_hours')
          .insert(insertPayload);
        
        if (insError) throw insError;
      }

      setIsHoursModalOpen(false);
      alert('Horarios de disponibilidad actualizados correctamente.');
    } catch (err: any) {
      console.error(err);
      setHoursError('Error al guardar los horarios. Por favor, intente nuevamente.');
    } finally {
      setLoadingHours(false);
    }
  };

  // 1. Load active data
  const loadData = async () => {
    setLoading(true);
    const { data: catData } = await supabase.from('categories').select('*');
    const { data: servData } = await supabase.from('services').select('*');
    
    if (catData) setCategories(catData);
    if (servData) setServices(servData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Set form when editing service
  const startEditService = (service: Service) => {
    setEditingService(service);
    setSCategoryId(service.category_id);
    setSName(service.name);
    setSDescription(service.description);
    setSDuration(service.estimated_duration_minutes);
    setSActive(service.active);
    setSEnabledMon(service.enabled_monday);
    setSEnabledTue(service.enabled_tuesday);
    setSEnabledWed(service.enabled_wednesday);
    setSEnabledThu(service.enabled_thursday);
    setSEnabledFri(service.enabled_friday);
    setSEnabledSat(service.enabled_saturday);
    setSEnabledSun(service.enabled_sunday);
    setSMaxConcurrent(service.max_concurrent_bookings);
    setSRequiresDeposit(service.requires_deposit);
    setSDepositAmount(service.deposit_amount);
    setSPrice(service.price || 0);
    setSAllowReschedule(service.allow_reschedule);
    setSRescheduleLimit(service.reschedule_limit_hours);
    setIsServiceModalOpen(true);
  };

  const startCreateService = () => {
    setEditingService(null);
    if (categories.length > 0) setSCategoryId(categories[0].id);
    setSName('');
    setSDescription('');
    setSDuration(60);
    setSActive(true);
    setSEnabledMon(true);
    setSEnabledTue(true);
    setSEnabledWed(true);
    setSEnabledThu(true);
    setSEnabledFri(true);
    setSEnabledSat(true);
    setSEnabledSun(false);
    setSMaxConcurrent(1);
    setSRequiresDeposit(false);
    setSDepositAmount(0);
    setSPrice(0);
    setSAllowReschedule(true);
    setSRescheduleLimit(12);
    setIsServiceModalOpen(true);
  };

  // Service submit handler
  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName || !sCategoryId) return;

    const payload = {
      category_id: sCategoryId,
      name: sName,
      description: sDescription,
      estimated_duration_minutes: Number(sDuration),
      active: sActive,
      enabled_monday: sEnabledMon,
      enabled_tuesday: sEnabledTue,
      enabled_wednesday: sEnabledWed,
      enabled_thursday: sEnabledThu,
      enabled_friday: sEnabledFri,
      enabled_saturday: sEnabledSat,
      enabled_sunday: sEnabledSun,
      max_concurrent_bookings: Number(sMaxConcurrent),
      requires_deposit: sRequiresDeposit,
      deposit_amount: Number(sRequiresDeposit ? sDepositAmount : 0),
      price: Number(sPrice),
      allow_reschedule: sAllowReschedule,
      reschedule_limit_hours: Number(sRescheduleLimit)
    };

    try {
      if (editingService) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingService.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(payload);
        if (error) throw error;
      }
      setIsServiceModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el servicio.');
    }
  };

  // Category Edit/Create start
  const startEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCName(category.name);
    setCDescription(category.description);
    setCActive(category.active);
    setIsCategoryModalOpen(true);
  };

  const startCreateCategory = () => {
    setEditingCategory(null);
    setCName('');
    setCDescription('');
    setCActive(true);
    setIsCategoryModalOpen(true);
  };

  // Category submit handler
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName) return;

    const payload = {
      name: cName,
      description: cDescription,
      active: cActive
    };

    try {
      if (editingCategory) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert(payload);
        if (error) throw error;
      }
      setIsCategoryModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la categoría.');
    }
  };

  // Delete handlers
  const deleteService = (id: string) => {
    showConfirm({
      title: 'Eliminar Servicio',
      message: '¿Seguro que deseas eliminar este servicio? Se borrarán sus turnos históricos si no tiene reservas activas.',
      confirmText: 'Eliminar',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('services').delete().eq('id', id);
        if (error) {
          console.error(error);
          setTimeout(() => {
            showConfirm({
              title: 'No se puede eliminar',
              message: 'No se puede eliminar el servicio porque tiene turnos asociados. Puedes desactivarlo en su lugar para ocultarlo de los clientes.',
              confirmText: 'Entendido',
              variant: 'warning',
              showCancel: false,
              onConfirm: () => {}
            });
          }, 100);
        } else {
          await loadData();
        }
      }
    });
  };

  const deleteCategory = (id: string) => {
    showConfirm({
      title: 'Eliminar Categoría',
      message: '¿Seguro que deseas eliminar esta categoría? Se borrarán todos los servicios agrupados en ella si no tienen reservas activas.',
      confirmText: 'Eliminar',
      variant: 'danger',
      onConfirm: async () => {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) {
          console.error(error);
          setTimeout(() => {
            showConfirm({
              title: 'No se puede eliminar',
              message: 'No se puede eliminar la categoría porque contiene servicios que tienen turnos asociados. Puedes desactivar la categoría en su lugar para ocultarla de los clientes.',
              confirmText: 'Entendido',
              variant: 'warning',
              showCancel: false,
              onConfirm: () => {}
            });
          }, 100);
        } else {
          await loadData();
        }
      }
    });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-offblack m-0">Gestión del Catálogo</h2>
          <p className="text-gray-400 text-sm font-semibold mt-1">Configurar servicios, horarios, precios, capacidades y reprogramaciones</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Services / Categories Switcher */}
          <div className="flex border border-neutral-200 p-1 bg-neutral-50 rounded-xl">
            {(['services', 'categories'] as const).map(v => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`py-1.5 px-3.5 text-xs font-bold uppercase rounded-lg cursor-pointer transition-all ${
                  tab === v ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-offblack hover:bg-neutral-200/50'
                }`}
              >
                {v === 'services' ? 'Servicios' : 'Categorías'}
              </button>
            ))}
          </div>

          <Button 
            variant="primary" 
            onClick={tab === 'services' ? startCreateService : startCreateCategory}
            className="flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl"
          >
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando datos...</div>
      ) : tab === 'services' ? (
        /* SERVICES VIEW GROUPED BY CATEGORY */
        <div className="space-y-8">
          {services.length === 0 ? (
            <div className="p-12 bg-white border border-dashed border-neutral-200 text-center text-gray-400 font-bold rounded-2xl">
              No hay servicios configurados aún. ¡Crea el primero!
            </div>
          ) : (
            categories.map(cat => {
              const catServices = services.filter(s => s.category_id === cat.id);
              if (catServices.length === 0) return null;
              return (
                <div key={cat.id} className="space-y-4 text-left">
                  <h3 className="text-base font-extrabold text-offblack border-b border-neutral-100 pb-2 uppercase tracking-wider">
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {catServices.map(s => (
                      <Card key={s.id} className={`flex flex-col justify-between border shadow-sm ${s.active ? 'border-neutral-100' : 'border-neutral-200 opacity-60'}`}>
                        <div>
                          <CardHeader className="flex justify-between items-center pb-2">
                            <div>
                              <span className="bg-secondary/10 text-secondary text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                                {cat.name}
                              </span>
                              <CardTitle className="text-lg mt-1">{s.name}</CardTitle>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" onClick={() => startEditHours(s)} title="Configurar Horarios" className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg">
                                <Clock className="h-4 w-4 text-secondary" />
                              </Button>
                              <Button variant="ghost" onClick={() => startEditService(s)} className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg">
                                <Edit2 className="h-4 w-4 text-offblack" />
                              </Button>
                              <Button variant="ghost" onClick={() => deleteService(s.id)} className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg">
                                <Trash2 className="h-4 w-4 text-danger" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 mt-2">
                            <p className="text-sm text-gray-500 line-clamp-2">{s.description || 'Sin descripción'}</p>
                            
                            <div className="text-[11px] font-bold text-gray-500 grid grid-cols-2 gap-y-1.5 pt-3 border-t border-dashed border-neutral-100">
                              <span>Duración: {s.estimated_duration_minutes} min</span>
                              <span>Precio Total: ${formatCurrency(s.price || 0)}</span>
                              <span>Capacidad: {s.max_concurrent_bookings} max</span>
                              <span>Seña: {s.requires_deposit ? `$${formatCurrency(s.deposit_amount)}` : 'No requiere'}</span>
                              <span>Reprogramar: {s.allow_reschedule ? `${s.reschedule_limit_hours} hs límite` : 'No permitido'}</span>
                            </div>

                            {/* Weekday indicator list */}
                            <div className="flex gap-1 pt-2">
                              {[
                                { l: 'L', active: s.enabled_monday },
                                { l: 'M', active: s.enabled_tuesday },
                                { l: 'M', active: s.enabled_wednesday },
                                { l: 'J', active: s.enabled_thursday },
                                { l: 'V', active: s.enabled_friday },
                                { l: 'S', active: s.enabled_saturday },
                                { l: 'D', active: s.enabled_sunday }
                              ].map((day, idx) => (
                                <span 
                                  key={idx} 
                                  className={`w-5.5 h-5.5 text-[9px] font-bold flex items-center justify-center rounded-full border ${
                                    day.active ? 'bg-primary text-white border-transparent' : 'bg-neutral-50 text-gray-300 border-neutral-100'
                                  }`}
                                >
                                  {day.l}
                                </span>
                              ))}
                            </div>
                          </CardContent>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* CATEGORIES VIEW */
        <div className="space-y-4">
          {categories.length === 0 ? (
            <div className="p-12 bg-white border border-dashed border-neutral-200 text-center text-gray-400 font-bold rounded-2xl">
              No hay categorías configuradas aún.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map(c => (
                <Card key={c.id} className={`flex flex-col justify-between border shadow-sm ${c.active ? 'border-neutral-100' : 'border-neutral-200 opacity-60'}`}>
                  <div>
                    <CardHeader className="flex justify-between items-center pb-2">
                      <CardTitle className="text-lg">{c.name}</CardTitle>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => startEditCategory(c)} className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg">
                          <Edit2 className="h-4 w-4 text-offblack" />
                        </Button>
                        <Button variant="ghost" onClick={() => deleteCategory(c.id)} className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg">
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-2">
                      <p className="text-sm text-gray-500">{c.description || 'Sin descripción'}</p>
                      <div className="mt-4 text-xs font-bold flex items-center gap-1.5">
                        {c.active ? (
                          <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Categoría Activa</span>
                        ) : (
                          <span className="text-gray-400 flex items-center gap-1"><XCircle className="h-4 w-4" /> Deshabilitada</span>
                        )}
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SERVICE MODAL */}
      <Modal
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
        title={editingService ? 'Editar Servicio' : 'Crear Nuevo Servicio'}
        size="lg"
      >
        <form onSubmit={handleServiceSubmit} className="space-y-6 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* COLUMN 1: BASIC INFORMATION */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                <Info className="h-4 w-4" /> Información Básica
              </h4>
              
              <Input
                label="Nombre del Servicio"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                placeholder="Ej. Baño Standard"
                required
              />

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-bold text-offblack">Categoría</label>
                <select
                  value={sCategoryId}
                  onChange={(e) => setSCategoryId(e.target.value)}
                  className="border border-neutral-200 p-2.5 rounded-lg w-full bg-white text-sm font-semibold focus:outline-none focus:border-primary"
                  required
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-sm font-bold text-offblack">Descripción</label>
                <textarea
                  value={sDescription}
                  onChange={(e) => setSDescription(e.target.value)}
                  placeholder="Detalles sobre el servicio..."
                  className="border border-neutral-200 p-2.5 rounded-lg w-full h-24 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* General Status Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-200/60">
                <div>
                  <span className="text-sm font-bold text-offblack block">Servicio Activo</span>
                  <span className="text-xs text-gray-400">Determina si los clientes pueden reservar</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSActive(!sActive)}
                  className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    sActive ? 'bg-success' : 'bg-neutral-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      sActive ? 'translate-x-5.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* COLUMN 2: PARAMETERS & POLICIES */}
            <div className="space-y-6">
              {/* Numeric parameters */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4" /> Parámetros y Costo
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="Duración (Min)"
                    type="number"
                    value={sDuration}
                    onChange={(e) => setSDuration(Number(e.target.value))}
                    min={5}
                    max={300}
                    required
                  />
                  <Input
                    label="Precio ($)"
                    type="number"
                    value={sPrice}
                    onChange={(e) => setSPrice(Number(e.target.value))}
                    min={0}
                    required
                  />
                  <Input
                    label="Simultáneos"
                    type="number"
                    value={sMaxConcurrent}
                    onChange={(e) => setSMaxConcurrent(Number(e.target.value))}
                    min={1}
                    required
                  />
                </div>
              </div>

              {/* Days of availability */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" /> Días Habilitados
                </h4>
                <div className="flex flex-wrap gap-1.5 justify-start">
                  {[
                    { label: 'L', val: sEnabledMon, setter: setSEnabledMon, full: 'Lunes' },
                    { label: 'M', val: sEnabledTue, setter: setSEnabledTue, full: 'Martes' },
                    { label: 'M', val: sEnabledWed, setter: setSEnabledWed, full: 'Miércoles' },
                    { label: 'J', val: sEnabledThu, setter: setSEnabledThu, full: 'Jueves' },
                    { label: 'V', val: sEnabledFri, setter: setSEnabledFri, full: 'Viernes' },
                    { label: 'S', val: sEnabledSat, setter: setSEnabledSat, full: 'Sábado' },
                    { label: 'D', val: sEnabledSun, setter: setSEnabledSun, full: 'Domingo' }
                  ].map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => day.setter(!day.val)}
                      title={day.full}
                      className={`w-8 h-8 text-xs font-bold flex items-center justify-center rounded-full border transition-all cursor-pointer hover:scale-[1.04] active:scale-[0.96] ${
                        day.val 
                          ? 'bg-primary text-white border-transparent shadow-sm' 
                          : 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Policies */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                  <Shield className="h-4 w-4" /> Políticas de Reserva
                </h4>
                
                {/* Deposit setting */}
                <div className="bg-amber-50/20 border border-warning/10 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-offblack block">Requiere Seña</span>
                      <span className="text-[10px] text-gray-400">Solicita abono parcial por Mercado Pago</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSRequiresDeposit(!sRequiresDeposit)}
                      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        sRequiresDeposit ? 'bg-primary' : 'bg-neutral-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          sRequiresDeposit ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {sRequiresDeposit && (
                    <div className="pt-1">
                      <Input
                        label="Monto de la Seña ($ ARS)"
                        type="number"
                        value={sDepositAmount}
                        onChange={(e) => setSDepositAmount(Number(e.target.value))}
                        min={1}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Rescheduling setting */}
                <div className="bg-secondary/5 border border-secondary/10 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-offblack block">Permitir Reprogramación</span>
                      <span className="text-[10px] text-gray-400">Permite al cliente reagendar su turno</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSAllowReschedule(!sAllowReschedule)}
                      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        sAllowReschedule ? 'bg-secondary' : 'bg-neutral-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          sAllowReschedule ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {sAllowReschedule && (
                    <div className="pt-1">
                      <Input
                        label="Límite de anticipación (Horas antes)"
                        type="number"
                        value={sRescheduleLimit}
                        onChange={(e) => setSRescheduleLimit(Number(e.target.value))}
                        min={1}
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={() => setIsServiceModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Guardar Servicio
            </Button>
          </div>
        </form>
      </Modal>

      {/* SERVICE HOURS CONFIGURATION MODAL */}
      <Modal
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        title={selectedHoursService ? `Configurar disponibilidad - ${selectedHoursService.name}` : 'Configurar Horarios'}
        size="lg"
      >
        {hoursError && (
          <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger mb-4">
            {hoursError}
          </div>
        )}

        {loadingHours ? (
          <div className="text-center py-6 text-sm font-bold text-gray-400">Cargando horarios...</div>
        ) : (
          <form onSubmit={handleHoursSubmit} className="space-y-4">
            <p className="text-xs text-gray-500 font-semibold mb-2">
              Define los rangos horarios habilitados para cada día de la semana. Los días sin rangos usarán el horario estándar.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Day Selection & Current Shifts */}
              <div className="space-y-4 border-r border-neutral-100 pr-0 md:pr-6">
                <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" /> Días y Horarios Activos
                </h4>
                
                {/* Days of the week tabs */}
                <div className="grid grid-cols-7 gap-1 pb-1">
                  {DAYS_OF_WEEK.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setSelectedDayTab(d.value)}
                      className={`py-2 text-[10px] md:text-xs font-bold text-center rounded-lg border transition-all cursor-pointer ${
                        selectedDayTab === d.value
                          ? 'bg-primary text-white border-transparent shadow-sm'
                          : 'bg-white text-offblack border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {d.name.substring(0, 3)}
                    </button>
                  ))}
                </div>

                {/* Current day shifts listing */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-offblack text-left">
                    Horarios habilitados para el día {DAYS_OF_WEEK.find(d => d.value === selectedDayTab)?.name}:
                  </h3>

                  {hoursList.filter(h => h.day_of_week === selectedDayTab).length === 0 ? (
                    <p className="text-xs text-gray-400 font-semibold italic bg-neutral-50 p-4 border border-dashed border-neutral-200 rounded-xl text-center">
                      Sin horarios específicos. (Por defecto: 09:00 a 13:00 y 16:00 a 20:00).
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {hoursList.map((h, idx) => {
                        if (h.day_of_week !== selectedDayTab) return null;
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white border border-neutral-200 p-2.5 rounded-xl shadow-sm">
                            <span className="text-sm font-bold text-offblack">
                              {h.start_time.substring(0, 5)} hs a {h.end_time.substring(0, 5)} hs
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => deleteShift(idx)}
                              className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Add New Shift & Copy utilities */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-secondary tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Acciones y Copias
                </h4>

                {/* Form to add a new shift to the current day */}
                <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold uppercase text-offblack tracking-wider text-left">Agregar Rango Horario</h4>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 text-left">
                      <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Hora Inicio</label>
                      <input
                        type="time"
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full border border-neutral-200 p-2 rounded-lg text-sm bg-white font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Hora Fin</label>
                      <input
                        type="time"
                        value={newEndTime}
                        onChange={(e) => setNewEndTime(e.target.value)}
                        className="w-full border border-neutral-200 p-2 rounded-lg text-sm bg-white font-semibold focus:outline-none focus:border-primary"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addShift(selectedDayTab)}
                      className="py-2.5 px-3 rounded-lg flex items-center justify-center cursor-pointer hover:bg-neutral-100"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Utility buttons for copying */}
                <div className="space-y-2.5 pt-1">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Copiar configuración</span>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={copyShiftsToWeekdays}
                      className="text-xs font-bold py-2.5 px-3 border border-neutral-200 bg-white text-offblack rounded-lg cursor-pointer hover:bg-neutral-50 hover:border-neutral-300 transition-all text-left flex items-center gap-2"
                    >
                      📅 Copiar a Lunes-Viernes
                    </button>
                    <button
                      type="button"
                      onClick={copyShiftsToAllDays}
                      className="text-xs font-bold py-2.5 px-3 border border-neutral-200 bg-white text-offblack rounded-lg cursor-pointer hover:bg-neutral-50 hover:border-neutral-300 transition-all text-left flex items-center gap-2"
                    >
                      🔁 Copiar a Todos los Días
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
              <Button type="button" variant="ghost" onClick={() => setIsHoursModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={loadingHours}>
                Guardar Horarios
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* CATEGORY MODAL */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title={editingCategory ? 'Editar Categoría' : 'Crear Nueva Categoría'}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4">
          <Input
            label="Nombre de la Categoría"
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Ej. Baño, Peluquería, etc."
            required
          />

          <div className="flex flex-col gap-1.5 w-full text-left">
            <label className="text-sm font-bold text-offblack">Descripción</label>
            <textarea
              value={cDescription}
              onChange={(e) => setCDescription(e.target.value)}
              placeholder="Descripción corta..."
              className="border border-neutral-200 p-2.5 rounded-lg w-full h-24 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 text-left">
            <input
              id="category-active-check"
              type="checkbox"
              checked={cActive}
              onChange={(e) => setCActive(e.target.checked)}
              className="w-4 h-4 border border-neutral-300 rounded"
            />
            <label htmlFor="category-active-check" className="text-sm font-bold text-offblack cursor-pointer">
              Categoría Activa
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
            <Button type="button" variant="ghost" onClick={() => setIsCategoryModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Guardar Categoría
            </Button>
          </div>
        </form>
      </Modal>

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
