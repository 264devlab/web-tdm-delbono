import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2, Calendar, Globe, Save, ShieldCheck } from 'lucide-react';


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


