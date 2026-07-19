import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { PlasticoSeguro, PlasticoSeguroFormData, TipoVehiculo, User } from '@/types';
import { insertPlastico, updatePlastico, checkPlacaDuplicada, insertHistorial } from '@/services/plasticosSegurosService';
import { supabase } from '@/lib/supabase';

interface Props {
  plastico: PlasticoSeguro | null;
  onClose: () => void;
  currentUser: User | null;
}

const initialForm: PlasticoSeguroFormData = {
  nombreCliente: '',
  telefono: '',
  cedula: '',
  tipoVehiculo: 'automovil',
  marcaVehiculo: '',
  modelo: '',
  ano: '',
  placa: '',
  aseguradora: '',
  numeroPoliza: '',
  fechaEmisionSeguro: '',
  fechaVencimientoSeguro: '',
  fechaLlegada: new Date().toISOString().split('T')[0],
  loteMes: '',
  observaciones: '',
  sucursalId: '',
};

const TIPO_OPCIONES: { value: TipoVehiculo; label: string }[] = [
  { value: 'motocicleta', label: 'Motocicleta' },
  { value: 'automovil', label: 'Automóvil' },
  { value: 'camion', label: 'Camión' },
  { value: 'jeepeta', label: 'Jeepeta' },
  { value: 'otro', label: 'Otro' },
];

export default function PlasticoModal({ plastico, onClose, currentUser }: Props) {
  const isEdit = !!plastico;
  const [form, setForm] = useState<PlasticoSeguroFormData>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('branches').select('id,name').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setBranches(data as { id: string; name: string }[]);
    });
  }, []);

  useEffect(() => {
    if (plastico) {
      setForm({
        nombreCliente: plastico.nombreCliente,
        telefono: plastico.telefono || '',
        cedula: plastico.cedula || '',
        tipoVehiculo: plastico.tipoVehiculo,
        marcaVehiculo: plastico.marcaVehiculo || '',
        modelo: plastico.modelo || '',
        ano: plastico.ano || '',
        placa: plastico.placa,
        aseguradora: plastico.aseguradora || '',
        numeroPoliza: plastico.numeroPoliza || '',
        fechaEmisionSeguro: plastico.fechaEmisionSeguro || '',
        fechaVencimientoSeguro: plastico.fechaVencimientoSeguro || '',
        fechaLlegada: plastico.fechaLlegada || new Date().toISOString().split('T')[0],
        loteMes: plastico.loteMes || '',
        observaciones: plastico.observaciones || '',
        sucursalId: plastico.sucursalId || '',
      });
    }
  }, [plastico]);

  const updateField = (field: keyof PlasticoSeguroFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.nombreCliente.trim()) { setError('El nombre del cliente es obligatorio.'); return; }
    if (!form.placa.trim()) { setError('La placa del vehículo es obligatoria.'); return; }

    // Check duplicate placa
    const duplicado = await checkPlacaDuplicada(form.placa.trim(), plastico?.id);
    if (duplicado) {
      setError(`La placa ${form.placa.trim()} ya está registrada para ${duplicado.nombreCliente}.`);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && plastico) {
        await updatePlastico(plastico.id, {
          ...form,
          updatedBy: currentUser?.name,
        });
        await insertHistorial(plastico.id, 'Modificación', currentUser?.name,
          { cambios: 'Datos generales actualizados' }
        );
      } else {
        const nuevo = await insertPlastico({
          ...form,
          createdBy: currentUser?.name,
        });
        await insertHistorial(nuevo.id, 'Registro', currentUser?.name,
          { ...form }
        );
      }
      onClose();
    } catch (err) {
      setError('Error al guardar. Intenta de nuevo.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="text-lg font-sora font-bold text-slate-800 dark:text-white">
            {isEdit ? 'Editar Plástico' : 'Nuevo Plástico de Seguro'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Reference number - visible when editing */}
          {isEdit && plastico && (
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">N° Referencia:</span>
              <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                {plastico.numeroReferencia}
              </span>
            </div>
          )}

          {/* Cliente */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Datos del Cliente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nombre y Apellido *</label>
                <input type="text" value={form.nombreCliente} onChange={(e) => updateField('nombreCliente', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Ej: Juan Pérez" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Teléfono</label>
                <input type="text" value={form.telefono} onChange={(e) => updateField('telefono', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="809-555-1234" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Cédula</label>
                <input type="text" value={form.cedula} onChange={(e) => updateField('cedula', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="402-1234567-8" />
              </div>
            </div>
          </div>

          {/* Vehículo */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Datos del Vehículo</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Tipo *</label>
                <select value={form.tipoVehiculo} onChange={(e) => updateField('tipoVehiculo', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                  {TIPO_OPCIONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Marca</label>
                <input type="text" value={form.marcaVehiculo} onChange={(e) => updateField('marcaVehiculo', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Toyota" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Modelo</label>
                <input type="text" value={form.modelo} onChange={(e) => updateField('modelo', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Corolla" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Año</label>
                <input type="text" value={form.ano} onChange={(e) => updateField('ano', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="2024" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Placa *</label>
                <input type="text" value={form.placa} onChange={(e) => updateField('placa', e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm font-mono" placeholder="A123456" />
              </div>
            </div>
          </div>

          {/* Seguro */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Datos del Seguro</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Aseguradora</label>
                <input type="text" value={form.aseguradora} onChange={(e) => updateField('aseguradora', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Seguros Universal" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Número de Póliza</label>
                <input type="text" value={form.numeroPoliza} onChange={(e) => updateField('numeroPoliza', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="POL-12345" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha Emisión</label>
                <input type="date" value={form.fechaEmisionSeguro} onChange={(e) => updateField('fechaEmisionSeguro', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha Vencimiento</label>
                <input type="date" value={form.fechaVencimientoSeguro} onChange={(e) => updateField('fechaVencimientoSeguro', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" />
              </div>
            </div>
          </div>

          {/* Recepción */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Recepción en Farmacia</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha de Llegada</label>
                <input type="date" value={form.fechaLlegada} onChange={(e) => updateField('fechaLlegada', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Lote o Mes de Llegada</label>
                <input type="text" value={form.loteMes} onChange={(e) => updateField('loteMes', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Julio 2026" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Sucursal de Retiro</label>
                <select value={form.sucursalId || ''} onChange={(e) => updateField('sucursalId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                  <option value="">Seleccionar sucursal...</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Observaciones</label>
              <input type="text" value={form.observaciones} onChange={(e) => updateField('observaciones', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm" placeholder="Notas adicionales..." />
            </div>
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
              {isEdit ? 'Guardar Cambios' : 'Registrar Plástico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}