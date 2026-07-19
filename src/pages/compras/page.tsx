import { useState, useMemo } from 'react';
import { usePOSStore } from '@/store/posStore';
import { formatCurrency, formatDateShort } from '@/utils/formatters';
import type { SupplierPurchase } from '@/types';
import NuevaCompraModal from './components/NuevaCompraModal';
import DetalleCompraModal from './components/DetalleCompraModal';

type FilterStatus = 'todos' | 'pagado' | 'pendiente' | 'vencido';

export default function ComprasPage() {
  const { supplierPurchases, suppliers } = usePOSStore();
  const [showNueva, setShowNueva] = useState(false);
  const [selected, setSelected] = useState<SupplierPurchase | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Calcular estado real según fecha actual
  const purchasesWithStatus = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return supplierPurchases.map((p) => {
      if (p.estadoPago === 'pagado') return p;
      if (p.tipoPago === 'credito' && p.fechaLimitePago) {
        const limit = new Date(p.fechaLimitePago);
        limit.setHours(0, 0, 0, 0);
        if (limit < today) return { ...p, estadoPago: 'vencido' as const };
      }
      return p;
    });
  }, [supplierPurchases]);

  const filtered = useMemo(() => {
    return purchasesWithStatus.filter((p) => {
      if (filterStatus !== 'todos' && p.estadoPago !== filterStatus) return false;
      if (filterSupplier && p.supplierId !== filterSupplier) return false;
      if (filterDateFrom && p.purchaseDate < filterDateFrom) return false;
      if (filterDateTo && p.purchaseDate > filterDateTo) return false;
      return true;
    });
  }, [purchasesWithStatus, filterStatus, filterSupplier, filterDateFrom, filterDateTo]);

  // Stats dashboard
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);

    const totalPendiente = purchasesWithStatus
      .filter((p) => p.estadoPago === 'pendiente' || p.estadoPago === 'vencido')
      .reduce((s, p) => {
        const abonado = (p.abonos || []).reduce((a, b) => a + b.monto, 0);
        return s + Math.max(0, p.total - abonado);
      }, 0);

    const proxVencer = purchasesWithStatus.filter((p) => {
      if (p.estadoPago !== 'pendiente' || !p.fechaLimitePago) return false;
      const limit = new Date(p.fechaLimitePago);
      limit.setHours(0, 0, 0, 0);
      return limit >= today && limit <= in5Days;
    });

    const vencidas = purchasesWithStatus.filter((p) => p.estadoPago === 'vencido');
    const totalCompras = purchasesWithStatus.reduce((s, p) => s + p.total, 0);

    // Rentabilidad estimada
    const gananciaEstimada = purchasesWithStatus.reduce((s, p) => {
      return s + p.items.reduce((si, i) => {
        const sp = (i as { salePrice?: number }).salePrice ?? 0;
        if (sp <= 0) return si;
        return si + (sp - i.unitCost) * i.quantity;
      }, 0);
    }, 0);

    // Productos próximos a vencer (lotes en compras)
    const lotesProxVencer = purchasesWithStatus.flatMap((p) =>
      p.items.filter((i) => {
        if (!i.expiryDate) return false;
        const exp = new Date(i.expiryDate);
        const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diff > 0 && diff <= 60;
      })
    );

    return { totalPendiente, proxVencer, vencidas, totalCompras, gananciaEstimada, lotesProxVencer };
  }, [purchasesWithStatus]);

  const getDaysUntilDue = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (p: SupplierPurchase) => {
    const days = getDaysUntilDue(p.fechaLimitePago);
    if (p.estadoPago === 'pagado') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (p.estadoPago === 'vencido') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (days !== null && days <= 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
  };

  const getStatusLabel = (p: SupplierPurchase) => {
    const days = getDaysUntilDue(p.fechaLimitePago);
    if (p.estadoPago === 'pagado') return 'Pagado';
    if (p.estadoPago === 'vencido') return 'Vencido';
    if (days !== null && days <= 5) return `Vence en ${days}d`;
    return 'Pendiente';
  };

  const getRowBg = (p: SupplierPurchase) => {
    if (p.estadoPago === 'vencido') return 'border-l-4 border-l-red-400';
    const days = getDaysUntilDue(p.fechaLimitePago);
    if (p.estadoPago === 'pendiente' && days !== null && days <= 5) return 'border-l-4 border-l-amber-400';
    return '';
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Compras a Proveedores</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Control de pagos, créditos y cuentas por pagar</p>
        </div>
        <button
          onClick={() => setShowNueva(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap text-sm"
        >
          <i className="ri-add-line"></i> Nueva Compra
        </button>
      </div>

      {/* Alertas */}
      {stats.vencidas.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
          <i className="ri-error-warning-fill text-red-500 text-xl mt-0.5"></i>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300 text-sm">
              {stats.vencidas.length} factura(s) vencida(s) sin pagar
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Contacta a los proveedores para regularizar los pagos pendientes.
            </p>
          </div>
          <button onClick={() => setFilterStatus('vencido')} className="ml-auto text-xs text-red-600 underline cursor-pointer whitespace-nowrap">Ver todas</button>
        </div>
      )}
      {stats.proxVencer.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
          <i className="ri-alarm-warning-fill text-amber-500 text-xl mt-0.5"></i>
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm">
              {stats.proxVencer.length} factura(s) vencen en los próximos 5 días
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {stats.proxVencer.map((p) => p.supplierCompany).join(', ')}
            </p>
          </div>
          <button onClick={() => setFilterStatus('pendiente')} className="ml-auto text-xs text-amber-600 underline cursor-pointer whitespace-nowrap">Ver todas</button>
        </div>
      )}

      {/* Dashboard stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
              <i className="ri-shopping-bag-3-line text-slate-600 dark:text-slate-300 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Invertido</p>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{formatCurrency(stats.totalCompras)}</p>
            </div>
          </div>
        </div>

        <div className={`rounded-xl border p-4 ${stats.gananciaEstimada < 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${stats.gananciaEstimada < 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
              <i className={`${stats.gananciaEstimada < 0 ? 'ri-arrow-down-circle-line text-red-600' : 'ri-arrow-up-circle-line text-emerald-600'} text-lg`}></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Ganancia Estimada</p>
              <p className={`text-lg font-bold ${stats.gananciaEstimada < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats.gananciaEstimada >= 0 ? '+' : ''}{formatCurrency(stats.gananciaEstimada)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <i className="ri-time-line text-amber-600 dark:text-amber-400 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Por Pagar</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(stats.totalPendiente)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <i className="ri-medicine-bottle-line text-amber-600 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Lotes Próx. Vencer (60d)</p>
              <p className="text-lg font-bold text-amber-600">{stats.lotesProxVencer.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <i className="ri-alarm-warning-line text-orange-600 dark:text-orange-400 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Facturas Vencen (5d)</p>
              <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{stats.proxVencer.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
              <i className="ri-error-warning-line text-red-600 dark:text-red-400 text-lg"></i>
            </div>
            <div>
              <p className="text-xs text-slate-400">Facturas Vencidas</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{stats.vencidas.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Estado pills */}
          <div className="flex gap-1 flex-wrap">
            {(['todos', 'pagado', 'pendiente', 'vencido'] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${
                  filterStatus === s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
                {s !== 'todos' && (
                  <span className="ml-1">({purchasesWithStatus.filter((p) => p.estadoPago === s).length})</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap ml-auto">
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
            </select>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs" />
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs" />
            {(filterSupplier || filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterSupplier(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="px-2 py-1.5 text-xs text-slate-500 hover:text-red-500 cursor-pointer whitespace-nowrap">
                <i className="ri-close-line"></i> Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de compras */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <i className="ri-shopping-bag-3-line text-5xl mb-3 block opacity-30"></i>
          <p>No hay compras que coincidan con los filtros</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((purchase) => {
            const abonado = (purchase.abonos || []).reduce((s, a) => s + a.monto, 0);
            const saldo = Math.max(0, purchase.total - abonado);
            const days = getDaysUntilDue(purchase.fechaLimitePago);
            return (
              <div
                key={purchase.id}
                onClick={() => setSelected(purchase)}
                className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-all ${getRowBg(purchase)}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg mt-0.5">
                      <i className="ri-building-2-line text-slate-500 dark:text-slate-400"></i>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 dark:text-white text-sm">{purchase.supplierCompany}</span>
                        <span className="text-slate-400 text-xs">— {purchase.supplierName}</span>
                        {purchase.invoiceNumber && (
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-xs font-mono">{purchase.invoiceNumber}</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(purchase)}`}>
                          {getStatusLabel(purchase)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">
                          <i className="ri-calendar-line mr-1"></i>{formatDateShort(purchase.fechaFacturacion || purchase.purchaseDate)}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${purchase.tipoPago === 'contado' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                          {purchase.tipoPago === 'contado' ? 'Contado' : 'Crédito'}
                        </span>
                        {purchase.fechaLimitePago && (
                          <span className={`text-xs ${days !== null && days <= 5 ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                            <i className="ri-calendar-check-line mr-1"></i>Límite: {formatDateShort(purchase.fechaLimitePago)}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{purchase.items.length} producto(s)</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right sm:text-right pl-12 sm:pl-0">
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(purchase.total)}</p>
                    {purchase.tipoPago === 'credito' && purchase.estadoPago !== 'pagado' && (
                      <p className="text-xs text-red-500">Saldo: {formatCurrency(saldo)}</p>
                    )}
                    {(purchase.abonos || []).length > 0 && (
                      <p className="text-xs text-slate-400">{purchase.abonos!.length} abono(s)</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNueva && <NuevaCompraModal onClose={() => setShowNueva(false)} />}
      {selected && <DetalleCompraModal purchase={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
