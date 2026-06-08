import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './utils/supabase';
import { BookingLanding } from './features/bookings/BookingLanding';
import { BookingStatus } from './features/bookings/BookingStatus';
// import { BookingPaymentConfirm } from './features/bookings/BookingPaymentConfirm';
import { AdminDashboard } from './features/dashboard/AdminDashboard';
import { AdminCalendar } from './features/calendar/AdminCalendar';
import { ServicesManager } from './features/services/ServicesManager';
import { ClientsManager } from './features/clients/ClientsManager';
import { ReportsManager } from './features/reports/ReportsManager';
import { SettingsManager } from './features/settings/SettingsManager';
import { WhatsAppConnectionManager } from './features/settings/WhatsAppConnectionManager';
import { Input } from './components/ui/Input';
import { Button } from './components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/Card';
import {
  LayoutDashboard, Calendar, Briefcase, Users, BarChart2,
  Settings, LogOut, X, Menu, MessageCircle, MapPin, Phone
} from 'lucide-react';

// -------------------------------------------------------------
// ADMIN LAYOUT WRAPPER (Responsive Lateral Sidebar)
// -------------------------------------------------------------
interface AdminLayoutProps {
  session: any;
  onLogout: () => void;
  settings: any;
  settingsLoaded: boolean;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ session, onLogout, settings, settingsLoaded }) => {
  const logoUrl = settings?.logo_url || '/logo.png';
  // Responsive sidebar open/close state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const location = useLocation();

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

  // Navigation Items
  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/calendar', label: 'Calendario', icon: Calendar },
    { path: '/admin/services', label: 'Servicios', icon: Briefcase },
    { path: '/admin/clients', label: 'Clientes', icon: Users },
    { path: '/admin/reports', label: 'Reportes', icon: BarChart2 },
    { path: '/admin/whatsapp', label: 'Conexión WhatsApp', icon: MessageCircle },
    { path: '/admin/settings', label: 'Configuración', icon: Settings },
  ];

  const activeItem = navItems.find(item => location.pathname === item.path) || navItems[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative bg-neutral-50/30">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-neutral-900/30 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen bg-white border-r border-neutral-100 shadow-sm z-40 transition-all duration-300 overflow-y-auto flex flex-col justify-between shrink-0 ${sidebarOpen ? 'w-64 translate-x-0 opacity-100' : 'w-0 -translate-x-full md:translate-x-0 pointer-events-none opacity-0 border-r-0 md:w-0'
          }`}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={logoUrl} 
                alt="Del Bono Logo" 
                className={`h-9 w-9 object-contain transition-opacity duration-300 ${!settings && !settingsLoaded ? 'opacity-0' : 'opacity-100'}`} 
              />
              <div className="text-left">
                <h2 className="text-sm font-extrabold text-offblack m-0">Panel Control</h2>
                <p className="text-[10px] text-gray-400 font-bold m-0 uppercase">{settings?.business_name || 'Mascotas Del Bono'}</p>
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
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition-all no-underline ${isActive
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
            onClick={onLogout}
            className="flex items-center justify-center gap-2 text-xs py-2 px-4 border-danger/25 text-danger hover:bg-danger/5 hover:border-danger rounded-xl w-full"
          >
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 min-h-screen">
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
            <span className="text-[10px] font-bold text-gray-500">{session?.user?.email || 'admin@delbono.com'}</span>
          </div>
        </header>

        {/* Content Body */}
        <main className="p-6 flex-1 bg-neutral-50/30 overflow-y-auto">
          <Routes>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/calendar" element={<AdminCalendar />} />
            <Route path="/admin/services" element={<ServicesManager />} />
            <Route path="/admin/clients" element={<ClientsManager />} />
            <Route path="/admin/reports" element={<ReportsManager />} />
            <Route path="/admin/whatsapp" element={<WhatsAppConnectionManager />} />
            <Route path="/admin/settings" element={<SettingsManager />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// ADMIN LOGIN COMPONENT
// -------------------------------------------------------------
const AdminLogin: React.FC<{ settings: any; settingsLoaded: boolean }> = ({ settings, settingsLoaded }) => {
  const logoUrl = settings?.logo_url || '/logo.png';
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [authSuccess, setAuthSuccess] = useState<string>('');
  const [loadingAuth, setLoadingAuth] = useState<boolean>(false);
  const [showForgot, setShowForgot] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setLoadingAuth(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError('Ocurrió un error inesperado al intentar ingresar.');
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setLoadingAuth(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthSuccess('Enlace de recuperación enviado a tu correo electrónico.');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError('Error al enviar el enlace de recuperación.');
    } finally {
      setLoadingAuth(false);
    }
  };

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-neutral-100 rounded-2xl shadow-xl shadow-amber-950/5">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="bg-primary/10 text-primary p-3 rounded-xl">
              <img 
                src={logoUrl} 
                alt="Del Bono Logo" 
                className={`h-10 w-10 object-contain transition-opacity duration-300 ${!settings && !settingsLoaded ? 'opacity-0' : 'opacity-100'}`} 
              />
            </div>
          </div>
          <CardTitle className="text-2xl mt-2 text-offblack">
            {showForgot ? 'Recuperar Contraseña' : 'Acceso Administrativo'}
          </CardTitle>
          <p className="text-sm text-gray-400 font-semibold">
            {showForgot ? 'Ingresa tu correo para recibir el enlace' : `Control de ${settings?.business_name || 'Tienda de Mascotas Del Bono'}`}
          </p>
        </CardHeader>
        <CardContent>
          {showForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {authError && (
                <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger">
                  {authError}
                </div>
              )}
              {authSuccess && (
                <div className="bg-success/10 border border-success/20 p-3 rounded-lg text-xs font-bold text-success">
                  {authSuccess}
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

              <Button type="submit" variant="primary" isLoading={loadingAuth} className="w-full mt-2 py-2.5">
                Enviar Enlace
              </Button>

              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setAuthError('');
                  setAuthSuccess('');
                }}
                className="w-full text-center text-xs font-bold text-primary hover:underline bg-transparent border-none cursor-pointer mt-2"
              >
                Volver al ingreso
              </button>
            </form>
          ) : (
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

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true);
                    setAuthError('');
                    setAuthSuccess('');
                  }}
                  className="text-xs font-bold text-primary hover:underline bg-transparent border-none cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <Button type="submit" variant="primary" isLoading={loadingAuth} className="w-full mt-2 py-2.5">
                Ingresar al Sistema
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// -------------------------------------------------------------
// RESET PASSWORD COMPONENT (DURING RECOVERY)
// -------------------------------------------------------------
const ResetPassword: React.FC<{ onComplete: () => void; settings: any; settingsLoaded: boolean }> = ({ onComplete, settings, settingsLoaded }) => {
  const logoUrl = settings?.logo_url || '/logo.png';
  const [newPassword, setNewPassword] = useState<string>('');
  const [repeatPassword, setRepeatPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== repeatPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Contraseña restablecida con éxito. Redirigiendo...');
        setTimeout(() => {
          onComplete();
        }, 3000);
      }
    } catch (err: any) {
      console.error(err);
      setError('Ocurrió un error al intentar cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-neutral-100 rounded-2xl shadow-xl shadow-amber-950/5">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="bg-primary/10 text-primary p-3 rounded-xl">
              <img 
                src={logoUrl} 
                alt="Del Bono Logo" 
                className={`h-10 w-10 object-contain transition-opacity duration-300 ${!settings && !settingsLoaded ? 'opacity-0' : 'opacity-100'}`} 
              />
            </div>
          </div>
          <CardTitle className="text-2xl mt-2 text-offblack">Restablecer Contraseña</CardTitle>
          <p className="text-sm text-gray-400 font-semibold">Ingresa tu nueva contraseña para el sistema</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger text-left">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-success/10 border border-success/20 p-3 rounded-lg text-xs font-bold text-success text-left">
                {success}
              </div>
            )}

            <Input
              label="Nueva Contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
            />

            <Input
              label="Repetir Nueva Contraseña"
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              placeholder="Repite tu contraseña"
              required
            />

            <Button type="submit" variant="primary" isLoading={loading} className="w-full mt-2 py-2.5">
              Cambiar Contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// -------------------------------------------------------------
// APP ROUTER ROUTING CONTROLLER
// -------------------------------------------------------------
const AppContent: React.FC<{
  session: any;
  onLogout: () => void;
  isResettingPassword: boolean;
  setIsResettingPassword: (val: boolean) => void;
  checkingAuth: boolean;
  settings: any;
  settingsLoaded: boolean;
}> = ({ session, onLogout, isResettingPassword, setIsResettingPassword, checkingAuth, settings, settingsLoaded }) => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const logoUrl = settings?.logo_url || '/logo.png';

  if (checkingAuth) {
    return <div className="text-center py-20 font-bold text-lg text-gray-500">Verificando sesión...</div>;
  }

  if (isResettingPassword) {
    return (
      <div className="min-h-dvh flex flex-col font-sans bg-flatbg">
        <header className="bg-white/80 backdrop-blur-md border-b border-neutral-100 sticky top-0 z-[100] py-4 px-6 shadow-sm shadow-amber-950/[0.01]">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-offblack no-underline">
              <img 
                src={logoUrl} 
                alt="Del Bono Logo" 
                className={`h-10 w-10 object-contain transition-opacity duration-300 ${!settings && !settingsLoaded ? 'opacity-0' : 'opacity-100'}`} 
              />
              <div className="text-left">
                <span className="font-extrabold text-base sm:text-lg tracking-tight block">
                  {settings?.business_name || 'Tienda de Mascotas Del Bono'}
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto py-8 px-6">
          <ResetPassword settings={settings} settingsLoaded={settingsLoaded} onComplete={() => {
            setIsResettingPassword(false);
            window.location.hash = ''; // Clear hash fragment
            window.location.pathname = '/login'; // Redirect to login page
          }} />
        </main>
      </div>
    );
  }

  // If visiting admin panel path, bypass client containers
  if (isAdminRoute) {
    return session ? (
      <AdminLayout session={session} onLogout={onLogout} settings={settings} settingsLoaded={settingsLoaded} />
    ) : (
      <Navigate to="/login" replace />
    );
  }

  // Client-facing website container
  return (
    <div className="min-h-dvh flex flex-col font-sans bg-flatbg">
      {/* Navigation Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-neutral-100 sticky top-0 z-[100] py-4 px-6 shadow-sm shadow-amber-950/[0.01]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            onClick={() => window.dispatchEvent(new Event('reset_booking_flow'))}
            className="flex items-center gap-2.5 text-offblack no-underline"
          >
            <img 
              src={logoUrl} 
              alt="Del Bono Logo" 
              className={`h-10 w-10 object-contain transition-opacity duration-300 ${!settings && !settingsLoaded ? 'opacity-0' : 'opacity-100'}`} 
            />
            <div className="text-left">
              <span className="font-extrabold text-base sm:text-lg tracking-tight block">
                {settings?.business_name || 'Tienda de Mascotas Del Bono'}
              </span>
            </div>
          </Link>

          <div className="flex gap-4">
            <Link
              to="/"
              onClick={() => window.dispatchEvent(new Event('reset_booking_flow'))}
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
          <Route path="/" element={<BookingLanding settings={settings} />} />
          <Route path="/turno/:id" element={<BookingStatus settings={settings} />} />
          {/* <Route path="/pago/confirmacion" element={<BookingPaymentConfirm />} /> */}
          <Route
            path="/login"
            element={session ? <Navigate to="/admin" replace /> : <AdminLogin settings={settings} settingsLoaded={settingsLoaded} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-100 bg-white py-8 px-6 text-center text-xs font-semibold text-gray-400">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6">
          {/* Business Info (Location, Phone, Socials) */}
          <div className="flex gap-4 flex-wrap justify-center items-center">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {settings?.address || 'Av. Del Bono 123, San Juan'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              {settings?.phone || '+54 264 4567890'}
            </span>
            {settings?.instagram && (
              <>
                <span>•</span>
                <a 
                  href={`https://instagram.com/${settings.instagram}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-primary transition-colors no-underline text-gray-400 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5 text-gray-400 hover:text-primary fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                  @{settings.instagram}
                </a>
              </>
            )}
            {settings?.facebook && (
              <>
                <span>•</span>
                <a 
                  href={`https://facebook.com/${settings.facebook}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-primary transition-colors no-underline text-gray-400 flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5 text-gray-400 hover:text-primary fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                  </svg>
                  Facebook
                </a>
              </>
            )}
          </div>

          {/* Copyright & Dev Lab Credits at the very bottom */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 border-t border-neutral-100/50 w-full pt-4 text-[10px] text-gray-400">
            <span>© 2026 {settings?.business_name || 'Tienda de Mascotas Del Bono'}. Todos los derechos reservados.</span>
            <span className="hidden sm:inline">•</span>
            <span>
              Desarrollado por{' '}
              <a 
                href="https://www.264devlab.com.ar" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-primary transition-colors font-bold no-underline text-gray-400"
              >
                264DevLab
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

// -------------------------------------------------------------
// MAIN APP COMPONENT
// -------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(false);
  const [settings, setSettings] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('tdm_delbono_settings');
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setCheckingAuth(false);
    });

    // Load business settings
    async function loadSettings() {
      try {
        const { data } = await supabase.from('business_settings').select('*');
        if (data && data.length > 0) {
          setSettings(data[0]);
          try {
            localStorage.setItem('tdm_delbono_settings', JSON.stringify(data[0]));
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Error loading settings:', err);
      } finally {
        setSettingsLoaded(true);
      }
    }
    loadSettings();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
    });

    const handleSettingsUpdate = (e: CustomEvent) => {
      setSettings(e.detail);
    };
    window.addEventListener('settings_updated', handleSettingsUpdate as any);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('settings_updated', handleSettingsUpdate as any);
    };
  }, []);

  useEffect(() => {
    if (settings?.business_name) {
      document.title = settings.business_name;
    }
  }, [settings]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <BrowserRouter>
      <AppContent
        session={session}
        onLogout={handleLogout}
        isResettingPassword={isResettingPassword}
        setIsResettingPassword={setIsResettingPassword}
        checkingAuth={checkingAuth}
        settings={settings}
        settingsLoaded={settingsLoaded}
      />
    </BrowserRouter>
  );
}
