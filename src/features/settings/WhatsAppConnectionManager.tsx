import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { MessageCircle, Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

// URL del servidor WhatsApp backend (Express + Baileys)
const WA_SERVER_URL = (import.meta.env.VITE_WA_SERVER_URL as string) || 'http://localhost:3001';

type WAStatus = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected' | 'unreachable';

export const WhatsAppConnectionManager: React.FC = () => {
  const [waStatus, setWaStatus] = useState<WAStatus>('disconnected');
  const [waQR, setWaQR] = useState<string | null>(null);
  const [waDisconnecting, setWaDisconnecting] = useState<boolean>(false);
  const [waReconnecting, setWaReconnecting] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
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

  const handleWaDisconnect = () => {
    setIsConfirmOpen(true);
  };

  const performWaDisconnect = async () => {
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

  return (
    <div className="space-y-6 text-left">
      {/* Header controls */}
      <div className="border-b border-neutral-100 pb-4">
        <h2 className="text-2xl font-extrabold text-offblack m-0">Conexión de WhatsApp</h2>
        <p className="text-gray-400 text-sm font-semibold mt-1">Vincular y gestionar el servicio de notificaciones en tiempo real</p>
      </div>

      <div className="max-w-2xl">
        <Card className="border border-neutral-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-success" /> Estado de Vinculación
              </span>
              <WhatsAppStatusBadge status={waStatus} />
            </CardTitle>
            <p className="text-xs text-gray-400 font-semibold mt-1">
              Vincula el número de WhatsApp del negocio para enviar notificaciones automáticas de turnos a los clientes de forma inmediata.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Server unreachable */}
            {waStatus === 'unreachable' && (
              <div className="bg-danger/5 border border-danger/10 p-5 rounded-xl text-sm text-danger font-semibold space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Servidor Desconectado</p>
                    <p className="text-xs text-gray-500 font-semibold mt-1">
                      El servidor de WhatsApp se encuentra caído. Por favor, consulte con el soporte técnico.
                    </p>
                  </div>
                </div>
                <Button variant="secondary" onClick={fetchWaStatus} className="w-full text-xs py-2 rounded-lg flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar conexión
                </Button>
              </div>
            )}

            {/* Waiting for QR scan */}
            {waStatus === 'waiting_qr' && (
              <div className="text-center space-y-4 py-4">
                <p className="text-sm font-bold text-offblack">
                  Escanea el código QR con tu aplicación de WhatsApp:
                </p>
                {waQR ? (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white border-2 border-neutral-200 rounded-2xl shadow-sm inline-block">
                      <img src={waQR} alt="QR WhatsApp" className="w-56 h-56 rounded-xl" />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-56 text-gray-400">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  </div>
                )}
                <p className="text-xs text-gray-400 font-semibold">
                  Abre WhatsApp en tu teléfono móvil → Dispositivos vinculados → Vincular un dispositivo
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
                    <p className="text-xs text-gray-400 font-semibold">Las notificaciones de turnos están siendo despachadas automáticamente</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={handleWaDisconnect}
                  isLoading={waDisconnecting}
                  className="w-full text-xs py-2 rounded-lg border border-danger/20 text-danger hover:bg-danger/5 flex items-center justify-center gap-2"
                >
                  <WifiOff className="h-3.5 w-3.5" /> Desconectar sesión de WhatsApp
                </Button>
              </div>
            )}

            {/* Disconnected state */}
            {waStatus === 'disconnected' && (
              <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-xl space-y-3 text-center">
                <WifiOff className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-sm font-bold text-gray-500">Sin sesión activa en el servidor</p>
                <Button
                  variant="primary"
                  onClick={handleWaReconnect}
                  isLoading={waReconnecting}
                  className="w-full text-xs py-2.5 rounded-lg flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Iniciar nueva vinculación
                </Button>
              </div>
            )}

            {/* Connecting state */}
            {waStatus === 'connecting' && (
              <div className="text-center py-8 space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm font-bold text-gray-500">Estableciendo conexión en segundo plano...</p>
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={performWaDisconnect}
        title="Desconectar WhatsApp"
        message="¿Seguro que deseas desconectar WhatsApp? Se detendrán las notificaciones automáticas y necesitarás escanear el código QR nuevamente para reactivar el servicio."
        confirmText="Desconectar"
        variant="danger"
      />
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
    unreachable: { label: 'Offline',         cls: 'bg-neutral-100 text-gray-500 border border-neutral-200', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const { label, cls, icon } = config[status] ?? config.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
};
