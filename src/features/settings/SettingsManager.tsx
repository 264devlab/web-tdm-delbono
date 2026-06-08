import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { Plus, Trash2, Calendar, Globe, Save, ShieldCheck } from 'lucide-react';
import { formatDate } from '../../utils/format';


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
  
  // Business fields
  const [businessName, setBusinessName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [facebook, setFacebook] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoFileBase64, setLogoFileBase64] = useState<string>('');
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);

  // Password fields
  const [newPassword, setNewPassword] = useState<string>('');
  const [repeatPassword, setRepeatPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [passwordSuccess, setPasswordSuccess] = useState<string>('');
  const [savingPassword, setSavingPassword] = useState<boolean>(false);

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
        setLogoUrl(s.logo_url || '');
        setLogoPreview(s.logo_url || '/logo.png');

        // Update local storage and dispatch event to keep layout updated in real time
        try {
          localStorage.setItem('tdm_delbono_settings', JSON.stringify(s));
          window.dispatchEvent(new CustomEvent('settings_updated', { detail: s }));
        } catch (_) {}
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('El archivo es demasiado grande. El límite es de 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoFileBase64(reader.result as string);
        setLogoFileName(file.name);
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);

    let finalLogoUrl = logoUrl;

    if (logoFileBase64) {
      setUploadingLogo(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const waApiKey = import.meta.env.VITE_WA_API_KEY;
        if (waApiKey) {
          headers['x-api-key'] = waApiKey;
        }

        const res = await fetch('/api/settings/upload-logo', {
          method: 'POST',
          headers,
          body: JSON.stringify({ base64: logoFileBase64, fileName: logoFileName }),
        });
        const data = await res.json();
        if (data.success && data.logoUrl) {
          finalLogoUrl = data.logoUrl;
          setLogoUrl(data.logoUrl);
          setLogoFileBase64('');
        } else {
          throw new Error(data.error || 'No se pudo subir la imagen.');
        }
      } catch (err: any) {
        console.error('Error uploading logo:', err);
        showConfirm({
          title: 'Error de Logotipo',
          message: `Ocurrió un error al subir el logotipo: ${err.message}`,
          confirmText: 'Entendido',
          variant: 'danger',
          showCancel: false,
          onConfirm: () => {}
        });
        setUploadingLogo(false);
        setSavingSettings(false);
        return;
      }
      setUploadingLogo(false);
    }
    
    const payload = {
      business_name: businessName,
      address,
      phone,
      email: email || '',
      whatsapp,
      facebook: facebook || null,
      instagram: instagram || null,
      logo_url: finalLogoUrl || null,
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
      showConfirm({
        title: 'Configuración Guardada',
        message: 'La configuración de la tienda ha sido guardada exitosamente.',
        confirmText: 'Aceptar',
        variant: 'primary',
        showCancel: false,
        onConfirm: () => {}
      });
      await loadData();
    } catch (err) {
      console.error(err);
      showConfirm({
        title: 'Error de Configuración',
        message: 'Ocurrió un error al intentar guardar la configuración.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Add Block
  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockDate || !blockReason) return;

    // Validate date to be in the current year or future, preventing past years (like 2001) or far future years (like 20026)
    const selectedDate = new Date(blockDate + 'T00:00:00');
    const selectedYear = selectedDate.getFullYear();
    const currentYear = new Date().getFullYear();

    if (selectedYear < currentYear) {
      showConfirm({
        title: 'Fecha inválida',
        message: 'No puedes bloquear una fecha en el pasado. Por favor selecciona una fecha actual o futura.',
        confirmText: 'Entendido',
        variant: 'warning',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    if (selectedYear > currentYear + 5) {
      showConfirm({
        title: 'Fecha inválida',
        message: 'No puedes bloquear una fecha con más de 5 años en el futuro. Por favor verifica el año seleccionado.',
        confirmText: 'Entendido',
        variant: 'warning',
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }
    
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
      showConfirm({
        title: 'Error de Bloqueo',
        message: 'Ocurrió un error al intentar guardar el bloqueo de fecha.',
        confirmText: 'Entendido',
        variant: 'danger',
        showCancel: false,
        onConfirm: () => {}
      });
    } finally {
      setSavingBlock(false);
    }
  };

  // Delete Block
  const handleDeleteBlock = (id: string) => {
    showConfirm({
      title: 'Eliminar Bloqueo',
      message: '¿Seguro que deseas eliminar esta regla de bloqueo?',
      confirmText: 'Eliminar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await supabase.from('holidays_blocks').delete().eq('id', id);
          await loadData();
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== repeatPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess('Contraseña actualizada con éxito.');
        setNewPassword('');
        setRepeatPassword('');
      }
    } catch (err: any) {
      console.error(err);
      setPasswordError('Error al actualizar la contraseña.');
    } finally {
      setSavingPassword(false);
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
                    label="Email Administrativo (Opcional)"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />

                  <div className="space-y-2 text-left">
                    <label className="text-xs font-bold text-gray-500 uppercase">Logotipo del Negocio</label>
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-neutral-100 rounded-2xl bg-neutral-50/50">
                      <div className="relative w-16 h-16 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        <img src={logoPreview || '/logo.png'} alt="Logo Preview" className="w-full h-full object-contain" />
                      </div>
                      <div className="space-y-2 flex-1 text-center sm:text-left">
                        <p className="text-[11px] text-gray-400 font-semibold m-0">Sube una imagen cuadrada (PNG, JPG) de hasta 2MB.</p>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                          <label className="cursor-pointer bg-primary hover:bg-amber-600 text-white text-xs font-bold py-2 px-3.5 rounded-lg transition-colors inline-block m-0">
                            {uploadingLogo ? 'Subiendo...' : 'Seleccionar Logo'}
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={uploadingLogo} />
                          </label>
                          {logoUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setLogoUrl('');
                                setLogoPreview('/logo.png');
                                setLogoFileBase64('');
                              }}
                              className="text-xs py-2 px-3 border border-danger/25 text-danger hover:bg-danger/5 hover:border-danger rounded-lg h-auto"
                            >
                              Restablecer por Defecto
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

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

            <Card className="border border-neutral-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Seguridad de la Cuenta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {passwordError && (
                    <div className="bg-danger/10 border border-danger/20 p-3 rounded-lg text-xs font-bold text-danger">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="bg-success/10 border border-success/20 p-3 rounded-lg text-xs font-bold text-success">
                      {passwordSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" variant="primary" isLoading={savingPassword} className="flex items-center gap-2 py-2.5 px-4 rounded-xl">
                      <Save className="h-4 w-4" /> Actualizar Contraseña
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>



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
              
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const activeBlocks = blocks
                  .filter(b => b.date >= todayStr)
                  .sort((a, b) => a.date.localeCompare(b.date));

                if (activeBlocks.length === 0) {
                  return <p className="text-xs text-gray-400 font-semibold italic">No hay días de cierre configurados.</p>;
                }

                return (
                  <div className="max-h-[30dvh] overflow-y-auto space-y-2.5 pr-1">
                    {activeBlocks.map(b => (
                      <div key={b.id} className="border border-neutral-100 p-3 bg-white rounded-xl shadow-sm flex items-center justify-between gap-3">
                        <div>
                          <span className="bg-secondary/10 text-secondary border-none px-2 py-0.5 text-[9px] font-bold rounded-full">
                            {formatDate(b.date)}
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
                );
              })()}
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


