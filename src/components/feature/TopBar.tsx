import { useState, useRef } from 'react';
import { Moon, Sun, Volume2, VolumeX, LogOut, User, Building2, Camera, X, Loader, DoorOpen } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { CierreCajaModal } from '@/components/feature/CierreCajaModal';

export function TopBar() {
  const { isDarkMode, toggleDarkMode, isSoundEnabled, toggleSound, settings } = useAppStore();
  const { currentUser, currentBranch, logout, updateUserAvatarRemote, turnoActualId } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showCierreCaja, setShowCierreCaja] = useState(false);

  const isCashier = currentUser?.role === 'cashier' || currentUser?.role === 'supervisor';
  const canCloseShift = isCashier && !!turnoActualId;

  const handleLogout = () => {
    logout();
    navigate('/acceso');
  };

  const handleCierreCompletado = () => {
    // El usuario puede volver a abrir caja si lo necesita
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    manager: 'Gerente',
    supervisor: 'Supervisor',
    cashier: 'Cajero',
  };
  const roleLabel = currentUser ? roleLabels[currentUser.role] || 'Usuario' : '';

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no puede superar 2MB');
      return;
    }

    setUploadingAvatar(true);
    setShowAvatarMenu(false);

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) {
          await updateUserAvatarRemote(currentUser.id, base64);
        }
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingAvatar(false);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser) return;
    setShowAvatarMenu(false);
    await updateUserAvatarRemote(currentUser.id, '');
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-6 transition-colors duration-300">
      <div className="flex items-center gap-3">
        <img src="https://static.readdy.ai/image/5bb0e04c11c0331c3337356b97ecb5ff/1602503810eb7b5d51244c8944e22090.png" alt="GENOSAN" className="h-10 w-10 object-contain" />
        <div className="hidden sm:block">
          <h1 className="font-sora font-semibold text-slate-800 dark:text-white text-lg leading-tight">
            {settings.name}
          </h1>
          {currentBranch && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {currentBranch.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleSound}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={isSoundEnabled ? 'Silenciar' : 'Activar sonidos'}
        >
          {isSoundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleDarkMode}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Cierre de caja - solo para cajeros con turno abierto */}
        {canCloseShift && (
          <button
            onClick={() => setShowCierreCaja(true)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title="Cerrar caja"
          >
            <DoorOpen className="w-5 h-5" />
          </button>
        )}

        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2.5 text-sm">
              <div className="relative">
                <button
                  onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                  className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-emerald-200 dark:border-emerald-700 flex-shrink-0 bg-emerald-50 dark:bg-emerald-900 flex items-center justify-center cursor-pointer hover:border-emerald-400 transition-colors group"
                  title="Cambiar foto de perfil"
                >
                  {uploadingAvatar ? (
                    <Loader className="w-4 h-4 text-emerald-600 animate-spin" />
                  ) : currentUser.avatar ? (
                    <>
                      <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-3 h-3 text-white" />
                      </div>
                    </>
                  ) : (
                    <>
                      <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                        <Camera className="w-3 h-3 text-white" />
                      </div>
                    </>
                  )}
                </button>

                {showAvatarMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAvatarMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-1 w-44 text-sm">
                      <button
                        onClick={() => { setShowAvatarMenu(false); fileInputRef.current?.click(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                      >
                        <Camera className="w-4 h-4" /> Cambiar foto
                      </button>
                      {currentUser.avatar && (
                        <button onClick={handleRemoveAvatar} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 cursor-pointer transition-colors">
                          <X className="w-4 h-4" /> Quitar foto
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="text-left">
                <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight text-sm">
                  {currentUser.name}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium leading-tight">
                  {roleLabel}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Cierre de Caja Modal */}
      <CierreCajaModal
        isOpen={showCierreCaja}
        onClose={() => setShowCierreCaja(false)}
        onCierreCompletado={handleCierreCompletado}
      />

      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
      />
    </header>
  );
}