import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, Eye, Edit2, Truck, RefreshCw, Printer, X, ChevronLeft, ChevronRight, SlidersHorizontal, Loader2, AlertTriangle, Clock, CheckCircle, XCircle, RotateCcw, Car, FileText, PackageCheck, PackageX, Hash } from 'lucide-react';
import type { PlasticoSeguro } from '@/types';
import {
  fetchPlasticosSeguros,
  deletePlastico,
  autoUpdateEstados,
  insertHistorial,
  marcarPlasticoRecibido,
  registrarEntrega,
  revertirEntrega,
} from '@/services/plasticosSegurosService';
import { useAuthStore } from '@/store/authStore';
import { formatDateShort } from '@/utils/formatters';
import PlasticoModal from './components/PlasticoModal';
import EntregaModal from './components/EntregaModal';
import RenovacionModal from './components/RenovacionModal';

const PAGE_SIZE = 15;

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: <Clock className="w-3.5 h-3.5" /> },
  entregado: { label: 'Entregado', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  vencido: { label: 'Vencido', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30', icon: <XCircle className="w-3.5 h-3.5" /> },
  proximo_vencer: { label: 'Próx. a vencer', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/30', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  renovado: { label: 'Renovado', color: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-100 dark:bg-sky-900/30', icon: <RotateCcw className="w-3.5 h-3.5" /> },
};

const TIPO_VEHICULO_LABELS: Record<string, string> = {
  motocicleta: 'Motocicleta',
  automovil: 'Automóvil',
  camion: 'Camión',
  jeepeta: 'Jeepeta',
  otro: 'Otro',
};

function formatHora(hora?: string): string {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function combinarFechaHora(fecha?: string, hora?: string): string {
  if (!fecha) return '—';
  if (!hora) return formatDateShort(fecha);
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y} ${formatHora(hora)}`;
}

function calcularDiasRestantes(fechaVencimiento?: string): number | null {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PlasticosSegurosPage() {
  const { currentUser } = useAuthStore();
  const [plasticos, setPlasticos] = useState<PlasticoSeguro[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showEntrega, setShowEntrega] = useState(false);
  const [showRenovacion, setShowRenovacion] = useState(false);
  const [selectedPlastico, setSelectedPlastico] = useState<PlasticoSeguro | null>(null);

  // Filters
  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [filterTipoVehiculo, setFilterTipoVehiculo] = useState<string>('all');
  const [filterLoteMes, setFilterLoteMes] = useState<string>('all');
  const [filterAseguradora, setFilterAseguradora] = useState<string>('all');
  const [filterEmpleado, setFilterEmpleado] = useState<string>('all');

  // Detail view
  const [showDetail, setShowDetail] = useState(false);
  const [detailPlastico, setDetailPlastico] = useState<PlasticoSeguro | null>(null);

  // Quick delivery tracking
  const [quickDelivering, setQuickDelivering] = useState<Set<string>>(new Set());

  // Delivery confirmation
  const [confirmDelivery, setConfirmDelivery] = useState<PlasticoSeguro | null>(null);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);

  // Revert confirmation (admin only)
  const [confirmRevert, setConfirmRevert] = useState<PlasticoSeguro | null>(null);
  const [revertJustificacion, setRevertJustificacion] = useState('');
  const [revertingDelivery, setRevertingDelivery] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoaded(false);
    try {
      await autoUpdateEstados();
      const data = await fetchPlasticosSeguros();
      setPlasticos(data);
    } catch (err) {
      console.error('Error loading plasticos:', err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived data
  const conteo = useMemo(() => {
    const c = { total: 0, pendiente: 0, entregado: 0, vencido: 0, proximo_vencer: 0, renovado: 0, noRecibidos: 0 };
    plasticos.forEach((p) => {
      c.total++;
      if (c[p.estado] !== undefined) c[p.estado]++;
      if (!p.plasticoRecibido) c.noRecibidos++;
    });
    return c;
  }, [plasticos]);

  const renovadosEsteMes = useMemo(() => {
    const hoy = new Date();
    return plasticos.filter((p) => {
      if (p.estado !== 'renovado') return false;
      const d = new Date(p.updatedAt);
      return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
    }).length;
  }, [plasticos]);

  // Filters for dropdowns
  const lotesMeses = useMemo(() => Array.from(new Set(plasticos.map((p) => p.loteMes).filter(Boolean))).sort().reverse(), [plasticos]);
  const aseguradoras = useMemo(() => Array.from(new Set(plasticos.map((p) => p.aseguradora).filter(Boolean))).sort(), [plasticos]);
  const empleados = useMemo(() => Array.from(new Set(plasticos.map((p) => p.empleadoEntrego).filter(Boolean))).sort(), [plasticos]);

  // Filtered data
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return plasticos.filter((p) => {
      if (filterEstado !== 'all' && p.estado !== filterEstado) return false;
      if (filterTipoVehiculo !== 'all' && p.tipoVehiculo !== filterTipoVehiculo) return false;
      if (filterLoteMes !== 'all' && p.loteMes !== filterLoteMes) return false;
      if (filterAseguradora !== 'all' && p.aseguradora !== filterAseguradora) return false;
      if (filterEmpleado !== 'all' && p.empleadoEntrego !== filterEmpleado) return false;

      if (q) {
        return (
          p.nombreCliente.toLowerCase().includes(q) ||
          (p.telefono && p.telefono.includes(q)) ||
          (p.placa && p.placa.toLowerCase().includes(q)) ||
          (p.numeroPoliza && p.numeroPoliza.toLowerCase().includes(q)) ||
          (p.cedula && p.cedula.includes(q)) ||
          (p.loteMes && p.loteMes.toLowerCase().includes(q)) ||
          (p.numeroReferencia && p.numeroReferencia.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [plasticos, searchQuery, filterEstado, filterTipoVehiculo, filterLoteMes, filterAseguradora, filterEmpleado]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterEstado, filterTipoVehiculo, filterLoteMes, filterAseguradora, filterEmpleado]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, currentPage]);

  const hasActiveFilters = searchQuery || filterEstado !== 'all' || filterTipoVehiculo !== 'all' || filterLoteMes !== 'all' || filterAseguradora !== 'all' || filterEmpleado !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterEstado('all');
    setFilterTipoVehiculo('all');
    setFilterLoteMes('all');
    setFilterAseguradora('all');
    setFilterEmpleado('all');
  };

  // Actions
  const handleNew = () => {
    setSelectedPlastico(null);
    setShowModal(true);
  };

  const handleEdit = (p: PlasticoSeguro) => {
    setSelectedPlastico(p);
    setShowModal(true);
  };

  const handleEntrega = (p: PlasticoSeguro) => {
    setSelectedPlastico(p);
    setShowEntrega(true);
  };

  const handleRenovacion = (p: PlasticoSeguro) => {
    setSelectedPlastico(p);
    setShowRenovacion(true);
  };

  const handleDelete = async (p: PlasticoSeguro) => {
    if (!confirm(`¿Eliminar el registro de ${p.nombreCliente} - ${p.placa}?`)) return;
    await deletePlastico(p.id);
    await insertHistorial(p.id, 'Eliminado', currentUser?.name);
    loadData();
  };

  const handleViewDetail = (p: PlasticoSeguro) => {
    setDetailPlastico(p);
    setShowDetail(true);
  };

  const handlePrint = (p: PlasticoSeguro) => {
    const w = window.open('', '_blank', 'width=700,height=600');
    if (!w) return;
  const diasRestantes = calcularDiasRestantes(p.fechaVencimientoSeguro);

    w.document.write(`
      <html><head><title>Plástico - ${p.nombreCliente}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; }
        h2 { text-align: center; margin-bottom: 5px; }
        .info { margin: 15px 0; }
        .info p { margin: 4px 0; font-size: 14px; }
        .label { font-weight: bold; display: inline-block; width: 130px; }
        .estado { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: bold; }
        .estado.pendiente { background: #fef3c7; color: #92400e; }
        .estado.entregado { background: #d1fae5; color: #065f46; }
        .estado.vencido { background: #fee2e2; color: #991b1b; }
        .estado.proximo_vencer { background: #ffedd5; color: #9a3412; }
        .estado.renovado { background: #e0f2fe; color: #075985; }
        .disponible { background: #d1fae5; color: #065f46; }
        .nodisponible { background: #f1f5f9; color: #64748b; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>GENOSAN - Plástico de Seguro</h2>
      <hr/>
      <div class="info">
        <p><span class="label">Referencia:</span> <strong style="font-family:monospace;font-size:16px;">${p.numeroReferencia || '—'}</strong></p>
        <p><span class="label">Cliente:</span> <strong>${p.nombreCliente}</strong></p>
        <p><span class="label">Teléfono:</span> ${p.telefono || '—'}</p>
        <p><span class="label">Cédula:</span> ${p.cedula || '—'}</p>
        <p><span class="label">Vehículo:</span> ${TIPO_VEHICULO_LABELS[p.tipoVehiculo] || p.tipoVehiculo}</p>
        <p><span class="label">Marca:</span> ${p.marcaVehiculo || '—'} ${p.modelo || ''} ${p.ano || ''}</p>
        <p><span class="label">Placa:</span> <strong>${p.placa}</strong></p>
        <p><span class="label">Aseguradora:</span> ${p.aseguradora || '—'}</p>
        <p><span class="label">Póliza:</span> ${p.numeroPoliza || '—'}</p>
        <p><span class="label">Emisión:</span> ${formatDateShort(p.fechaEmisionSeguro)}</p>
        <p><span class="label">Vencimiento:</span> ${formatDateShort(p.fechaVencimientoSeguro)}</p>
        <p><span class="label">Llegada:</span> ${formatDateShort(p.fechaLlegada)} · ${p.loteMes || '—'}</p>
        <p><span class="label">Plástico físico:</span> <span class="${p.plasticoRecibido ? 'disponible' : 'nodisponible'}" style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:bold;">${p.plasticoRecibido ? '✓ Recibido' : '✗ No disponible'}</span></p>
        ${p.fechaRecibido ? `<p><span class="label">Recibido el:</span> ${formatDateShort(p.fechaRecibido)}</p>` : ''}
        <p><span class="label">Estado:</span> <span class="estado ${p.estado}">${ESTADO_CONFIG[p.estado]?.label || p.estado}</span></p>
        ${diasRestantes !== null ? `<p><span class="label">Días restantes:</span> ${diasRestantes > 0 ? diasRestantes : 'Vencido'}</p>` : ''}
        ${p.fechaEntrega ? `<p><span class="label">Entregado:</span> ${combinarFechaHora(p.fechaEntrega, p.horaEntrega)} por ${p.empleadoEntrego || '—'}</p>` : ''}
        ${p.observaciones ? `<p><span class="label">Observaciones:</span> ${p.observaciones}</p>` : ''}
      </div>
      <button onclick="window.print()" style="padding:10px 20px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Imprimir</button>
      </body></html>
    `);
    w.document.close();
  };

  const onModalClose = () => {
    setShowModal(false);
    setSelectedPlastico(null);
    loadData();
  };

  const onEntregaClose = () => {
    setShowEntrega(false);
    setSelectedPlastico(null);
    loadData();
  };

  const onRenovacionClose = () => {
    setShowRenovacion(false);
    setSelectedPlastico(null);
    loadData();
  };

  const handleMarcarRecibido = async (p: PlasticoSeguro) => {
    if (p.plasticoRecibido) return;
    await marcarPlasticoRecibido(p.id, currentUser?.name);
    await insertHistorial(p.id, 'Plástico recibido', currentUser?.name, {
      accion: 'Plástico físico recibido en farmacia',
    });
    loadData();
  };

  const handleQuickDeliver = async (p: PlasticoSeguro) => {
    if (p.fechaEntrega) return;
    setConfirmDelivery(p);
  };

  const handleConfirmDelivery = async () => {
    if (!confirmDelivery || confirmingDelivery) return;
    setConfirmingDelivery(true);
    try {
      const empleado = currentUser?.name || 'Sistema';
      await registrarEntrega(confirmDelivery.id, empleado);
      await insertHistorial(confirmDelivery.id, 'Entrega rápida', empleado, {
        accion: 'Plástico marcado como entregado desde la tabla',
        sucursal_id: currentUser?.branchId || null,
        cliente: confirmDelivery.nombreCliente,
      });
      setConfirmDelivery(null);
      loadData();
    } catch (err) {
      console.error('Error en entrega rápida:', err);
    } finally {
      setConfirmingDelivery(false);
    }
  };

  const handleRevertDelivery = (p: PlasticoSeguro) => {
    setConfirmRevert(p);
    setRevertJustificacion('');
    setRevertError(null);
  };

  const handleConfirmRevert = async () => {
    if (!confirmRevert || revertingDelivery) return;
    if (!revertJustificacion.trim()) {
      setRevertError('Debe proporcionar una justificación para revertir la entrega.');
      return;
    }
    setRevertingDelivery(true);
    setRevertError(null);
    try {
      await revertirEntrega(confirmRevert.id, currentUser?.name || 'Sistema', revertJustificacion.trim());
      setConfirmRevert(null);
      setRevertJustificacion('');
      loadData();
    } catch (err) {
      console.error('Error al revertir entrega:', err);
      setRevertError('Error al revertir la entrega. Intente de nuevo.');
    } finally {
      setRevertingDelivery(false);
    }
  };

  // Reminders
  const reminders = useMemo(() => {
    const proximos = plasticos.filter((p) => p.estado === 'proximo_vencer');
    const vencidos = plasticos.filter((p) => p.estado === 'vencido');
    const pendientes = plasticos.filter((p) => p.estado === 'pendiente');
    return { proximos, vencidos, pendientes };
  }, [plasticos]);

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-300 font-medium">Cargando plásticos de seguros...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold text-slate-800 dark:text-white">Control de Plásticos de Seguros</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {conteo.total} plásticos registrados · {conteo.pendiente} pendientes
          </p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap text-sm"
        >
          <Plus className="w-4 h-4" /> Nuevo Plástico
        </button>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{conteo.total}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{conteo.pendiente}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl border border-slate-300 dark:border-slate-600 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">No Recibidos</p>
          <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{conteo.noRecibidos}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Entregados</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{conteo.entregado}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800 p-4">
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">Próx. a vencer</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{conteo.proximo_vencer}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-4">
          <p className="text-xs text-red-600 dark:text-red-400 mb-1">Vencidos</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{conteo.vencido}</p>
        </div>
        <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-200 dark:border-sky-800 p-4">
          <p className="text-xs text-sky-600 dark:text-sky-400 mb-1">Renovados (mes)</p>
          <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{renovadosEsteMes}</p>
        </div>
      </div>

      {/* Reminders Panel */}
      {(reminders.proximos.length > 0 || reminders.vencidos.length > 0 || reminders.pendientes.length > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Recordatorios
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {reminders.pendientes.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  <strong>{reminders.pendientes.length}</strong> plásticos pendientes de retirar
                </span>
              </div>
            )}
            {conteo.noRecibidos > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  <strong>{conteo.noRecibidos}</strong> plásticos aún no recibidos en farmacia
                </span>
              </div>
            )}
            {reminders.proximos.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  <strong>{reminders.proximos.length}</strong> seguros próximos a vencer (≤30 días)
                </span>
              </div>
            )}
            {reminders.vencidos.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                <span className="text-slate-600 dark:text-slate-400">
                  <strong>{reminders.vencidos.length}</strong> seguros vencidos — <span className="text-red-500 font-medium">necesitan renovación</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, teléfono, placa, póliza, cédula..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowAdvanced((s) => !s)}
                className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
                  showAdvanced ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Filtros avanzados</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Estado</label>
                  <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                    <option value="all">Todos</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="entregado">Entregado</option>
                    <option value="proximo_vencer">Próximo a vencer</option>
                    <option value="vencido">Vencido</option>
                    <option value="renovado">Renovado</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Tipo vehículo</label>
                  <select value={filterTipoVehiculo} onChange={(e) => setFilterTipoVehiculo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                    <option value="all">Todos</option>
                    <option value="motocicleta">Motocicleta</option>
                    <option value="automovil">Automóvil</option>
                    <option value="camion">Camión</option>
                    <option value="jeepeta">Jeepeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Lote / Mes</label>
                  <select value={filterLoteMes} onChange={(e) => setFilterLoteMes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                    <option value="all">Todos</option>
                    {lotesMeses.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Aseguradora</label>
                  <select value={filterAseguradora} onChange={(e) => setFilterAseguradora(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                    <option value="all">Todas</option>
                    {aseguradoras.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Empleado entregó</label>
                  <select value={filterEmpleado} onChange={(e) => setFilterEmpleado(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer">
                    <option value="all">Todos</option>
                    {empleados.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">N° Ref</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Estado</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Cliente</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Teléfono</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Vehículo</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Placa</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Aseguradora</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Llegada</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Entrega</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Vencimiento</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Días</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((p) => {
                const cfg = ESTADO_CONFIG[p.estado] || ESTADO_CONFIG.pendiente;
                const diasRestantes = calcularDiasRestantes(p.fechaVencimientoSeguro);
                return (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="p-3">
                      <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded whitespace-nowrap">
                        {p.numeroReferencia}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {p.plasticoRecibido ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            <PackageCheck className="w-3 h-3" /> Recibido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            <PackageX className="w-3 h-3" /> No disponible
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white">{p.nombreCliente}</p>
                        {p.cedula && <p className="text-xs text-slate-400 dark:text-slate-500">Céd: {p.cedula}</p>}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">{p.telefono || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {TIPO_VEHICULO_LABELS[p.tipoVehiculo] || p.tipoVehiculo}
                          {p.marcaVehiculo && <span className="text-slate-400"> · {p.marcaVehiculo} {p.modelo || ''}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">{p.placa}</span>
                    </td>
                    <td className="p-3 text-xs text-slate-600 dark:text-slate-400">{p.aseguradora || '—'}</td>
                    <td className="p-3 text-center">
                      <div className="text-xs">
                        <p className="text-slate-600 dark:text-slate-400">{formatDateShort(p.fechaLlegada)}</p>
                        {p.loteMes && <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.loteMes}</p>}
                      </div>
                    </td>
                    <td className="p-3 text-center text-xs text-slate-600 dark:text-slate-400">
                      {p.fechaEntrega ? (
                        <div>
                          <p className="whitespace-nowrap">{combinarFechaHora(p.fechaEntrega, p.horaEntrega)}</p>
                          {p.empleadoEntrego && <p className="text-[10px] text-slate-400">{p.empleadoEntrego}</p>}
                        </div>
                      ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs font-medium ${diasRestantes !== null && diasRestantes <= 30 && diasRestantes > 0 ? 'text-orange-600 dark:text-orange-400 font-semibold' : diasRestantes !== null && diasRestantes <= 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {formatDateShort(p.fechaVencimientoSeguro)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {diasRestantes !== null && (
                        <span className={`text-xs font-bold font-mono ${
                          diasRestantes > 30 ? 'text-emerald-600 dark:text-emerald-400' :
                          diasRestantes > 0 ? 'text-orange-600 dark:text-orange-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {diasRestantes > 0 ? diasRestantes : 'VEN'}
                        </span>
                      )}
                      {diasRestantes === null && <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleViewDetail(p)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer" title="Ver detalle">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer" title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!p.plasticoRecibido && (
                            <button onClick={() => handleMarcarRecibido(p)} className="p-1.5 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg cursor-pointer" title="Marcar como recibido">
                              <PackageCheck className="w-4 h-4" />
                            </button>
                          )}
                          {p.estado === 'pendiente' && (
                            <button onClick={() => handleEntrega(p)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg cursor-pointer" title="Registrar entrega">
                              <Truck className="w-4 h-4" />
                            </button>
                          )}
                          {(p.estado === 'pendiente' || p.estado === 'vencido' || p.estado === 'proximo_vencer') && (
                            <button onClick={() => handleRenovacion(p)} className="p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg cursor-pointer" title="Renovar seguro">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => handlePrint(p)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer" title="Imprimir">
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                        {!p.fechaEntrega ? (
                          <label className="flex items-center gap-1.5 cursor-pointer group" title="Marcar como entregado">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handleQuickDeliver(p)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 font-medium whitespace-nowrap transition-colors">Entregado</span>
                          </label>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <label className="flex items-center gap-1.5 group" title={currentUser?.role === 'admin' ? 'Click para revertir entrega' : 'Entregado'}>
                              <input
                                type="checkbox"
                                checked={true}
                                readOnly={currentUser?.role !== 'admin'}
                                onChange={() => {
                                  if (currentUser?.role === 'admin') handleRevertDelivery(p);
                                }}
                                className={`w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 ${currentUser?.role === 'admin' ? 'cursor-pointer' : 'cursor-default'}`}
                              />
                              <span className="text-[10px] text-emerald-600 font-medium whitespace-nowrap">Entregado</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">
                    {plasticos.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="w-10 h-10 text-slate-300" />
                        <p>No hay plásticos registrados</p>
                        <button onClick={handleNew} className="text-emerald-600 hover:underline text-sm cursor-pointer">Registrar el primero</button>
                      </div>
                    ) : (
                      'No se encontraron resultados con los filtros actuales'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredData.length > PAGE_SIZE && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1} – {Math.min(currentPage * PAGE_SIZE, filteredData.length)} de {filteredData.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pg) => pg === 1 || pg === totalPages || Math.abs(pg - currentPage) <= 1)
                .reduce<(number | string)[]>((acc, pg, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) !== pg - 1) acc.push('...');
                  acc.push(pg);
                  return acc;
                }, [])
                .map((pg, i) =>
                  typeof pg === 'string' ? (
                    <span key={`dots-${i}`} className="px-2 text-xs text-slate-400">{pg}</span>
                  ) : (
                    <button key={pg}
                      onClick={() => setCurrentPage(pg)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        currentPage === pg ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                      {pg}
                    </button>
                  )
                )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <PlasticoModal
          plastico={selectedPlastico}
          onClose={onModalClose}
          currentUser={currentUser}
        />
      )}

      {showEntrega && selectedPlastico && (
        <EntregaModal
          plastico={selectedPlastico}
          onClose={onEntregaClose}
          currentUser={currentUser}
        />
      )}

      {showRenovacion && selectedPlastico && (
        <RenovacionModal
          plastico={selectedPlastico}
          onClose={onRenovacionClose}
          currentUser={currentUser}
        />
      )}

      {/* Delivery Confirmation Modal */}
      {confirmDelivery && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelivery(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Truck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Confirmar Entrega</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                ¿Confirma que este plástico fue entregado al cliente?
              </p>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 text-sm mb-4">
                <p className="font-semibold text-slate-800 dark:text-white">{confirmDelivery.nombreCliente}</p>
                <p className="text-xs text-slate-500">Ref: {confirmDelivery.numeroReferencia} · Placa: {confirmDelivery.placa}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setConfirmDelivery(null)}
                  className="px-5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm cursor-pointer whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelivery}
                  disabled={confirmingDelivery}
                  className="px-5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-2"
                >
                  {confirmingDelivery && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revert Delivery Modal (admin only) */}
      {confirmRevert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setConfirmRevert(null); setRevertError(null); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-sora font-bold text-slate-800 dark:text-white">Revertir Entrega</h2>
              <button onClick={() => { setConfirmRevert(null); setRevertError(null); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-sm">
                <p className="text-amber-700 dark:text-amber-300 font-medium">Está revirtiendo la entrega de:</p>
                <p className="font-semibold text-slate-800 dark:text-white mt-1">{confirmRevert.nombreCliente}</p>
                <p className="text-xs text-slate-500">Ref: {confirmRevert.numeroReferencia} · Placa: {confirmRevert.placa}</p>
                <p className="text-xs text-slate-500 mt-1">Entregado el {combinarFechaHora(confirmRevert.fechaEntrega, confirmRevert.horaEntrega)} por {confirmRevert.empleadoEntrego || '—'}</p>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Justificación *</label>
                <textarea
                  value={revertJustificacion}
                  onChange={(e) => { setRevertJustificacion(e.target.value); setRevertError(null); }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm resize-none"
                  rows={3}
                  placeholder="Explique por qué se revierte esta entrega..."
                />
              </div>

              {revertError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {revertError}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setConfirmRevert(null); setRevertError(null); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm cursor-pointer whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmRevert}
                  disabled={revertingDelivery}
                  className="px-5 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center gap-2"
                >
                  {revertingDelivery && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Reversión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && detailPlastico && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowDetail(false); setDetailPlastico(null); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-sora font-bold text-slate-800 dark:text-white">Detalle del Plástico</h2>
              <button onClick={() => { setShowDetail(false); setDetailPlastico(null); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {(() => {
                const d = detailPlastico;
                const cfg = ESTADO_CONFIG[d.estado] || ESTADO_CONFIG.pendiente;
                const dias = calcularDiasRestantes(d.fechaVencimientoSeguro);
                return (
                  <>
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        {d.numeroReferencia}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                      {d.plasticoRecibido ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                          <PackageCheck className="w-3 h-3" /> Recibido {d.fechaRecibido ? formatDateShort(d.fechaRecibido) : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          <PackageX className="w-3 h-3" /> No disponible
                        </span>
                      )}
                      {dias !== null && (
                        <span className={`text-xs font-bold font-mono ${dias > 30 ? 'text-emerald-600' : dias > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                          {dias > 0 ? `${dias} días restantes` : 'Vencido'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-slate-400 text-xs">Cliente</span><p className="font-medium text-slate-800 dark:text-white">{d.nombreCliente}</p></div>
                      <div><span className="text-slate-400 text-xs">Teléfono</span><p className="text-slate-700 dark:text-slate-300">{d.telefono || '—'}</p></div>
                      <div><span className="text-slate-400 text-xs">Cédula</span><p className="text-slate-700 dark:text-slate-300">{d.cedula || '—'}</p></div>
                      <div><span className="text-slate-400 text-xs">Vehículo</span><p className="text-slate-700 dark:text-slate-300">{TIPO_VEHICULO_LABELS[d.tipoVehiculo]}</p></div>
                      <div><span className="text-slate-400 text-xs">Marca / Modelo</span><p className="text-slate-700 dark:text-slate-300">{d.marcaVehiculo || '—'} {d.modelo || ''} {d.ano || ''}</p></div>
                      <div><span className="text-slate-400 text-xs">Placa</span><p className="font-mono font-semibold text-slate-800 dark:text-white">{d.placa}</p></div>
                      <div><span className="text-slate-400 text-xs">Aseguradora</span><p className="text-slate-700 dark:text-slate-300">{d.aseguradora || '—'}</p></div>
                      <div><span className="text-slate-400 text-xs">Póliza</span><p className="text-slate-700 dark:text-slate-300">{d.numeroPoliza || '—'}</p></div>
                      <div><span className="text-slate-400 text-xs">Emisión seguro</span><p className="text-slate-700 dark:text-slate-300">{formatDateShort(d.fechaEmisionSeguro)}</p></div>
                      <div><span className="text-slate-400 text-xs">Vencimiento seguro</span><p className="text-slate-700 dark:text-slate-300">{formatDateShort(d.fechaVencimientoSeguro)}</p></div>
                      <div><span className="text-slate-400 text-xs">Fecha llegada</span><p className="text-slate-700 dark:text-slate-300">{formatDateShort(d.fechaLlegada)}</p></div>
                      <div><span className="text-slate-400 text-xs">Lote / Mes</span><p className="text-slate-700 dark:text-slate-300">{d.loteMes || '—'}</p></div>
                      {d.fechaEntrega && (
                        <>
                          <div><span className="text-slate-400 text-xs">Fecha entrega</span><p className="text-slate-700 dark:text-slate-300">{combinarFechaHora(d.fechaEntrega, d.horaEntrega)}</p></div>
                          <div><span className="text-slate-400 text-xs">Entregado por</span><p className="text-slate-700 dark:text-slate-300">{d.empleadoEntrego || '—'}</p></div>
                        </>
                      )}
                    </div>
                    {(d.observaciones || d.observacionesEntrega) && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                        {d.observaciones && <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Observaciones:</strong> {d.observaciones}</p>}
                        {d.observacionesEntrega && <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Obs. entrega:</strong> {d.observacionesEntrega}</p>}
                      </div>
                    )}
                    <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <button onClick={() => { setShowDetail(false); setDetailPlastico(null); handleEdit(d); }} className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 cursor-pointer flex items-center justify-center gap-1">
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button onClick={() => { setShowDetail(false); setDetailPlastico(null); handlePrint(d); }} className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 cursor-pointer flex items-center justify-center gap-1">
                        <Printer className="w-3.5 h-3.5" /> Imprimir
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}