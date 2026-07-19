import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AutorizacionReembolsoModalProps {
  onSuccess: (codigo: string) => void;
  onClose: () => void;
}

export default function AutorizacionReembolsoModal({ onSuccess, onClose }: AutorizacionReembolsoModalProps) {
  const [codigo, setCodigo] = useState('');
  const [codigoEsperado, setCodigoEsperado] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    loadCodigoEsperado();
  }, []);

  const loadCodigoEsperado = async () => {
    const { data } = await supabase.from('company_settings').select('codigo_reembolso, reembolsos_activos').limit(1).maybeSingle();
    if (data) {
      if (!data.reembolsos_activos) {
        setError('Los reembolsos están desactivados. Contacte al administrador.');
        setLoading(false);
        return;
      }
      setCodigoEsperado(data.codigo_reembolso || 'FARMA-2026-ADMIN');
    } else {
      setCodigoEsperado('FARMA-2026-ADMIN');
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    if (!codigo.trim()) {
      setError('Ingresa el código de autorización');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (codigo.trim() === codigoEsperado) {
      setError('');
      onSuccess(codigo.trim());
    } else {
      setError('Código de autorización incorrecto');
      setShake(true);
      setCodigo('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]">
      <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden ${shake ? 'animate-shake' : ''}`}>
        <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 text-center relative">
          <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Autorización de Reembolso</h3>
          <p className="text-slate-400 text-xs mt-1">Se requiere código de administrador para continuar</p>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 block uppercase tracking-wider">
                  Código de Autorización
                </label>
                <input
                  ref={inputRef}
                  type="password"
                  value={codigo}
                  onChange={(e) => { setCodigo(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                  maxLength={30}
                  placeholder="FARMA-2026-ADMIN"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-center text-base font-mono outline-none focus:border-amber-500 transition-colors"
                />
                {error && (
                  <p className="text-rose-500 text-xs mt-2 text-center font-medium">{error}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap">
                  Cancelar
                </button>
                <button onClick={handleSubmit} disabled={!codigo.trim()} className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
                  <ShieldCheck className="w-4 h-4" />
                  Autorizar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}