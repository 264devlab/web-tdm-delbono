import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, isMockMode } from './utils/supabase';
import { BookingLanding } from './features/bookings/BookingLanding';
import { BookingStatus } from './features/bookings/BookingStatus';
import { AdminDashboard } from './features/dashboard/AdminDashboard';
import { AdminCalendar } from './features/calendar/AdminCalendar';
import { ServicesManager } from './features/services/ServicesManager';
import { ClientsManager } from './features/clients/ClientsManager';
import { ReportsManager } from './features/reports/ReportsManager';
import { SettingsManager } from './features/settings/SettingsManager';
import { Input } from './components/ui/Input';
import { Button } from './components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/Card';
import { 
  Bone, LayoutDashboard, Calendar, Briefcase, Users, BarChart2, 
  Settings, LogOut, X, Mail, MessageSquare, ShieldAlert,
  Menu
} from 'lucide-react';

// Interface for simulated notification toast alerts
interface SimulatedToast {
  id: string;
  channel: 'email' | 'whatsapp';
  type: string;
  recipient: string;
  subject: string;
  body: string;
}

// -------------------------------------------------------------
// ADMIN LAYOUT WRAPPER (Responsive Lateral Sidebar)
// -------------------------------------------------------------
const AdminLayout: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [loadingAuth, setLoadingAuth] = useState<boolean>(false);
  
  // Responsive sidebar open/close state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Si no está en modo simulación (isMockMode === false), limpiamos la sesión local simulada
    if (!isMockMode) {
      localStorage.removeItem('tdm_delbono_session');
    }

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session) {
        setSession(session);
        setCheckingAuth(false);
      } else {
        const localSession = isMockMode ? localStorage.getItem('tdm_delbono_session') : null;
        setSession(localSession ? JSON.parse(localSession) : null);
        setCheckingAuth(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session) {
        setSession(session);
      } else if (!isMockMode) {
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Make sidebar responsive on mount/resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize(); // Initial call
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoadingAuth(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Fallback local por defecto solo si la app está corriendo sin credenciales de Supabase en producción
        if (isMockMode && email === 'admin@delbono.com' && password === 'admin123') {
          const mockSession = {
            user: { id: 'admin-uuid', email: 'admin@delbono.com' },
            access_token: 'mock-token-123'
          };
          localStorage.setItem('tdm_delbono_session', JSON.stringify(mockSession));
          setSession(mockSession);
          setAuthError('');
        } else {
          setAuthError(error.message);
        }
      } else if (data && data.session) {
        setSession(data.session);
        localStorage.removeItem('tdm_delbono_session');
      }
    } catch (err) {
      console.error(err);
      setAuthError('Ocurrió un error inesperado al intentar ingresar.');
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('tdm_delbono_session');
    setSession(null);
    navigate('/admin');
  };

  if (checkingAuth) {
    return <div className="text-center py-20 font-bold text-lg text-gray-500">Verificando sesión...</div>;
  }

  // 1. Render Login Screen if not authenticated
  if (!session) {
    return (
      <div className="min-h-[70dvh] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border border-neutral-100 rounded-2xl shadow-xl shadow-amber-950/5">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <div className="bg-primary/10 text-primary p-3 rounded-xl">
                <Bone className="h-8 w-8 animate-pulse" />
              </div>
            </div>
            <CardTitle className="text-2xl mt-2 text-offblack">Acceso Administrativo</CardTitle>
            <p className="text-sm text-gray-400 font-semibold">Control de Tienda de Mascotas Del Bono</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger">
                  {authError}
                </div>
              )}

              <Input
                label="Email del Administrador"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                required
              />

              <Input
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />

              {isMockMode && (
                <div className="bg-secondary/5 border border-secondary/15 p-4 rounded-xl text-xs font-bold text-secondary text-left space-y-1.5">
                  <p className="flex items-center gap-1.5 text-secondary"><ShieldAlert className="h-4 w-4" /> Entorno de Simulación Activado</p>
                  <p className="text-gray-500">Credenciales de prueba pre-cargadas:</p>
                  <p className="font-mono bg-white/70 p-2 rounded-lg border border-neutral-200/50">Email: admin@delbono.com<br />Contraseña: admin123</p>
                </div>
              )}

              <Button type="submit" variant="primary" isLoading={loadingAuth} className="w-full mt-2 py-2.5">
                Ingresar al Sistema
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Navigation Items
  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/calendar', label: 'Calendario', icon: Calendar },
    { path: '/admin/services', label: 'Servicios', icon: Briefcase },
    { path: '/admin/clients', label: 'Clientes', icon: Users },
    { path: '/admin/reports', label: 'Reportes', icon: BarChart2 },
    { path: '/admin/settings', label: 'Configuración', icon: Settings },
  ];

  const activeItem = navItems.find(item => location.pathname === item.path) || navItems[0];

  return (
    <div className="min-h-[80vh] flex flex-col md:flex-row relative">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-neutral-900/30 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside 
        className={`fixed md:sticky top-0 left-0 h-screen md:h-[85vh] bg-white border-r border-neutral-100 shadow-sm z-40 transition-all duration-300 overflow-y-auto flex flex-col justify-between shrink-0 ${
          sidebarOpen ? 'w-64 translate-x-0 opacity-100' : 'w-0 -translate-x-full md:translate-x-0 pointer-events-none opacity-0 border-r-0 md:w-0'
        }`}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-secondary/10 text-secondary p-2 rounded-xl">
                <Bone className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-extrabold text-offblack m-0">Panel Control</h2>
                <p className="text-[10px] text-gray-400 font-bold m-0 uppercase">Mascotas Del Bono</p>
              </div>
            </div>
            
            {/* Mobile close button */}
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="p-1 text-gray-400 hover:bg-neutral-50 rounded-lg md:hidden cursor-pointer border-none bg-transparent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-1 text-left">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition-all no-underline ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-offblack hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-neutral-100">
          <Button
            variant="secondary"
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 text-xs py-2 px-4 border-danger/25 text-danger hover:bg-danger/5 hover:border-danger rounded-xl w-full"
          >
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* Upper header */}
        <header className="bg-white border-b border-neutral-100 p-4 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-offblack hover:bg-neutral-50 rounded-xl cursor-pointer border-none bg-transparent"
              title="Toggle Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base font-extrabold text-offblack capitalize m-0">
              {activeItem.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200/50 py-1 px-3 rounded-xl">
            <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-gray-500">{session.user?.email || 'admin@delbono.com'}</span>
          </div>
        </header>

        {/* Content Body */}
        <main className="p-6 flex-1 bg-neutral-50/30">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="calendar" element={<AdminCalendar />} />
            <Route path="services" element={<ServicesManager />} />
            <Route path="clients" element={<ClientsManager />} />
            <Route path="reports" element={<ReportsManager />} />
            <Route path="settings" element={<SettingsManager />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// MAIN APP COMPONENT
// -------------------------------------------------------------
export default function App() {
  const [toasts, setToasts] = useState<SimulatedToast[]>([]);

  // Listen to simulated notification events
  useEffect(() => {
    const handleNotification = (e: Event) => {
      const customEvent = e as CustomEvent<SimulatedToast>;
      const newToast = {
        ...customEvent.detail,
        id: Math.random().toString(36).substring(2, 9)
      };

      setToasts(prev => [...prev, newToast]);

      // Automatically remove after 10 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 10000);
    };

    window.addEventListener('simulated_notification', handleNotification);
    return () => window.removeEventListener('simulated_notification', handleNotification);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleLogoClick = () => {
    if (window.location.pathname === '/') {
      window.dispatchEvent(new Event('reset_booking_flow'));
    }
  };

  return (
    <BrowserRouter>
      <div className="min-h-dvh flex flex-col font-sans bg-flatbg">
        {/* Navigation Navbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-neutral-100 sticky top-0 z-[100] py-4 px-6 shadow-sm shadow-amber-950/[0.01]">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2.5 text-offblack no-underline">
              <div className="bg-primary text-white p-2 rounded-lg rotate-[-4deg] shadow-sm">
                <Bone className="h-5.5 w-5.5" />
              </div>
              <div className="text-left">
                <span className="font-extrabold text-lg tracking-tight block">Del Bono</span>
                <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mt-[-3px]">Tienda de Mascotas</span>
              </div>
            </Link>

            <div className="flex gap-4">
              <Link 
                to="/" 
                onClick={handleLogoClick}
                className="font-bold text-sm text-offblack no-underline hover:text-primary transition-colors py-2"
              >
                Reservar Turno
              </Link>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 w-full max-w-6xl mx-auto py-8 px-6">
          <Routes>
            <Route path="/" element={<BookingLanding />} />
            <Route path="/turno/:id" element={<BookingStatus />} />
            <Route path="/admin/*" element={<AdminLayout />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-neutral-100 bg-white py-8 px-6 text-center text-xs font-semibold text-gray-400">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="m-0">© 2026 Tienda de Mascotas Del Bono. Todos los derechos reservados.</p>
            <div className="flex gap-4 flex-wrap justify-center items-center">
              <span>Av. Del Bono 123, San Juan</span>
              <span>•</span>
              <span>+54 264 4567890</span>
              <span>•</span>
              <Link 
                to="/admin" 
                className="text-gray-400 hover:text-primary transition-colors no-underline font-bold"
              >
                Acceso Administrativo
              </Link>
            </div>
          </div>
        </footer>

        {/* FLOATING NOTIFICATION SIMULATION LOG DRAWER */}
        <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div 
              key={t.id}
              className={`pointer-events-auto bg-white border-2 border-offblack p-4 rounded-[2px] shadow-none flex flex-col gap-2 relative animate-in slide-in-from-bottom-5 duration-200`}
            >
              <button 
                onClick={() => removeToast(t.id)}
                className="absolute top-2 right-2 text-gray-500 hover:text-offblack cursor-pointer bg-transparent border-none"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="flex items-center gap-2 border-b border-gray-100 pb-1.5">
                {t.channel === 'whatsapp' ? (
                  <span className="bg-success text-white p-1 flat-border rounded-[1px] flex items-center justify-center">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="bg-secondary text-white p-1 flat-border rounded-[1px] flex items-center justify-center">
                    <Mail className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="text-[10px] font-extrabold uppercase text-gray-400">
                  Notificación Simulación ({t.channel === 'whatsapp' ? 'WhatsApp' : 'Email'})
                </span>
              </div>

              <div className="text-xs text-left">
                <p className="font-bold text-offblack mb-1">Destinatario: <span className="font-mono text-[10px]">{t.recipient}</span></p>
                {t.channel === 'email' && (
                  <p className="font-bold text-offblack mb-1.5">Asunto: <span className="italic">{t.subject}</span></p>
                )}
                <pre className="bg-flatbg border border-gray-200 p-2 font-mono text-[10px] whitespace-pre-wrap rounded-[1px] max-h-32 overflow-y-auto m-0 text-gray-700">
                  {t.body}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserRouter>
  );
}
