import { useState } from 'react';
import { X, Loader2, CheckCircle, RotateCcw } from 'lucide-react';
import type { PlasticoSeguro, User } from '@/types';
import { renovarPlastico, insertHistorial } from '@/services/plasticosSegurosService';
import { formatDateShort } from '@/utils/formatters';

interface Props {
  plastico: PlasticoSeguro;
  onClose: () => void;
  currentUser: User | null;
}

export default function RenovacionModal({ plastico, onClose, currentUser }: Props) {
  const [nuevaFechaVencimiento, setNuevaFechaVencimiento] = useState('');
  const [nuevoNumeroPoliza, setNuevoNumeroPoliza] = useState(plastico.numeroPoliza || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nuevaFechaVencimiento) {
      setError('La nueva fecha de vencimiento es obligatoria.');
      return;
    }

    // Validate: new date must be in the future
    const nueva = new Date(nuevaFechaVencimiento + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (nueva <= hoy) {
      setError('La nueva fecha de vencimiento debe ser futura.');
      return;
    }

    setSaving(true);
    try {
      const nuevoPlastico = await renovarPlastico(
        plastico,
        nuevaFechaVencimiento,
        nuevoNumeroPoliza.trim() || undefined,
        currentUser?.name,
      );
      await insertHistorial(plastico.id, 'Renovación', currentUser?.name, {
        nuevo_plastico_id: nuevoPlastico.id,
        nueva_fecha_vencimiento: nuevaFechaVencimiento,
        nueva_poliza: nuevoNumeroPoliza || undefined,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError('Error al renovar el seguro.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-sora font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-sky-500" /> Renovar Seguro
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-800 dark:text-white">Seguro Renovado</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Se creó un nuevo registro con la fecha actualizada.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-sm space-y-2">
              <p><span className="text-slate-400">Cliente:</span> <strong className="text-slate-800 dark:text-white">{plastico.nombreCliente}</strong></p>
              <p><span className="text-slate-400">Placa:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{plastico.placa}</span></p>
              <p><span className="text-slate-400">Vencimiento actual:</span> <span className="text-red-600 dark:text-red-400 font-medium">{formatDateShort(plastico.fechaVencimientoSeguro)}</span></p>
              <p><span className="text-slate-400">Póliza actual:</span> <span className="text-slate-700 dark:text-slate-300">{plastico.numeroPoliza || '—'}</span></p>
            </div>

            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs">
              Al renovar, el registro actual pasará a estado "Renovado" y se creará uno nuevo con estado "Pendiente". El historial anterior se mantiene.
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nueva Fecha de Vencimiento *</label>
              <input type="date" value={nuevaFechaVencimiento} onChange={(e) => setNuevaFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nuevo Número de Póliza (opcional)</label>
              <input type="text" value={nuevoNumeroPoliza} onChange={(e) => setNuevoNumeroPoliza(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="POL-67890" />
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
                className="px-6 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Renovar Seguro
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}