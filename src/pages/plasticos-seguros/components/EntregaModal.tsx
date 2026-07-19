import { useState } from 'react';
import { X, Loader2, CheckCircle } from 'lucide-react';
import type { PlasticoSeguro, User } from '@/types';
import { registrarEntrega, insertHistorial } from '@/services/plasticosSegurosService';
import { formatDateShort } from '@/utils/formatters';

interface Props {
  plastico: PlasticoSeguro;
  onClose: () => void;
  currentUser: User | null;
}

export default function EntregaModal({ plastico, onClose, currentUser }: Props) {
  const [empleado, setEmpleado] = useState(currentUser?.name || '');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!empleado.trim()) {
      setError('El nombre del empleado que entrega es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      await registrarEntrega(plastico.id, empleado.trim(), observaciones.trim() || undefined);
      await insertHistorial(plastico.id, 'Entrega', currentUser?.name, {
        empleado: empleado.trim(),
        observaciones: observaciones.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError('Error al registrar la entrega.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-sora font-bold text-slate-800 dark:text-white">Registrar Entrega</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-800 dark:text-white">Entregado</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">El plástico ha sido marcado como entregado.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-sm space-y-2">
              <p><span className="text-slate-400">Ref:</span> <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{plastico.numeroReferencia}</span></p>
              <p><span className="text-slate-400">Cliente:</span> <strong className="text-slate-800 dark:text-white">{plastico.nombreCliente}</strong></p>
              <p><span className="text-slate-400">Placa:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{plastico.placa}</span></p>
              <p><span className="text-slate-400">Aseguradora:</span> <span className="text-slate-700 dark:text-slate-300">{plastico.aseguradora || '—'}</span></p>
              <p><span className="text-slate-400">Llegó:</span> <span className="text-slate-700 dark:text-slate-300">{formatDateShort(plastico.fechaLlegada)}</span></p>
              <p>
                <span className="text-slate-400">Plástico físico:</span>{' '}
                {plastico.plasticoRecibido ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Recibido</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">⚠ No disponible — ¿entregar igual?</span>
                )}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Empleado que entrega *</label>
              <input type="text" value={empleado} onChange={(e) => setEmpleado(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Nombre del empleado..." />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm resize-none" rows={3} placeholder="Notas sobre la entrega..." />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                <i className="ri-error-warning-line"></i> {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm cursor-pointer whitespace-nowrap">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Entrega
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}