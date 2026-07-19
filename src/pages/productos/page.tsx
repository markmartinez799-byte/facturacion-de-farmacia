import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { useFastSearch } from '@/hooks/useFastSearch';
import { formatCurrency, formatDateShort } from '@/utils/formatters';
import { Search, Plus, Edit2, Trash2, Package, Upload, Download, X, MapPin, ChevronLeft, ChevronRight, SlidersHorizontal, Loader2, ArrowUp, ImageIcon } from 'lucide-react';
import type { Product } from '@/types';
import ExcelImportModal from './components/ExcelImportModal';
import ProductoModal from './components/ProductoModal';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 100;

export default function ProductosPage() {
  const { products, deleteProduct, isLoaded } = usePOSStore();
  const { branches } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [filterItbis, setFilterItbis] = useState<'all' | 'yes' | 'no'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterEstante, setFilterEstante] = useState<string>('all');
  const [filterOffer, setFilterOffer] = useState<'all' | 'yes' | 'no'>('all');
  const [filterLetter, setFilterLetter] = useState<string>('all');
  const [filterLab, setFilterLab] = useState<string>('all');
  const [filterPriceMin, setFilterPriceMin] = useState<string>('');
  const [filterPriceMax, setFilterPriceMax] = useState<string>('');
  const [filterStockMin, setFilterStockMin] = useState<string>('');
  const [filterStockMax, setFilterStockMax] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [migratingImages, setMigratingImages] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  // Check for base64 images that need migration
  const base64ImageCount = useMemo(() => {
    return products.filter((p) => p.image && p.image.startsWith('data:')).length;
  }, [products]);

  const handleMigrateImages = async () => {
    setMigratingImages(true);
    setMigrationResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setMigrationResult('No hay sesión activa. Inicia sesión primero.');
        setMigratingImages(false);
        return;
      }
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/migrate-product-images`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const result = await response.json();
      if (result.total !== undefined) {
        setMigrationResult(`${result.migrated} imágenes migradas, ${result.failed} fallaron de ${result.total} total.`);
      } else if (result.success) {
        setMigrationResult('Imagen migrada correctamente.');
      } else {
        setMigrationResult(`Error: ${result.error || result.reason || 'Desconocido'}`);
      }
    } catch (err) {
      setMigrationResult(`Error de conexión: ${err instanceof Error ? err.message : 'Desconocido'}`);
    } finally {
      setMigratingImages(false);
    }
  };

  const {
    searchQuery,
    setSearchQuery,
    filteredProducts: fastSearchResults,
  } = useFastSearch(products);

  useEffect(() => {
    const main = document.getElementById('main-scroll');
    if (!main) return;
    const handleScroll = () => {
      setShowScrollTop(main.scrollTop > 500);
    };
    main.addEventListener('scroll', handleScroll);
    return () => main.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const main = document.getElementById('main-scroll');
    main?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const labs = useMemo(
    () => Array.from(new Set(products.map((p) => p.lab).filter((l) => l && l.trim()))).sort(),
    [products]
  );
  const estantes = useMemo(
    () => Array.from(new Set(products.map((p) => p.estante).filter(Boolean))) as string[],
    [products]
  );
  const alphabet = useMemo(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), []);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const letterHasProducts = useMemo(() => {
    const map = new Map<string, boolean>();
    alphabet.forEach((letter) => {
      const has = activeProducts.some(
        (p) =>
          p.commercialName.toUpperCase().startsWith(letter) ||
          (p.code && p.code.toUpperCase().startsWith(letter))
      );
      map.set(letter, has);
    });
    return map;
  }, [activeProducts, alphabet]);

  const filteredProducts = useMemo(() => {
    const priceMin = parseFloat(filterPriceMin) || 0;
    const priceMax = parseFloat(filterPriceMax) || Infinity;
    const stockMin = parseInt(filterStockMin, 10) || 0;
    const stockMax = parseInt(filterStockMax, 10) || Infinity;

    return fastSearchResults.filter((p) => {
      const matchLetter =
        filterLetter === 'all' ||
        p.commercialName.toUpperCase().startsWith(filterLetter) ||
        (p.code && p.code.toUpperCase().startsWith(filterLetter));
      const matchItbis =
        filterItbis === 'all' ||
        (filterItbis === 'yes' && p.itbisApplicable) ||
        (filterItbis === 'no' && !p.itbisApplicable);
      const matchActive =
        filterActive === 'all' ||
        (filterActive === 'active' && p.isActive) ||
        (filterActive === 'inactive' && !p.isActive);
      const matchEstante = filterEstante === 'all' || p.estante === filterEstante;
      const matchLab = filterLab === 'all' || p.lab === filterLab;
      const matchOffer =
        filterOffer === 'all' ||
        (filterOffer === 'yes' && !!p.offer) ||
        (filterOffer === 'no' && !p.offer);
      const matchPrice = p.price >= priceMin && p.price <= priceMax;
      const totalStock = Object.values(p.stock).reduce((s, q) => s + (q || 0), 0);
      const matchStock = totalStock >= stockMin && totalStock <= stockMax;
      return matchItbis && matchActive && matchEstante && matchLetter && matchLab && matchPrice && matchStock && matchOffer;
    });
  }, [fastSearchResults, filterItbis, filterActive, filterEstante, filterLetter, filterLab, filterPriceMin, filterPriceMax, filterStockMin, filterStockMax, filterOffer]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterItbis, filterActive, filterEstante, filterLetter, filterLab, filterPriceMin, filterPriceMax, filterStockMin, filterStockMax, filterOffer]);

  const handleOpenModal = (product?: Product) => {
    setEditingProduct(product || null);
    setShowModal(true);
  };

  const hasActiveFilters =
    searchQuery ||
    filterItbis !== 'all' ||
    filterActive !== 'all' ||
    filterEstante !== 'all' ||
    filterLetter !== 'all' ||
    filterLab !== 'all' ||
    filterPriceMin ||
    filterPriceMax ||
    filterStockMin ||
    filterStockMax ||
    filterOffer !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterItbis('all');
    setFilterActive('all');
    setFilterEstante('all');
    setFilterLetter('all');
    setFilterLab('all');
    setFilterPriceMin('');
    setFilterPriceMax('');
    setFilterStockMin('');
    setFilterStockMax('');
    setFilterOffer('all');
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    const headers = ['Nombre Comercial', 'Codigo', 'Codigo Barras', 'Laboratorio', 'Presentacion', 'Estante', 'Posicion', 'Costo', 'Precio', 'Stock Total', 'Lote', 'Vence'];
    const rows = filteredProducts.map((p) => {
      const totalStock = Object.values(p.stock).reduce((s, q) => s + (q || 0), 0);
      return [
        p.commercialName,
        p.code || '',
        p.barcode || '',
        p.lab || '',
        p.presentation || '',
        p.estante || '',
        p.posicion || '',
        String(p.purchaseCost || ''),
        String(p.price),
        String(totalStock),
        p.lote || '',
        p.expiryDate || '',
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-300 font-medium">Cargando productos...</p>
        <p className="text-xs text-slate-400 mt-1">Esto puede tomar unos segundos si tienes muchos productos</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-sora font-bold text-slate-800 dark:text-white">Productos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {products.length > 0 ? (
              <>{products.length.toLocaleString()} productos cargados · {filteredProducts.length.toLocaleString()} visibles</>
            ) : (
              'Gestión de inventario y medicamentos'
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {base64ImageCount > 0 && (
            <button
              onClick={handleMigrateImages}
              disabled={migratingImages}
              className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg flex items-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-900/50 cursor-pointer whitespace-nowrap text-sm disabled:opacity-60"
              title="Migrar imágenes base64 a la nube para mejor rendimiento"
            >
              {migratingImages ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Migrando...</>
              ) : (
                <><ImageIcon className="w-4 h-4" /> Migrar {base64ImageCount} imágenes</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-2 hover:bg-slate-200 cursor-pointer whitespace-nowrap text-sm"
          >
            <Upload className="w-4 h-4" /> Importar
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-2 hover:bg-slate-200 cursor-pointer whitespace-nowrap text-sm"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap text-sm"
          >
            <Plus className="w-4 h-4" /> Nuevo Producto
          </button>
        </div>
      </div>

      {migrationResult && (
        <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${
          migrationResult.includes('Error') || migrationResult.includes('fallaron')
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
        }`}>
          <i className={migrationResult.includes('Error') || migrationResult.includes('fallaron') ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}></i>
          <span>{migrationResult}</span>
          <button onClick={() => setMigrationResult(null)} className="ml-auto text-current opacity-60 hover:opacity-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          {/* Búsqueda rápida */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, código, estante..."
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
                  onClick={clearAllFilters}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Filtros avanzados */}
          {showAdvanced && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 animate-fade-in">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtros avanzados</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Laboratorio */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Laboratorio</label>
                  <select
                    value={filterLab}
                    onChange={(e) => setFilterLab(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer"
                  >
                    <option value="all">Todos los laboratorios</option>
                    {labs.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                {/* Precio */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Precio mínimo — máximo</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={filterPriceMin}
                      onChange={(e) => setFilterPriceMin(e.target.value)}
                      placeholder="Min"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={filterPriceMax}
                      onChange={(e) => setFilterPriceMax(e.target.value)}
                      placeholder="Max"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Stock */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Stock mínimo — máximo</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={filterStockMin}
                      onChange={(e) => setFilterStockMin(e.target.value)}
                      placeholder="Min"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      value={filterStockMax}
                      onChange={(e) => setFilterStockMax(e.target.value)}
                      placeholder="Max"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Estante */}
                {estantes.length > 0 && (
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Estante</label>
                    <select
                      value={filterEstante}
                      onChange={(e) => setFilterEstante(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      {estantes.map((e) => <option key={e} value={e}>Est. {e}</option>)}
                    </select>
                  </div>
                )}

                {/* Ofertas */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Oferta</label>
                  <select
                    value={filterOffer}
                    onChange={(e) => setFilterOffer(e.target.value as 'all' | 'yes' | 'no')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer"
                  >
                    <option value="all">Todos</option>
                    <option value="yes">Con oferta</option>
                    <option value="no">Sin oferta</option>
                  </select>
                </div>

                {/* ITBIS */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">ITBIS</label>
                  <select
                    value={filterItbis}
                    onChange={(e) => setFilterItbis(e.target.value as 'all' | 'yes' | 'no')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer"
                  >
                    <option value="all">Todos</option>
                    <option value="yes">Con ITBIS</option>
                    <option value="no">Sin ITBIS</option>
                  </select>
                </div>

                {/* Estado */}
                <div>
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Estado</label>
                  <select
                    value={filterActive}
                    onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm cursor-pointer"
                  >
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Filtro por abecedario */}
          <div className="mt-3 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setFilterLetter('all')}
              className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                filterLetter === 'all'
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Todos
            </button>
            {alphabet.map((letter) => {
              const hasProducts = letterHasProducts.get(letter) ?? false;
              return (
                <button
                  key={letter}
                  onClick={() => setFilterLetter(letter)}
                  disabled={!hasProducts}
                  className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    filterLetter === letter
                      ? 'bg-emerald-600 text-white'
                      : hasProducts
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Producto</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Código</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Laboratorio</th>
                <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Presentación</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Ubicación</th>
                <th className="text-right p-3 text-slate-600 dark:text-slate-400 font-medium">Costo</th>
                <th className="text-right p-3 text-slate-600 dark:text-slate-400 font-medium">Precio</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Stock</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Vence</th>
                <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const totalStock = Object.values(product.stock).reduce((s, q) => s + (q || 0), 0);
                return (
                  <tr key={product.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {product.image ? (
                            <img src={product.image} alt="" className="w-full h-full object-cover rounded" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : null}
                          {(!product.image) && (
                            <Package className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800 dark:text-white">{product.commercialName}</p>
                            {product.offer && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                {product.offer}
                              </span>
                            )}
                          </div>
                          {product.lote && (
                            <p className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold tracking-wide">Lote: {product.lote}</p>
                          )}
                          {!product.lote && product.code && (
                            <p className="text-xs font-mono text-slate-400 dark:text-slate-500">Sin lote</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      {product.code ? (
                        <span className="inline-flex items-center font-mono text-sm font-bold tracking-wide px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {product.code}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{product.lab}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{product.presentation}</td>
                    <td className="p-3 text-center">
                      {product.estante ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                          <MapPin className="w-3 h-3" />
                          {product.posicion || `Est. ${product.estante}`}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                      {product.purchaseCost ? formatCurrency(product.purchaseCost) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">{formatCurrency(product.price)}</td>
                    <td className="p-3 text-center">
                      {branches.filter((b) => b.isActive).length > 0 ? (
                        <div className="flex flex-col gap-0.5 items-center">
                          {branches.filter((b) => b.isActive).map((b) => {
                            const qty = product.stock[b.id] || 0;
                            return (
                              <span key={b.id} className={`text-xs font-mono ${qty === 0 ? 'text-slate-300 dark:text-slate-600' : qty <= 5 ? 'text-red-500 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                                {b.name.split(' ')[0]}: <strong>{qty}</strong>
                              </span>
                            );
                          })}
                          <span className="text-[10px] text-slate-400 mt-0.5">Total: {totalStock}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center text-slate-700 dark:text-slate-300 text-xs">{formatDateShort(product.expiryDate)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenModal(product)}
                          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteProduct(product.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No se encontraron productos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredProducts.length > PAGE_SIZE && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1} – {Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (arr[idx - 1] as number) !== p - 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  typeof p === 'string' ? (
                    <span key={`dots-${i}`} className="px-2 text-xs text-slate-400">{p}</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        currentPage === p
                          ? 'bg-emerald-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botón scroll to top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 cursor-pointer flex items-center justify-center transition-all duration-300 animate-fade-in"
          title="Volver arriba"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      {showImportModal && createPortal(
        <ExcelImportModal onClose={() => setShowImportModal(false)} />,
        document.body
      )}

      {showModal && (
        <ProductoModal
          product={editingProduct}
          onClose={() => { setShowModal(false); setEditingProduct(null); }}
        />
      )}
    </div>
  );
}