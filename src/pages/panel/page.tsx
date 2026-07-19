import { useEffect, useState, useMemo } from 'react';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { formatCurrency, getDaysUntilExpiry } from '@/utils/formatters';
import { TrendingUp, AlertTriangle, Calendar, DollarSign, CreditCard } from 'lucide-react';
import type { SupplierPurchase } from '@/types';
import StockInventarioPanel from './components/StockInventarioPanel';

type PanelTab = 'resumen' | 'inventario';

export default function PanelPage() {
  const { currentBranch } = useAuthStore();
  const { getTodaySales, getSalesStats, getLowStockProducts, getExpiringProducts, products, supplierPurchases } = usePOSStore();

  const [activeTab, setActiveTab] = useState<PanelTab>('resumen');
  const [stats, setStats] = useState({ total: 0, count: 0, average: 0 });
  const [todaySales, setTodaySales] = useState<ReturnType<typeof getTodaySales>>([]);
  const [lowStock, setLowStock] = useState<ReturnType<typeof getLowStockProducts>>([]);
  const [expiring, setExpiring] = useState<ReturnType<typeof getExpiringProducts>>([]);

  useEffect(() => {
    if (currentBranch) {
      setStats(getSalesStats(currentBranch.id));
      setTodaySales(getTodaySales(undefined, currentBranch.id));
      setLowStock(getLowStockProducts(currentBranch.id, 15));
      setExpiring(getExpiringProducts(30));
    }
  }, [currentBranch, getSalesStats, getTodaySales, getLowStockProducts, getExpiringProducts]);

  // Memoize heavy derived calculations
  const alertPurchases = useMemo(() => {
    const today = new Date();
    return supplierPurchases.filter((p) => {
      if (p.estadoPago === 'pagado') return false;
      if (!p.fechaLimitePago) return false;
      const limit = new Date(p.fechaLimitePago);
      const diffDays = Math.ceil((limit.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 5;
    }).sort((a, b) => {
      const da = new Date(a.fechaLimitePago!).getTime();
      const db = new Date(b.fechaLimitePago!).getTime();
      return da - db;
    });
  }, [supplierPurchases]);

  const totalProducts = useMemo(() => products.filter((p) => p.isActive).length, [products]);

  const totalStock = useMemo(() => {
    if (!currentBranch) return 0;
    return products.reduce((sum, p) => sum + (p.stock[currentBranch.id] || 0), 0);
  }, [products, currentBranch]);

  const pendingPurchasesTotal = useMemo(() => {
    return supplierPurchases
      .filter((p) => p.estadoPago !== 'pagado')
      .reduce((sum, p) => {
        const abonado = (p.abonos || []).reduce((s, a) => s + a.monto, 0);
        return sum + (p.total - abonado);
      }, 0);
  }, [supplierPurchases]);

  const statCards = useMemo(() => [
    { label: 'Ventas Hoy', value: formatCurrency(stats.total), icon: DollarSign, color: 'emerald' },
    { label: 'Facturas Hoy', value: stats.count.toString(), icon: TrendingUp, color: 'sky' },
    { label: 'Ticket Promedio', value: formatCurrency(stats.average), icon: TrendingUp, color: 'violet' },
    { label: 'Cuentas por Pagar', value: formatCurrency(pendingPurchasesTotal), icon: CreditCard, color: 'rose' },
  ], [stats, pendingPurchasesTotal]);

  const today = new Date();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-sora font-bold text-slate-800 dark:text-white">Panel de Control</h1>
          <p className="text-slate-500 dark:text-slate-400">Resumen de operaciones de hoy</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('resumen')}
          className={`px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-all ${
            activeTab === 'resumen'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <i className="ri-dashboard-line mr-1.5"></i>
          Resumen del Día
        </button>
        <button
          onClick={() => setActiveTab('inventario')}
          className={`px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-all ${
            activeTab === 'inventario'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <i className="ri-store-2-line mr-1.5"></i>
          Inventario por Sucursal
          {lowStock.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-xs">
              {lowStock.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'inventario' && <StockInventarioPanel />}

      {activeTab === 'resumen' && (<>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-${card.color}-100 dark:bg-${card.color}-900/30 flex items-center justify-center`}>
                <card.icon className={`w-6 h-6 text-${card.color}-600 dark:text-${card.color}-400`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {alertPurchases.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">
              Facturas de Compra Próximas a Vencer ({alertPurchases.length})
            </h2>
          </div>
          <div className="space-y-2">
            {alertPurchases.map((p) => {
              const limit = new Date(p.fechaLimitePago!);
              const diffDays = Math.ceil((limit.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = diffDays < 0;
              const abonado = (p.abonos || []).reduce((s, a) => s + a.monto, 0);
              const pendiente = p.total - abonado;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
                    isOverdue
                      ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
                      : 'bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <div>
                    <span className={`font-medium ${isOverdue ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
                      {p.supplierName} — {p.supplierCompany}
                    </span>
                    {p.invoiceNumber && (
                      <span className="ml-2 text-xs opacity-70">#{p.invoiceNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-mono font-semibold ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {formatCurrency(pendiente)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      isOverdue
                        ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                        : 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                    }`}>
                      {isOverdue ? `Vencida hace ${Math.abs(diffDays)}d` : `Vence en ${diffDays}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Stock Bajo ({lowStock.length})
            </h2>
          </div>
          <div className="max-h-64 overflow-auto">
            {lowStock.length === 0 ? (
              <p className="p-4 text-slate-500 text-center">No hay productos con stock bajo</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Producto</th>
                    <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.slice(0, 10).map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="p-3">
                        <p className="font-medium text-slate-800 dark:text-white">{p.commercialName}</p>
                        <p className="text-xs text-slate-500">{p.genericName}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-medium">
                          {p.stock[currentBranch?.id || ''] || 0} unid.
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-rose-500" />
              Por Vencer ({expiring.length})
            </h2>
          </div>
          <div className="max-h-64 overflow-auto">
            {expiring.length === 0 ? (
              <p className="p-4 text-slate-500 text-center">No hay medicamentos próximos a vencer</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Producto</th>
                    <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.slice(0, 10).map((p) => {
                    const days = getDaysUntilExpiry(p.expiryDate);
                    return (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="p-3">
                          <p className="font-medium text-slate-800 dark:text-white">{p.commercialName}</p>
                          <p className="text-xs text-slate-500">{p.lab}</p>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            days <= 7 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                            days <= 30 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' :
                            'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                          }`}>
                            {days} días
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-white">Ventas del Día</h2>
        </div>
        <div className="overflow-x-auto">
          {todaySales.length === 0 ? (
            <p className="p-8 text-slate-500 text-center">No hay ventas registradas hoy</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Hora</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Cajero</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">NCF</th>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Cliente</th>
                  <th className="text-right p-3 text-slate-600 dark:text-slate-400 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.slice(0, 20).map((sale) => (
                  <tr key={sale.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="p-3 text-slate-800 dark:text-slate-200">
                      {new Date(sale.timestamp).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{sale.cashierName}</td>
                    <td className="p-3 font-mono text-xs text-slate-600 dark:text-slate-400">{sale.ncf}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{sale.clientName}</td>
                    <td className="p-3 text-right font-mono font-medium text-slate-800 dark:text-white">{formatCurrency(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </>)}
    </div>
  );
}