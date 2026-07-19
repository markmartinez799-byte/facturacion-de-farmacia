import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { X, DollarSign, CreditCard, Banknote, Receipt, Loader } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CierreCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCierreCompletado: () => void;
}

export function CierreCajaModal({ isOpen, onClose, onCierreCompletado }: CierreCajaModalProps) {
  const { currentUser, currentBranch, turnoActualId, cerrarTurno } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [resumen, setResumen] = useState({
    totalEfectivo: 0,
    totalTarjeta: 0,
    totalTransferencia: 0,
    totalVentas: 0,
    cantidadVentas: 0,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && turnoActualId) {
      cargarResumen();
    }
  }, [isOpen, turnoActualId]);

  const cargarResumen = async () => {
    if (!turnoActualId || !currentUser) return;
    setIsLoading(true);
    try {
      // Obtener fecha de apertura del turno
      const { data: turno } = await supabase
        .from('turnos_caja')
        .select('fecha_apertura')
        .eq('id', turnoActualId)
        .single();

      const desde = turno?.fecha_apertura || new Date(Date.now() - 86400000).toISOString();

      const { data: ventas } = await supabase
        .from('facturas_farmacia')
        .select('total, metodo_pago')
        .eq('usuario_id', currentUser.id)
        .eq('estado', 'completada')
        .gte('created_at', desde);

      let totalEfectivo = 0;
      let totalTarjeta = 0;
      let totalTransferencia = 0;
      let totalVentas = 0;
      let cantidadVentas = 0;

      if (ventas) {
        for (const v of ventas) {
          const t = Number(v.total) || 0;
          totalVentas += t;
          cantidadVentas += 1;

          const metodo = (v.metodo_pago as string) || 'efectivo';
          if (metodo === 'efectivo') totalEfectivo += t;
          else if (metodo === 'tarjeta') totalTarjeta += t;
          else if (metodo === 'transferencia') totalTransferencia += t;
          else totalEfectivo += t;
        }
      }

      setResumen({ totalEfectivo, totalTarjeta, totalTransferencia, totalVentas, cantidadVentas });
    } catch (e: any) {
      console.error('[CierreCaja] Error al cargar resumen:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCerrar = async () => {
    setIsClosing(true);
    setError('');
    try {
      await cerrarTurno({
        totalEfectivo: resumen.totalEfectivo,
        totalTarjeta: resumen.totalTarjeta,
        totalTransferencia: resumen.totalTransferencia,
        totalVentas: resumen.totalVentas,
        cantidadVentas: resumen.cantidadVentas,
        observaciones: observaciones.trim() || undefined,
      });
      onCierreCompletado();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error al cerrar turno');
    } finally {
      setIsClosing(false);
    }
  };

  if (!isOpen) return null;

  const diferencia = resumen.totalEfectivo - resumen.totalVentas;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cierre de Caja</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {currentUser?.name} — {currentBranch?.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isLoading ? (
          <div className="px-6 py-12 flex items-center justify-center">
            <Loader className="w-6 h-6 text-emerald-500 animate-spin" />
            <span className="ml-2 text-sm text-slate-500">Calculando resumen...</span>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-4">
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium mb-1">
                  <Receipt className="w-3.5 h-3.5" />
                  Ventas
                </div>
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">RD${resumen.totalVentas.toLocaleString()}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{resumen.cantidadVentas} factura(s)</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
                  <Banknote className="w-3.5 h-3.5" />
                  Efectivo
                </div>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200">RD${resumen.totalEfectivo.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  Tarjeta
                </div>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200">RD${resumen.totalTarjeta.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  Transferencia
                </div>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200">RD${resumen.totalTransferencia.toLocaleString()}</p>
              </div>
            </div>

            {/* Diferencia */}
            <div className={`rounded-xl p-3 border ${Math.abs(diferencia) < 1 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Diferencia de caja</p>
              <p className={`text-lg font-bold ${Math.abs(diferencia) < 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {diferencia >= 0 ? '+' : ''}RD${diferencia.toFixed(2)}
              </p>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Observaciones</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas sobre el cierre de caja..."
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-400 outline-none resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleCerrar}
            disabled={isLoading || isClosing}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
          >
            {isClosing ? (
              <><Loader className="w-4 h-4 animate-spin" /> Cerrando...</>
            ) : (
              'Cerrar caja'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}