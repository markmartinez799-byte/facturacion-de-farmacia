import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Plus, Search, Users, ArrowLeft, Store, KeyRound, Edit, Power, PowerOff, Eye, EyeOff, CheckCircle, XCircle, X } from 'lucide-react';
import type { User } from '@/types';

type FeedbackType = { type: 'success' | 'error'; message: string } | null;

export default function CajerosPage() {
  const navigate = useNavigate();
  const { users, branches, addUser, updateUser, refreshUsers, hasRole } = useAuthStore();

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackType>(null);

  const [formName, setFormName] = useState('');
  const [formAccessCode, setFormAccessCode] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formBranchId, setFormBranchId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    refreshUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const cajeros = useMemo(() => {
    return users.filter((u) => u.role === 'cashier');
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cajeros;
    return cajeros.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.codigoCajero || '').toLowerCase().includes(q) ||
      (c.accessCode || '').includes(q)
    );
  }, [cajeros, search]);

  const activeCount = cajeros.filter((c) => c.isActive).length;
  const inactiveCount = cajeros.filter((c) => !c.isActive).length;

  const openCreate = () => {
    setEditingUser(null);
    setFormName('');
    setFormAccessCode('');
    setFormPassword('');
    setFormBranchId(branches.find((b) => b.isActive)?.id || '');
    setFormIsActive(true);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormAccessCode(user.accessCode || '');
    setFormPassword(user.password || '');
    setFormBranchId(user.branchId || '');
    setFormIsActive(user.isActive);
    setShowPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showFeedback('error', 'El nombre es obligatorio'); return; }
    if (!formAccessCode.trim() || formAccessCode.length < 4) { showFeedback('error', 'El código de acceso debe tener al menos 4 dígitos'); return; }
    if (!formBranchId) { showFeedback('error', 'Debes asignar una sucursal'); return; }

    setIsSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: formName.trim(),
          accessCode: formAccessCode.trim(),
          password: formPassword.trim() || editingUser.password,
          branchId: formBranchId,
          isActive: formIsActive,
        });
        showFeedback('success', 'Cajero actualizado correctamente');
      } else {
        const result = await addUser({
          name: formName.trim(),
          role: 'cashier',
          accessCode: formAccessCode.trim(),
          password: formPassword.trim() || '2026',
          branchId: formBranchId,
          isActive: formIsActive,
        });
        if (result.success) {
          showFeedback('success', 'Cajero creado correctamente');
        } else {
          showFeedback('error', result.error || 'Error al crear cajero');
          setIsSaving(false);
          return;
        }
      }
      await refreshUsers();
      closeModal();
    } catch (e: any) {
      showFeedback('error', e?.message || 'Error inesperado');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    const newState = !user.isActive;
    await updateUser(user.id, { isActive: newState });
    await refreshUsers();
    showFeedback('success', newState ? 'Cajero activado' : 'Cajero desactivado');
  };

  const getBranchName = (branchId?: string) => {
    if (!branchId) return '—';
    const b = branches.find((br) => br.id === branchId);
    return b ? b.name : '—';
  };

  if (!hasRole('manager')) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">No tienes permiso para ver esta página</p>
          <button onClick={() => navigate('/panel')} className="mt-4 text-emerald-600 text-sm hover:underline cursor-pointer">
            Volver al panel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-50 dark:bg-slate-900 p-4 md:p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/panel')} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-sora">Gestión de Cajeros</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Administra los cajeros del sistema y sus permisos</p>
          </div>
        </div>

        {/* Feedback banner */}
        {feedback && (
          <div className={`mb-4 px-4 py-3 rounded-lg flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'}`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span className="text-sm">{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Total</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{cajeros.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-emerald-600 uppercase tracking-wider font-medium">Activos</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">Inactivos</p>
            <p className="text-2xl font-bold text-slate-400 mt-1">{inactiveCount}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o código de acceso..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none"
            />
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuevo cajero
          </button>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider hidden sm:table-cell">Sucursal</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider hidden md:table-cell">Código Acceso</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider hidden md:table-cell">Creado</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold font-mono">
                        {c.codigoCajero || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <Users className="w-4 h-4 text-slate-500" />
                          </div>
                        )}
                        <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                        {getBranchName(c.branchId)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-slate-600 dark:text-slate-400 text-xs">{c.accessCode || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${c.isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                        {c.isActive ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {c.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs hidden md:table-cell">
                      {new Date(c.createdAt).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${c.isActive ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-500 hover:text-emerald-600'}`}
                          title={c.isActive ? 'Desactivar' : 'Activar'}
                        >
                          {c.isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No hay cajeros registrados</p>
                      <button onClick={openCreate} className="mt-2 text-emerald-600 text-sm hover:underline cursor-pointer">
                        Crear el primero
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingUser ? 'Editar Cajero' : 'Nuevo Cajero'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {editingUser ? 'Modifica los datos del cajero' : 'Completa los datos para crear un cajero nuevo'}
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Nombre completo</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej. María González"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>

              {/* Access Code */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Código de acceso</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formAccessCode}
                    onChange={(e) => setFormAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="4-6 dígitos numéricos"
                    maxLength={6}
                    inputMode="numeric"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none font-mono tracking-wider"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Código numérico para iniciar sesión en el POS</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  {editingUser ? 'Nueva contraseña (dejar en blanco para mantener)' : 'Contraseña'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUser ? '••••••' : 'Mínimo 6 caracteres'}
                    className="w-full px-3 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Sucursal asignada</label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none cursor-pointer appearance-none"
                  >
                    <option value="">Seleccionar sucursal...</option>
                    {branches.filter((b) => b.isActive).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${formIsActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formIsActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{formIsActive ? 'Activo' : 'Inactivo'}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSaving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear cajero'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}