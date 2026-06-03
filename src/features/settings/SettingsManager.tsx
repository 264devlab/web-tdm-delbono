import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2, Calendar, Globe, Save, MessageCircle, Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

// URL del servidor WhatsApp backend (Express + Baileys)
const WA_SERVER_URL = (import.meta.env.VITE_WA_SERVER_URL as string) || 'http://localhost:3001';

interface HolidayBlock {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export const SettingsManager: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [settingsId, setSettingsId] = useState<string>('');
  
  // Business fields
  const [businessName, setBusinessName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [facebook, setFacebook] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');

  // Holidays list
  const [blocks, setBlocks] = useState<HolidayBlock[]>([]);
  
  // New block form
  const [blockDate, setBlockDate] = useState<string>('');
  const [blockReason, setBlockReason] = useState<string>('');
  const [blockFullDay, setBlockFullDay] = useState<boolean>(true);
  const [blockStartTime, setBlockStartTime] = useState<string>('');
  const [blockEndTime, setBlockEndTime] = useState<string>('');

  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [savingBlock, setSavingBlock] = useState<boolean>(false);

  // WhatsApp connection state
  type WAStatus = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected' | 'unreachable';
  const [waStatus, setWaStatus] = useState<WAStatus>('disconnected');
  const [waQR, setWaQR] = useState<string | null>(null);
  const [waDisconnecting, setWaDisconnecting] = useState<boolean>(false);
  const [waReconnecting, setWaReconnecting] = useState<boolean>(false);
  const waPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWaStatus = async () => {
    try {
      const res = await fetch(`${WA_SERVER_URL}/api/wa/status`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      setWaStatus(data.status as WAStatus);
      setWaQR(data.qr || null);
    } catch {
      setWaStatus('unreachable');
      setWaQR(null);
    }
  };

  // Poll every 3 seconds
  useEffect(() => {
    fetchWaStatus();
    waPollingRef.current = setInterval(fetchWaStatus, 3000);
    return () => {
      if (waPollingRef.current) clearInterval(waPollingRef.current);
    };
  }, []);

  const handleWaDisconnect = async () => {
    if (!confirm('¿Seguro que deseas desconectar WhatsApp? Necesitarás escanear el QR nuevamente.')) return;
    setWaDisconnecting(true);
    try {
      await fetch(`${WA_SERVER_URL}/api/wa/disconnect`, { method: 'POST' });
      await fetchWaStatus();
    } catch {
      alert('Error al desconectar. Asegurate de que el servidor WA esté corriendo.');
    } finally {
      setWaDisconnecting(false);
    }
  };

  const handleWaReconnect = async () => {
    setWaReconnecting(true);
    try {
      await fetch(`${WA_SERVER_URL}/api/wa/reconnect`, { method: 'POST' });
      await fetchWaStatus();
    } catch {
      alert('Error al reconectar. Asegurate de que el servidor WA esté corriendo.');
    } finally {
      setWaReconnecting(false);
    }
  };

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: bData } = await supabase.from('business_settings').select('*');
      if (bData && bData.length > 0) {
        const s = bData[0];
        setSettingsId(s.id);
        setBusinessName(s.business_name);
        setAddress(s.address);
        setPhone(s.phone);
        setEmail(s.email);
        setWhatsapp(s.whatsapp);
        setFacebook(s.facebook || '');
        setInstagram(s.instagram || '');
      }

      const { data: blocksData } = await supabase.from('holidays_blocks').select('*');
      if (blocksData) {
        setBlocks(blocksData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    
    const payload = {
      business_name: businessName,
      address,
      phone,
      email,
      whatsapp,
      facebook: facebook || null,
      instagram: instagram || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (settingsId) {
        const { error } = await supabase.from('business_settings').update(payload).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('business_settings').insert(payload);
        if (error) throw error;
      }
      alert('Configuración guardada exitosamente.');
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Add Block
  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockDate || !blockReason) return;
    
    setSavingBlock(true);

    const payload = {
      date: blockDate,
      reason: blockReason,
      start_time: blockFullDay ? null : `${blockStartTime}:00`,
      end_time: blockFullDay ? null : `${blockEndTime}:00`
    };

    try {
      const { error } = await supabase.from('holidays_blocks').insert(payload);
      if (error) throw error;

      // Reset
      setBlockDate('');
      setBlockReason('');
      setBlockFullDay(true);
      setBlockStartTime('');
      setBlockEndTime('');

      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el bloqueo.');
    } finally {
      setSavingBlock(false);
    }
  };

  // Delete Block
  const handleDeleteBlock = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta regla de bloqueo?')) return;
    try {
      await supabase.from('holidays_blocks').delete().eq('id', id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Ajustes del Negocio</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Configuración de marca, datos de contacto y calendario de bloqueos globales</p>
      </div>

      {loading ? (
        <div className="text-center py-10 font-bold text-lg text-gray-400">Cargando configuraciones generales...</div>
      ) : (
        /* ASYMMETRIC GRID: 2 Columns for metadata, 1 Column for Blocks */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Metadata forms */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-neutral-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" /> Datos Públicos y Redes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <Input
                    label="Nombre Comercial"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />

                  <Input
                    label="Dirección Física"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Teléfono Fijo / Central"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <Input
                      label="Celular WhatsApp (Formato internacional)"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+542644567890"
                      required
                    />
                  </div>

                  <Input
                    label="Email Administrativo"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
                    <Input
                      label="Usuario Instagram (Sin @)"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="tdmdelbono"
                    />
                    <Input
                      label="Página Facebook"
                      value={facebook}
                      onChange={(e) => setFacebook(e.target.value)}
                      placeholder="tdmdelbono.oficial"
                    />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" variant="primary" isLoading={savingSettings} className="flex items-center gap-2 py-2.5 px-4 rounded-xl">
                      <Save className="h-4 w-4" /> Guardar Ajustes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* WhatsApp Connection Card */}
          <Card className="border border-neutral-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-success" /> Conexión WhatsApp
                </span>
                <WhatsAppStatusBadge status={waStatus} />
              </CardTitle>
              <p className="text-xs text-gray-400 font-semibold mt-1">
                Vinculá el número de WhatsApp del negocio para enviar notificaciones automáticas a los clientes.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Server unreachable */}
              {waStatus === 'unreachable' && (
                <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl text-sm text-gray-500 font-semibold space-y-3">
                  <p className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-gray-400 shrink-0" />
                    El servidor de WhatsApp no está corriendo. Inicialo desde la terminal:
                  </p>
                  <code className="block bg-offblack text-green-400 text-xs p-3 rounded-lg font-mono">
                    npm run dev:server
                  </code>
                  <Button variant="secondary" onClick={fetchWaStatus} className="w-full text-xs py-2 rounded-lg flex items-center justify-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" /> Reintentar conexión
                  </Button>
                </div>
              )}

              {/* Waiting for QR scan */}
              {waStatus === 'waiting_qr' && (
                <div className="text-center space-y-4">
                  <p className="text-sm font-semibold text-gray-600">
                    Escaneá el QR con WhatsApp en tu celular:
                  </p>
                  {waQR ? (
                    <div className="flex justify-center">
                      <div className="p-3 bg-white border-2 border-neutral-200 rounded-2xl shadow-sm inline-block">
                        <img src={waQR} alt="QR WhatsApp" className="w-52 h-52 rounded-xl" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center h-52 text-gray-400">
                      <RefreshCw className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                  <p className="text-xs text-gray-400 font-semibold">
                    Abrí WhatsApp → Dispositivos vinculados → Vincular un dispositivo
                  </p>
                </div>
              )}

              {/* Connected state */}
              {waStatus === 'connected' && (
                <div className="bg-success/5 border border-success/15 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                      <Wifi className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-offblack">WhatsApp conectado y activo</p>
                      <p className="text-xs text-gray-400 font-semibold">Las notificaciones automáticas están habilitadas</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={handleWaDisconnect}
                    isLoading={waDisconnecting}
                    className="w-full text-xs py-2 rounded-lg border border-danger/20 text-danger hover:bg-danger/5 flex items-center justify-center gap-2"
                  >
                    <WifiOff className="h-3.5 w-3.5" /> Desconectar sesión
                  </Button>
                </div>
              )}

              {/* Disconnected state */}
              {(waStatus === 'disconnected') && (
                <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl space-y-3 text-center">
                  <WifiOff className="h-8 w-8 text-gray-300 mx-auto" />
                  <p className="text-sm font-semibold text-gray-500">Sin sesión activa</p>
                  <Button
                    variant="primary"
                    onClick={handleWaReconnect}
                    isLoading={waReconnecting}
                    className="w-full text-xs py-2.5 rounded-lg flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Iniciar nueva sesión
                  </Button>
                </div>
              )}

              {/* Connecting state */}
              {waStatus === 'connecting' && (
                <div className="text-center py-6 space-y-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm font-semibold text-gray-500">Conectando a WhatsApp...</p>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Blocks and Holidays management */}
          <div className="space-y-6">
            {/* Create Holiday Block */}
            <Card className="border border-neutral-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Calendar className="h-5 w-5 text-secondary" /> Bloquear Horas / Feriados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddBlock} className="space-y-4">
                  <Input
                    label="Fecha de bloqueo"
                    type="date"
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                    required
                  />
                  
                  <Input
                    label="Motivo del cierre"
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Ej. Feriado Nacional, Refacciones"
                    required
                  />

                  <div className="flex items-center gap-2 py-1 text-xs font-bold text-gray-600 text-left">
                    <input
                      id="block-full-day-check"
                      type="checkbox"
                      checked={blockFullDay}
                      onChange={(e) => setBlockFullDay(e.target.checked)}
                      className="w-4 h-4 border border-neutral-300 rounded focus:ring-primary/20"
                    />
                    <label htmlFor="block-full-day-check" className="cursor-pointer text-offblack">
                      Bloquear día completo (24 hs)
                    </label>
                  </div>

                  {!blockFullDay && (
                    <div className="grid grid-cols-2 gap-2 text-left">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Inicio</label>
                        <input
                          type="time"
                          value={blockStartTime}
                          onChange={(e) => setBlockStartTime(e.target.value)}
                          className="border border-neutral-200 p-2.5 text-sm rounded-lg focus:outline-none focus:border-primary bg-white font-semibold"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Fin</label>
                        <input
                          type="time"
                          value={blockEndTime}
                          onChange={(e) => setBlockEndTime(e.target.value)}
                          className="border border-neutral-200 p-2.5 text-sm rounded-lg focus:outline-none focus:border-primary bg-white font-semibold"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <Button type="submit" variant="primary" isLoading={savingBlock} className="w-full text-xs py-2.5 mt-2 rounded-xl">
                    <Plus className="h-4 w-4" /> Agregar Bloqueo
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* List Blocks */}
            <div className="space-y-3 text-left">
              <h4 className="font-extrabold text-sm text-gray-400 uppercase border-b border-neutral-100 pb-2">Reglas de Cierre Activas</h4>
              
              {blocks.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold italic">No hay días de cierre configurados.</p>
              ) : (
                <div className="max-h-[30dvh] overflow-y-auto space-y-2.5 pr-1">
                  {blocks.map(b => (
                    <div key={b.id} className="border border-neutral-100 p-3 bg-white rounded-xl shadow-sm flex items-center justify-between gap-3">
                      <div>
                        <span className="bg-secondary/10 text-secondary border-none px-2 py-0.5 text-[9px] font-bold rounded-full">
                          {b.date}
                        </span>
                        <h5 className="font-bold text-xs text-offblack mt-1.5 m-0">{b.reason}</h5>
                        {!b.start_time ? (
                          <span className="text-[10px] text-gray-400 font-semibold block mt-0.5">Cierre Completo</span>
                        ) : (
                          <span className="text-[10px] text-gray-400 font-semibold block mt-0.5">
                            Franja: {b.start_time.substring(0, 5)} - {b.end_time?.substring(0, 5)} hs
                          </span>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={() => handleDeleteBlock(b.id)}
                        className="p-1.5 min-w-0 border-none hover:bg-neutral-50 rounded-lg"
                        title="Eliminar bloqueo"
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── WhatsApp Status Badge ─────────────────────────────────────────────────────
const WhatsAppStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    connected:    { label: 'Conectado',       cls: 'bg-success/10 text-success border border-success/20',    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    waiting_qr:  { label: 'Esperando QR',    cls: 'bg-amber-100 text-amber-700 border border-amber-200',    icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
    connecting:  { label: 'Conectando...',   cls: 'bg-blue-50 text-blue-600 border border-blue-200',        icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
    disconnected:{ label: 'Desconectado',    cls: 'bg-danger/10 text-danger border border-danger/20',        icon: <WifiOff className="h-3.5 w-3.5" /> },
    unreachable: { label: 'Servidor offline',cls: 'bg-neutral-100 text-gray-500 border border-neutral-200', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const { label, cls, icon } = config[status] ?? config.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
};
