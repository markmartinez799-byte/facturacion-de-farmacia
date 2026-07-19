import { useState, useRef, useEffect } from 'react';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import type { Product } from '@/types';
import { X, Search, MapPin, Package, ChevronDown, ChevronUp, AlertCircle, Info, FileText } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

interface BuscadorStockModalProps {
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

interface ProductStockRow {
  product: Product;
  branchStocks: { branchId: string; branchName: string; stock: number; isCurrent: boolean }[];
  totalStock: number;
  expanded: boolean;
}

export default function BuscadorStockModal({ onClose, onAddToCart }: BuscadorStockModalProps) {
  const { products } = usePOSStore();
  const { branches, currentBranch } = useAuthStore();
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailIds, setDetailIds] = useState<Set<string>>(new Set());
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const activeBranches = branches.filter((b) => b.isActive);

  const filteredProducts: ProductStockRow[] = products
    .filter((p) => {
      if (!p.isActive) return false;
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return (
        p.commercialName.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        p.lab.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.presentation.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q))
      );
    })
    .map((p) => {
      const branchStocks = activeBranches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        stock: p.stock[b.id] ?? 0,
        isCurrent: b.id === currentBranch?.id,
      }));
      const totalStock = branchStocks.reduce((s, b) => s + b.stock, 0);
      return { product: p, branchStocks, totalStock, expanded: expandedIds.has(p.id) };
    })
    .filter((row) => {
      if (filterBranch === 'all') return true;
      if (filterBranch === 'sin_stock') return row.totalStock === 0;
      if (filterBranch === 'con_stock') return row.totalStock > 0;
      const bs = row.branchStocks.find((b) => b.branchId === filterBranch);
      return bs ? bs.stock > 0 : false;
    })
    .sort((a, b) => {
      const aCurrentStock = a.branchStocks.find((b) => b.isCurrent)?.stock ?? 0;
      const bCurrentStock = b.branchStocks.find((b) => b.isCurrent)?.stock ?? 0;
      if (aCurrentStock !== bCurrentStock) return bCurrentStock - aCurrentStock;
      return b.totalStock - a.totalStock;
    });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getStockColor = (stock: number) => {
    if (stock === 0) return 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';
    if (stock <= 5) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
    return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col animate-bounce-in" style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-500" />
              Buscador de Stock por Sucursal
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, genérico, laboratorio, código o descripción..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterBranch('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                filterBranch === 'all'
                  ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Todas las sucursales
            </button>
            <button
              onClick={() => setFilterBranch('con_stock')}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                filterBranch === 'con_stock'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
              }`}
            >
              Con stock
            </button>
            {activeBranches.map((b) => (
              <button
                key={b.id}
                onClick={() => setFilterBranch(b.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  filterBranch === b.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/30'
                }`}
              >
                {b.name.replace('GENOSAN – ', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div className="flex-shrink-0 px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
            {query && <span className="ml-1">para &ldquo;<strong>{query}</strong>&rdquo;</span>}
          </p>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No se encontraron productos</p>
              <p className="text-xs mt-1">Intenta con otro nombre o código</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredProducts.map((row) => {
                const currentStock = row.branchStocks.find((b) => b.isCurrent)?.stock ?? 0;
                const isExpanded = expandedIds.has(row.product.id);
                const isDetailOpen = detailIds.has(row.product.id);
                const hasDetail = !!(row.product.descripcion || row.product.estante);

                return (
                  <div key={row.product.id} className="transition-all">
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      {/* Product image */}
                      <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        {row.product.image ? (
                          <img src={row.product.image} alt={row.product.commercialName} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                          {row.product.commercialName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {row.product.genericName} · {row.product.presentation} · {row.product.lab}
                        </p>
                        {row.product.estante && (
                          <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            <MapPin className="w-3 h-3" />
                            Est. {row.product.estante}{row.product.posicion ? ` · Pos. ${row.product.posicion}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Price */}
                      <div className="flex-shrink-0 text-right hidden sm:block">
                        <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.product.price)}
                        </p>
                      </div>

                      {/* Current branch stock badge */}
                      <div className={`flex-shrink-0 text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${getStockColor(currentStock)}`}>
                        {currentStock === 0 ? '0 und.' : `${currentStock} und.`}
                      </div>

                      {/* Total stock */}
                      <div className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500 hidden sm:block whitespace-nowrap">
                        Total: <span className="font-semibold text-slate-600 dark:text-slate-300">{row.totalStock}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Detalle button */}
                        <button
                          onClick={() => toggleDetail(row.product.id)}
                          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                            isDetailOpen
                              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : hasDetail
                              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-pointer'
                          }`}
                          title="Ver descripción y ubicación"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Detalle</span>
                        </button>

                        <button
                          onClick={() => toggleExpand(row.product.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                          title="Ver stock por sucursal"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Detail panel — descripcion + ubicacion */}
                    {isDetailOpen && (
                      <div className="px-4 pb-3 bg-indigo-50/60 dark:bg-indigo-900/10 border-t border-indigo-100 dark:border-indigo-900/30">
                        <div className="pt-3 space-y-2">
                          {/* Ubicacion */}
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                              <MapPin className="w-4 h-4 text-amber-500" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Ubicación en farmacia</p>
                              {row.product.estante ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold">
                                    Estante: {row.product.estante}
                                  </span>
                                  {row.product.posicion && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-800">
                                      Posición: {row.product.posicion}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 italic">Sin ubicación registrada</p>
                              )}
                            </div>
                          </div>

                          {/* Descripcion */}
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-indigo-500" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Descripción / Indicaciones</p>
                              {row.product.descripcion ? (
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/40">
                                  {row.product.descripcion}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400 italic">Sin descripción registrada</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Expanded branch detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 bg-slate-50/70 dark:bg-slate-900/40">
                        {row.totalStock === 0 && (
                          <div className="flex items-center gap-2 p-2.5 mb-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                            <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                              Sin stock en ninguna sucursal — considera hacer un pedido al proveedor
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {row.branchStocks.map((bs) => (
                            <div
                              key={bs.branchId}
                              className={`flex items-center justify-between p-2.5 rounded-lg border ${
                                bs.isCurrent
                                  ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                  : bs.stock > 0
                                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                                  : 'border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-900/10 opacity-70'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex items-center gap-1">
                                  {bs.branchName.replace('GENOSAN – ', '')}
                                  {bs.isCurrent && (
                                    <span className="text-xs px-1 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-[10px]">
                                      Actual
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className={`ml-2 text-xs font-bold font-mono px-2 py-0.5 rounded-md flex-shrink-0 ${getStockColor(bs.stock)}`}>
                                {`${bs.stock} und.`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
