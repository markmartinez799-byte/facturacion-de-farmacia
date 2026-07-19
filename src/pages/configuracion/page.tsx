import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { Building2, Users, Store, FileText, Plus, Edit2, X, KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, Printer, Rocket, Trash2, Database, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User, Branch } from '@/types';
import PrinterConfig from './components/PrinterConfig';
import ModoProduccion from './components/ModoProduccion';
import FacturaEditor from './components/FacturaEditor';
import BackupModal from './components/BackupModal';

export default function ConfiguracionPage() {
  const { settings, updateSettings, ncfSequences, updateNCFSequence } = useAppStore();
  const { users, branches, addUser, updateUser, deleteUser, addBranch, updateBranch, deleteBranch, currentUser, changeAdminPassword, companySettings, loadCompanySettings, saveCompanySettingsDB, refreshUsers, hasRole, availableRoles } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'empresa' | 'cajeros' | 'sucursales' | 'ncf' | 'seguridad' | 'impresora' | 'produccion' | 'backup' | 'reembolsos'>('empresa');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: '', rnc: '', address: '', phone: '', email: '', logo: '', website: '', printFormat: '80mm' as '80mm' | 'carta'
  });

  useEffect(() => {
    loadCompanySettings();
    refreshUsers();
  }, []);

  useEffect(() => {
    if (companySettings) {
      setCompanyForm({
        name: companySettings.name || '',
        rnc: companySettings.rnc || '',
        address: companySettings.address || '',
        phone: companySettings.phone || '',
        email: companySettings.email || '',
        logo: companySettings.logo || '',
        website: companySettings.website || '',
        printFormat: companySettings.printFormat || '80mm',
      });
    } else {
      // Fallback to appStore settings
      setCompanyForm({
        name: settings.name || '',
        rnc: settings.rnc || '',
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
        logo: settings.logo || '',
        website: settings.website || '',
        printFormat: settings.printFormat || '80mm',
      });
    }
  }, [companySettings, settings]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [userForm, setUserForm] = useState({ name: '', accessCode: '', branchId: '', role: 'cashier' as User['role'], isActive: true });
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', rnc: '', isActive: true });
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'cajero' | 'sucursal'; id: string; name: string } | null>(null);
  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwResult, setPwResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userError, setUserError] = useState('');

  // Reembolso config state
  const [reembolsoConfig, setReembolsoConfig] = useState({ codigo: 'FARMA-2026-ADMIN', activo: true });
  const [reembolsoSaved, setReembolsoSaved] = useState(false);
  const [savingReembolso, setSavingReembolso] = useState(false);

  // Load reembolso config
  useEffect(() => {
    supabase.from('company_settings').select('codigo_reembolso, reembolsos_activos').limit(1).maybeSingle().then(({ data }) => {
      if (data) setReembolsoConfig({ codigo: data.codigo_reembolso || 'FARMA-2026-ADMIN', activo: data.reembolsos_activos ?? true });
    });
  }, []);

  const handleSaveReembolso = async () => {
    setSavingReembolso(true);
    const { data: existing } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
    if (existing?.id) {
      await supabase.from('company_settings').update({
        codigo_reembolso: reembolsoConfig.codigo,
        reembolsos_activos: reembolsoConfig.activo,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    }
    setSavingReembolso(false);
    setReembolsoSaved(true);
    setTimeout(() => setReembolsoSaved(false), 3000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    await saveCompanySettingsDB(companyForm);
    updateSettings({ name: companyForm.name, rnc: companyForm.rnc, address: companyForm.address, phone: companyForm.phone, email: companyForm.email, logo: companyForm.logo });
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.newPw || !pwForm.confirm) {
      setPwResult({ success: false, message: 'Completa todos los campos' });
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwResult({ success: false, message: 'Las contraseñas nuevas no coinciden' });
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwResult({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setPwLoading(true);
    setPwResult(null);
    const result = await changeAdminPassword(pwForm.current, pwForm.newPw);
    setPwLoading(false);
    if (result.success) {
      setPwResult({ success: true, message: 'Contraseña actualizada correctamente' });
      setPwForm({ current: '', newPw: '', confirm: '' });
    } else {
      setPwResult({ success: false, message: result.error || 'Error al cambiar contraseña' });
    }
  };

  const handleSaveUser = async () => {
    if (!userForm.name.trim()) {
      setUserError('El nombre es obligatorio');
      return;
    }
    if (!userForm.accessCode || userForm.accessCode.length < 4) {
      setUserError('El código de acceso debe tener al menos 4 dígitos');
      return;
    }
    setSavingUser(true);
    setUserError('');
    try {
      if (editingUser) {
        await updateUser(editingUser.id, userForm);
        console.log('[configuracion] Usuario actualizado:', editingUser.id);
      } else {
        const result = await addUser({ ...userForm, isActive: true });
        if (!result.success) {
          setUserError(result.error || 'Error al crear usuario');
          setSavingUser(false);
          return;
        }
        console.log('[configuracion] Usuario creado exitosamente');
      }
      setShowUserModal(false);
      setUserForm({ name: '', accessCode: '', branchId: '', role: 'cashier', isActive: true });
    } catch (err) {
      console.error('[configuracion] Error guardando usuario:', err);
      setUserError('Error inesperado al guardar usuario');
    } finally {
      setSavingUser(false);
    }
  };

  const handleSaveBranch = () => {
    if (editingBranch) {
      updateBranch(editingBranch.id, branchForm);
    } else {
      addBranch(branchForm);
    }
    setShowBranchModal(false);
    setBranchForm({ name: '', address: '', phone: '', rnc: '', isActive: true });
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'cajero') {
      deleteUser(confirmDelete.id);
    } else {
      deleteBranch(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  const tabs = [
    { id: 'empresa', label: 'Empresa', icon: Building2 },
    { id: 'cajeros', label: 'Usuarios', icon: Users },
    ...(hasRole('admin') ? [{ id: 'sucursales', label: 'Sucursales', icon: Store }] : []),
    ...(hasRole('admin') ? [{ id: 'ncf', label: 'NCF', icon: FileText }] : []),
    { id: 'impresora', label: 'Impresora', icon: Printer },
    ...(hasRole('admin') || hasRole('manager') ? [{ id: 'factura', label: 'Factura', icon: FileText }] : []),
    ...(hasRole('admin') ? [{ id: 'reembolsos' as const, label: 'Reembolsos', icon: RotateCcw }] : []),
    ...(hasRole('admin') ? [{ id: 'backup', label: 'Backup', icon: Database }] : []),
    ...(hasRole('admin') ? [{ id: 'seguridad', label: 'Seguridad', icon: KeyRound }] : []),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-sora font-bold text-slate-800 dark:text-white">Configuración</h1>
        <p className="text-slate-500 dark:text-slate-400">Gestión del sistema y parámetros</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-3 flex items-center gap-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'backup' && hasRole('admin') && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Copia de Seguridad</h2>
              <p className="text-xs text-slate-400 mt-0.5">Exporta todos tus datos a archivos Excel</p>
            </div>
            <button
              onClick={() => setShowBackupModal(true)}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-download-cloud-line"></i>
              Crear Backup
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Productos', icon: 'ri-medicine-bottle-line', desc: 'Inventario completo con stock y precios', color: 'emerald' },
              { label: 'Ventas', icon: 'ri-bill-line', desc: 'Todas las facturas con detalle de items', color: 'sky' },
              { label: 'Clientes', icon: 'ri-user-line', desc: 'Base de datos de clientes', color: 'amber' },
              { label: 'Compras', icon: 'ri-shopping-cart-line', desc: 'Historial de compras a proveedores', color: 'violet' },
            ].map((item) => (
              <div key={item.label} className={`p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-900/30' : item.color === 'sky' ? 'bg-sky-100 dark:bg-sky-900/30' : item.color === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                    <i className={`${item.icon} text-lg ${item.color === 'emerald' ? 'text-emerald-600' : item.color === 'sky' ? 'text-sky-600' : item.color === 'amber' ? 'text-amber-600' : 'text-violet-600'}`}></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">{item.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'empresa' && (
        <form onSubmit={handleSaveSettings}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Datos de la Empresa</h2>
                <p className="text-xs text-slate-400 mt-0.5">Se guardan en base de datos y se reflejan en facturas y reportes</p>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                {savingSettings ? <i className="ri-loader-4-line animate-spin"></i> : settingsSaved ? <i className="ri-checkbox-circle-fill"></i> : <i className="ri-save-line"></i>}
                {savingSettings ? 'Guardando...' : settingsSaved ? '¡Guardado!' : 'Guardar Cambios'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nombre de la Empresa *</label>
                <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} required
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">RNC</label>
                <input type="text" value={companyForm.rnc} onChange={(e) => setCompanyForm({ ...companyForm, rnc: e.target.value })}
                  placeholder="101-00000-0"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Teléfono</label>
                <input type="text" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  placeholder="809-000-0000"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Dirección</label>
                <input type="text" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Correo Electrónico</label>
                <input type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Sitio Web (opcional)</label>
                <input type="text" value={companyForm.website} onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                  placeholder="www.genosan.com"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">URL del Logo (opcional)</label>
                <input type="text" value={companyForm.logo} onChange={(e) => setCompanyForm({ ...companyForm, logo: e.target.value })}
                  placeholder="https://empresa.com/logo.png"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
                {companyForm.logo && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white flex items-center justify-center">
                      <img src={companyForm.logo} alt="Logo" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </div>
                    <p className="text-xs text-slate-400">Vista previa del logo</p>
                  </div>
                )}
              </div>
            </div>

            {settingsSaved && (
              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm">
                <i className="ri-checkbox-circle-fill"></i>
                Datos de empresa guardados correctamente en la base de datos.
              </div>
            )}
          </div>
        </form>
      )}

      {activeTab === 'cajeros' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Gestión de Usuarios</h2>
            <button
              onClick={() => { setEditingUser(null); setUserForm({ name: '', accessCode: '', branchId: '', role: 'cashier', isActive: true }); setShowUserModal(true); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> Nuevo Usuario
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Nombre</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Email</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Rol</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Código</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Sucursal</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Estado</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.filter((u) => !u.id.startsWith('00000000-')).map((user) => (
                  <tr key={user.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="p-3 text-slate-800 dark:text-slate-200 font-medium">{user.name}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 text-sm">{user.email || '—'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'supervisor' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {availableRoles.find((r) => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{user.accessCode || '—'}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">
                      {branches.find((b) => b.id === user.branchId)?.name || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        user.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                      }`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setEditingUser(user); setUserForm({ name: user.name, accessCode: user.accessCode || '', branchId: user.branchId || '', role: user.role, isActive: user.isActive }); setShowUserModal(true); }}
                          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'cajero', id: user.id, name: user.name })}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'sucursales' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Gestión de Sucursales</h2>
            <button
              onClick={() => { setEditingBranch(null); setBranchForm({ name: '', address: '', phone: '', rnc: '', isActive: true }); setShowBranchModal(true); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> Nueva Sucursal
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Nombre</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Dirección</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Teléfono</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Estado</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="p-3 text-slate-800 dark:text-slate-200">{branch.name}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{branch.address}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{branch.phone}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        branch.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                      }`}>
                        {branch.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setEditingBranch(branch); setBranchForm({ name: branch.name, address: branch.address, phone: branch.phone, rnc: branch.rnc || '', isActive: branch.isActive }); setShowBranchModal(true); }}
                          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'sucursal', id: branch.id, name: branch.name })}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'ncf' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Secuencias de NCF</h2>
          <div className="space-y-4">
            {ncfSequences.map((seq) => (
              <div key={seq.type} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">{seq.type} - {seq.label}</p>
                    <p className="text-sm text-slate-500">Prefijo: {seq.prefix}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    seq.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                  }`}>
                    {seq.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Último número: </span>
                    <span className="font-mono font-medium">{seq.lastNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Límite: </span>
                    <span className="font-mono font-medium">{seq.limit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'impresora' && (
        <PrinterConfig />
      )}

      {activeTab === 'factura' && (
        <FacturaEditor />
      )}


      {activeTab === 'seguridad' && hasRole('admin') && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 max-w-md">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            Cambiar Contraseña
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Solo disponible para el administrador</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Contraseña actual</label>
              <div className="relative">
                <input type={showCurrent ? 'text' : 'password'} value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} className="w-full p-2 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" placeholder="••••••••" />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">{showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nueva contraseña</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={pwForm.newPw} onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })} className="w-full p-2 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" placeholder="Mínimo 6 caracteres" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Confirmar nueva contraseña</label>
              <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" placeholder="Repite la nueva contraseña" />
            </div>
            {pwResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${pwResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                {pwResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {pwResult.message}
              </div>
            )}
            <button onClick={handleChangePassword} disabled={pwLoading} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
              {pwLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Actualizando...</> : <><KeyRound className="w-4 h-4" />Actualizar Contraseña</>}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'reembolsos' && hasRole('admin') && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 max-w-lg">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                Configuración de Reembolsos
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Código maestro de autorización y control de acceso</p>
            </div>
            <button onClick={handleSaveReembolso} disabled={savingReembolso}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              {savingReembolso ? <i className="ri-loader-4-line animate-spin"></i> : reembolsoSaved ? <i className="ri-checkbox-circle-fill"></i> : <i className="ri-save-line"></i>}
              {savingReembolso ? 'Guardando...' : reembolsoSaved ? 'Guardado' : 'Guardar'}
            </button>
          </div>

          <div className="space-y-5">
            {/* Toggle activar/desactivar */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reembolsos Activos</p>
                <p className="text-xs text-slate-400">Activa o desactiva la posibilidad de realizar reembolsos</p>
              </div>
              <button
                onClick={() => setReembolsoConfig({ ...reembolsoConfig, activo: !reembolsoConfig.activo })}
                className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer ${
                  reembolsoConfig.activo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  reembolsoConfig.activo ? 'translate-x-5' : 'translate-x-0.5'
                }`}></span>
              </button>
            </div>

            {/* Código maestro */}
            <div>
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 block">
                Código Maestro de Autorización
              </label>
              <p className="text-xs text-slate-400 mb-2">Este código será solicitado cada vez que se realice un reembolso</p>
              <input
                type="text"
                value={reembolsoConfig.codigo}
                onChange={(e) => setReembolsoConfig({ ...reembolsoConfig, codigo: e.target.value })}
                className="w-full p-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-base font-mono focus:border-amber-500 outline-none transition-colors"
                placeholder="FARMA-2026-ADMIN"
              />
            </div>

            {/* Info */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Importante</p>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 space-y-1 list-disc list-inside">
                    <li>Este código se requiere para cada reembolso</li>
                    <li>Compártelo solo con personal autorizado</li>
                    <li>Los intentos fallidos quedan registrados</li>
                    <li>Los productos vencidos van a cuarentena automáticamente</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {reembolsoSaved && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Configuración de reembolsos guardada correctamente.
            </div>
          )}
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-white">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
              <button onClick={() => { setShowUserModal(false); setUserError(''); }}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              {userError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {userError}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nombre Completo</label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Rol del Usuario</label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as User['role'] })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                  {availableRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Código de Acceso (4 dígitos)</label>
                <input type="text" maxLength={6} value={userForm.accessCode} onChange={(e) => setUserForm({ ...userForm, accessCode: e.target.value.replace(/\D/g, '') })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Sucursal Asignada</label>
                <select value={userForm.branchId} onChange={(e) => setUserForm({ ...userForm, branchId: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                  <option value="">Seleccionar...</option>
                  {branches.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => { setShowUserModal(false); setUserError(''); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button>
              <button onClick={handleSaveUser} disabled={savingUser} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer flex items-center gap-2 whitespace-nowrap">
                {savingUser ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded-full">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-white">
                    Eliminar {confirmDelete.type === 'cajero' ? 'Usuario' : 'Sucursal'}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                ¿Estás seguro que deseas eliminar <strong className="text-slate-800 dark:text-white">{confirmDelete.name}</strong>?
                {confirmDelete.type === 'sucursal' && (
                  <span className="block mt-1 text-amber-600 dark:text-amber-400 text-xs">
                    Los cajeros asignados a esta sucursal quedarán sin sucursal.
                  </span>
                )}
              </p>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showBranchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-white">{editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}</h3>
              <button onClick={() => setShowBranchModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nombre</label>
                <input type="text" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Dirección</label>
                <input type="text" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Teléfono</label>
                <input type="text" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">RNC (opcional)</label>
                <input type="text" value={branchForm.rnc} onChange={(e) => setBranchForm({ ...branchForm, rnc: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setShowBranchModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={handleSaveBranch} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && <BackupModal onClose={() => setShowBackupModal(false)} />}
    </div>
  );
}