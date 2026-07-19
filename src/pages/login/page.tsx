import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { playClick, playBeep } from '@/utils/sounds';
import { User, Lock, CreditCard, ChevronLeft, Eye, EyeOff, DollarSign, CheckCircle, Camera } from 'lucide-react';
import type { User as UserType } from '@/types';

type LoginMode = 'role-select' | 'cashier-code' | 'admin-login' | 'opening-cash';

const DAILY_PHRASES = [
  'Cada cliente que atiendes es una oportunidad de hacer su día mejor.',
  'Tu actitud determina la calidad del servicio que brindas.',
  'El éxito de hoy se construye con el esfuerzo de ahora.',
  'Una sonrisa cuesta nada y vale mucho — úsala con cada cliente.',
  'Hoy es un nuevo día para superar tus metas de ayer.',
  'La excelencia no es un acto, es un hábito. ¡Tú lo tienes!',
  'Cada venta es un paso más hacia el éxito del equipo.',
  'Tu trabajo importa. Gracias por dar lo mejor de ti.',
  'Los grandes resultados vienen de pequeños esfuerzos constantes.',
  'Hoy tienes la oportunidad de ser extraordinario.',
  'La dedicación de hoy es el logro de mañana.',
  'Eres parte esencial de este equipo. ¡Brilla hoy!',
  'Con disciplina y actitud positiva, nada es imposible.',
  'Cada día es una nueva oportunidad para crecer.',
  'Tu esfuerzo no pasa desapercibido. ¡Sigue adelante!',
];

function getDailyPhrase(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_PHRASES[dayOfYear % DAILY_PHRASES.length];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { users, branches, loginAdmin, loginCashier, isAuthenticated, currentUser, setOpeningAmount, abrirTurno, updateUserAvatar, refreshUsers, refreshBranches } = useAuthStore();
  const { isSoundEnabled } = useAppStore();

  const [mode, setMode] = useState<LoginMode>('role-select');
  const [selectedCashier, setSelectedCashier] = useState<UserType | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [openingError, setOpeningError] = useState('');

  const codeInputRef = useRef<HTMLInputElement>(null);
  const openingInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const activeCashiers = users.filter((u) => (u.role === 'cashier' || u.role === 'supervisor') && u.isActive);
  const activeBranches = branches.filter((b) => b.isActive);
  const dailyPhrase = getDailyPhrase();

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const adminPath = currentUser.role === 'admin' || currentUser.role === 'manager' ? '/panel' : '/pago';
      navigate(adminPath);
    }
  }, [isAuthenticated, currentUser, navigate]);

  // Cargar cajeros y sucursales reales desde Supabase al montar la página
  useEffect(() => {
    refreshUsers();
    refreshBranches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'cashier-code') setTimeout(() => codeInputRef.current?.focus(), 100);
    if (mode === 'opening-cash') setTimeout(() => openingInputRef.current?.focus(), 100);
  }, [mode]);

  const playSound = useCallback(() => { if (isSoundEnabled) playClick(); }, [isSoundEnabled]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCashier) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateUserAvatar(selectedCashier.id, dataUrl);
      setSelectedCashier({ ...selectedCashier, avatar: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleCashierLogin = useCallback(async () => {
    if (!selectedCashier || !selectedBranch || code.length < 4) {
      setError('Selecciona cajero, sucursal e ingresa el código');
      return;
    }
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const success = await loginCashier(selectedCashier.id, code, selectedBranch);
    if (success) {
      if (isSoundEnabled) playBeep();
      setMode('opening-cash');
    } else {
      setError('Código incorrecto');
      setCode('');
      codeInputRef.current?.focus();
    }
    setIsLoading(false);
  }, [selectedCashier, selectedBranch, code, loginCashier, isSoundEnabled]);

  const handleAdminLogin = useCallback(async () => {
    if (!username || !password) { setError('Ingresa usuario y contraseña'); return; }
    setIsLoading(true);
    try {
      const success = await loginAdmin(username, password);
      if (success) {
        if (isSoundEnabled) playBeep();
        navigate('/panel');
      } else {
        setError('Usuario o contraseña incorrectos');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [username, password, loginAdmin, isSoundEnabled, navigate]);

  const handleOpeningCash = useCallback(async () => {
    const amount = parseFloat(openingCash.replace(/,/g, ''));
    if (isNaN(amount) || amount < 0) { setOpeningError('Ingresa un monto válido'); return; }
    setIsLoading(true);
    try {
      // Registrar turno en la base de datos
      await abrirTurno(amount);
      if (isSoundEnabled) playBeep();
      navigate('/pago');
    } catch (err: any) {
      setOpeningError(err.message || 'Error al abrir turno');
      setIsLoading(false);
    }
  }, [openingCash, abrirTurno, isSoundEnabled, navigate]);

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="https://static.readdy.ai/image/5bb0e04c11c0331c3337356b97ecb5ff/cfd632cc6a8e94fc14710693d1e88311.png"
          alt="Farmacia"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/75 via-slate-900/65 to-teal-900/75" />
      </div>

      {/* Brand top-left */}
      <div className="absolute top-6 left-8 flex items-center gap-3 z-10">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center overflow-hidden">
          <img src="https://storage.readdy-site.link/project_files/61af992a-e06f-4abd-88c8-ec17ee19dfca/28008b87-7746-4f5b-b115-a239cbb570ec_Farmacia-GN.png?v=6b59633c552f3dcaab6c84d0e5aaf330" alt="GENOSAN" className="w-full h-full object-contain" />
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-none font-sora">GENOSAN</p>
          <p className="text-emerald-300 text-xs">Sistema de Facturación</p>
        </div>
      </div>



      <div className="relative z-10 w-full max-w-sm">

        {/* Daily phrase - centered above welcome card, large */}
        <div className="text-center mb-6 px-4">
          <p className="text-emerald-300 text-xs font-medium uppercase tracking-[0.2em] mb-2">Frase del día</p>
          <p className="text-white text-lg md:text-xl font-medium italic leading-relaxed drop-shadow-lg">
            &ldquo;{dailyPhrase}&rdquo;
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">

          {/* ROLE SELECT */}
          {mode === 'role-select' && (
            <div className="p-8 space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white font-sora">Bienvenido</h2>
                <p className="text-white/60 text-sm mt-1">Selecciona cómo deseas ingresar</p>
              </div>
              <button onClick={() => { playSound(); setMode('cashier-code'); }} className="w-full p-5 rounded-xl border border-white/20 bg-white/10 hover:bg-emerald-500/30 hover:border-emerald-400/50 transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CreditCard className="w-6 h-6 text-emerald-300" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-white text-base">Cajero</h3>
                    <p className="text-sm text-white/50">Acceso con código numérico</p>
                  </div>
                </div>
              </button>
              <button onClick={() => { playSound(); setMode('admin-login'); }} className="w-full p-5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/40 transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User className="w-6 h-6 text-white/80" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-white text-base">Administrador</h3>
                    <p className="text-sm text-white/50">Acceso con usuario y contraseña</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* CASHIER CODE */}
          {mode === 'cashier-code' && (
            <div className="p-8 space-y-4">
              <button onClick={() => { playSound(); setMode('role-select'); setSelectedCashier(null); setSelectedBranch(''); setCode(''); setError(''); }} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-2 cursor-pointer">
                <ChevronLeft className="w-4 h-4" /><span className="text-sm">Volver</span>
              </button>
              <div className="text-center">
                <h2 className="text-xl font-bold text-white font-sora">Acceso Cajero</h2>
                <p className="text-white/50 text-sm mt-1">Ingresa tus datos para continuar</p>
              </div>

              {/* Avatar display + upload */}
              {selectedCashier && (
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full border-2 border-emerald-400/60 overflow-hidden bg-white/10 flex items-center justify-center">
                      {selectedCashier.avatar ? (
                        <img src={selectedCashier.avatar} alt={selectedCashier.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-white/40" />
                      )}
                    </div>
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-emerald-400 transition-colors"
                      title="Cambiar foto"
                    >
                      <Camera className="w-3.5 h-3.5 text-white" />
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </div>
                  <p className="text-white/70 text-sm font-medium">{selectedCashier.name}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-white/70 mb-1 block uppercase tracking-wide">Tu nombre</label>
                  <select
                    value={selectedCashier?.id || ''}
                    onChange={(e) => {
                      const cashier = activeCashiers.find((c) => c.id === e.target.value);
                      setSelectedCashier(cashier || null);
                      playSound(); setError('');
                    }}
                    className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-emerald-400 outline-none text-sm cursor-pointer"
                  >
                    <option value="" className="text-slate-800">-- Seleccionar cajero --</option>
                    {activeCashiers.map((c) => (
                      <option key={c.id} value={c.id} className="text-slate-800">{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/70 mb-1 block uppercase tracking-wide">Sucursal</label>
                  <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); playSound(); setError(''); }} className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-emerald-400 outline-none text-sm cursor-pointer">
                    <option value="" className="text-slate-800">-- Seleccionar sucursal --</option>
                    {activeBranches.map((b) => (
                      <option key={b.id} value={b.id} className="text-slate-800">{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/70 mb-1 block uppercase tracking-wide">Código de acceso</label>
                  <input
                    ref={codeInputRef}
                    type="password"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCashierLogin(); } }}
                    placeholder="••••"
                    maxLength={6}
                    inputMode="numeric"
                    className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-400 outline-none text-center text-2xl tracking-[0.5em] font-mono"
                  />
                  <p className="text-white/40 text-xs text-center mt-1">Escribe tu código y presiona Enter</p>
                </div>
              </div>

              {error && <div className="bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2"><p className="text-red-300 text-sm text-center">{error}</p></div>}

              <button onClick={handleCashierLogin} disabled={isLoading || code.length < 4 || !selectedCashier || !selectedBranch} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-white rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer">
                {isLoading ? 'Verificando...' : 'Ingresar →'}
              </button>
            </div>
          )}

          {/* ADMIN LOGIN */}
          {mode === 'admin-login' && (
            <div className="p-8 space-y-4">
              <button onClick={() => { playSound(); setMode('role-select'); setUsername(''); setPassword(''); setError(''); }} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-2 cursor-pointer">
                <ChevronLeft className="w-4 h-4" /><span className="text-sm">Volver</span>
              </button>
              <div className="text-center">
                <h2 className="text-xl font-bold text-white font-sora">Administrador</h2>
                <p className="text-white/50 text-sm mt-1">Ingresa tus credenciales</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-white/70 mb-1 block uppercase tracking-wide">Usuario</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }} placeholder="rafael" className="w-full pl-9 pr-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-400 outline-none text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/70 mb-1 block uppercase tracking-wide">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }} placeholder="••••••" className="w-full pl-9 pr-10 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-400 outline-none text-sm" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {error && <div className="bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2"><p className="text-red-300 text-sm text-center">{error}</p></div>}
              <button onClick={handleAdminLogin} disabled={isLoading || !username || !password} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-white rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer">
                {isLoading ? 'Verificando...' : 'Ingresar →'}
              </button>
            </div>
          )}

          {/* OPENING CASH */}
          {mode === 'opening-cash' && (
            <div className="p-8 space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-400/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="w-8 h-8 text-emerald-300" />
                </div>
                <h2 className="text-xl font-bold text-white font-sora">Apertura de Caja</h2>
                <p className="text-white/60 text-sm mt-1">
                  Hola <span className="text-emerald-300 font-semibold">{selectedCashier?.name}</span>, ¿cuánto dinero tienes en caja?
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-white/70 mb-2 block uppercase tracking-wide text-center">Monto inicial en caja (RD$)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300 font-bold text-lg">$</span>
                  <input
                    ref={openingInputRef}
                    type="number"
                    value={openingCash}
                    onChange={(e) => { setOpeningCash(e.target.value.replace(/[^0-9.]/g, '')); setOpeningError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleOpeningCash(); } }}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:ring-2 focus:ring-emerald-400 outline-none text-2xl font-bold text-center"
                  />
                </div>
                {openingError && <p className="text-red-300 text-xs text-center mt-1">{openingError}</p>}
                <p className="text-white/40 text-xs text-center mt-2">Presiona Enter para continuar</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['500', '1000', '2000', '5000', '10000', '0'].map((amt) => (
                  <button key={amt} onClick={() => { setOpeningCash(amt); setOpeningError(''); playSound(); }} className="py-2 rounded-lg bg-white/10 hover:bg-emerald-500/30 border border-white/15 hover:border-emerald-400/40 text-white/80 hover:text-white text-sm font-medium transition-all cursor-pointer">
                    {amt === '0' ? 'RD$0' : `RD$${parseInt(amt).toLocaleString()}`}
                  </button>
                ))}
              </div>
              <button onClick={handleOpeningCash} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer">
                <CheckCircle className="w-5 h-5" />Iniciar turno
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-white/30 text-xs mt-4">GENOSAN © {new Date().getFullYear()} — Sistema de Facturación DGII</p>
      </div>
    </div>
  );
}
