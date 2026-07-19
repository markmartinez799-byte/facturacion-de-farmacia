import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { usePOSStore } from '@/store/posStore';
import { formatCurrency } from '@/utils/formatters';
import type { Product } from '@/types';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  onClose: () => void;
}

interface CompraItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
  wholesalePrice: number;
  lote: string;
  expiryDate: string;
}

function calcMargin(cost: number, sale: number) {
  if (cost <= 0 || sale <= 0) return null;
  return ((sale - cost) / cost) * 100;
}

function MarginBadge({ cost, sale }: { cost: number; sale: number }) {
  const m = calcMargin(cost, sale);
  if (m === null) return null;
  const isLoss = m < 0;
  const isLow = m >= 0 && m < 10;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${
      isLoss ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
      isLow ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
    }`}>
      {isLoss ? <i className="ri-arrow-down-line text-[10px]"></i> : <i className="ri-arrow-up-line text-[10px]"></i>}
      {Math.abs(m).toFixed(1)}%
    </span>
  );
}

type CreditTerm = '1semana' | '1mes' | 'personalizado';

export default function NuevaCompraModal({ onClose }: Props) {
  const { suppliers, products, addSupplierPurchase } = usePOSStore();

  const [showScanner, setShowScanner] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const maxCreditDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  })();

  const [form, setForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    fechaFacturacion: today,
    tipoPago: 'contado' as 'contado' | 'credito',
    creditTerm: 'personalizado' as CreditTerm,
    fechaLimitePago: '',
    notas: '',
  });

  const [items, setItems] = useState<CompraItem[]>([
    { productId: '', productName: '', quantity: 1, unitCost: 0, salePrice: 0, wholesalePrice: 0, lote: '', expiryDate: '' },
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQueries, setSearchQueries] = useState<string[]>(['']);
  const [searchOpen, setSearchOpen] = useState<boolean[]>([false]);
  const searchRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleScan = (barcode: string) => {
    setShowScanner(false);
    const trimmed = barcode.trim();
    if (!trimmed) return;

    // Find product by exact barcode match
    const matched = products.find((p) => p.barcode?.trim() === trimmed || p.code?.trim() === trimmed);

    if (matched) {
      // Find first empty item or add new one
      const emptyIdx = items.findIndex((i) => !i.productId && !i.productName.trim());
      const targetIdx = emptyIdx >= 0 ? emptyIdx : items.length;

      if (emptyIdx < 0) {
        // Need to add a new row
        setItems((prev) => [...prev, {
          productId: '', productName: '', quantity: 1, unitCost: 0,
          salePrice: 0, wholesalePrice: 0, lote: '', expiryDate: ''
        }]);
        setSearchQueries((prev) => [...prev, '']);
        setSearchOpen((prev) => [...prev, false]);
      }

      // Fill the row after a tick so state is ready
      setTimeout(() => {
        setItems((prev) => {
          const next = [...prev];
          if (next[targetIdx]) {
            next[targetIdx] = {
              ...next[targetIdx],
              productId: matched.id,
              productName: matched.commercialName,
              unitCost: matched.purchaseCost || 0,
              salePrice: matched.price || 0,
              wholesalePrice: matched.wholesalePrice || 0,
            };
          }
          return next;
        });
        setSearchQueries((prev) => {
          const next = [...prev];
          next[targetIdx] = matched.commercialName;
          return next;
        });
      }, 50);
    } else {
      // No product found — open first empty search with the barcode text
      const emptyIdx = items.findIndex((i) => !i.productId && !i.productName.trim());
      const targetIdx = emptyIdx >= 0 ? emptyIdx : items.length;

      if (emptyIdx < 0) {
        setItems((prev) => [...prev, {
          productId: '', productName: '', quantity: 1, unitCost: 0,
          salePrice: 0, wholesalePrice: 0, lote: '', expiryDate: ''
        }]);
        setSearchQueries((prev) => [...prev, trimmed]);
        setSearchOpen((prev) => [...prev, true]);
      } else {
        setSearchQueries((prev) => {
          const next = [...prev];
          next[targetIdx] = trimmed;
          return next;
        });
        setSearchOpen((prev) => {
          const next = [...prev];
          next[targetIdx] = true;
          return next;
        });
      }
    }
  };

  const totals = useMemo(() => {
    const totalInversion = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const gananciaEstimada = items.reduce((s, i) => {
      const profit = i.salePrice > 0 ? (i.salePrice - i.unitCost) * i.quantity : 0;
      return s + profit;
    }, 0);
    return { totalInversion, gananciaEstimada };
  }, [items]);

  // Buscador inteligente: filtra por nombre comercial, genérico o código de barra
  const getFilteredProducts = (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return products
      .filter((p) => p.isActive)
      .filter((p) =>
        p.commercialName.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.lab.toLowerCase().includes(q)
      )
      .slice(0, 8);
  };

  const handleSearchChange = (idx: number, value: string) => {
    const next = [...searchQueries];
    next[idx] = value;
    setSearchQueries(next);
    const openNext = [...searchOpen];
    openNext[idx] = value.trim().length > 0;
    setSearchOpen(openNext);
  };

  const handleSelectProduct = (idx: number, prod: Product) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        productId: prod.id,
        productName: prod.commercialName,
        unitCost: prod.purchaseCost || 0,
        salePrice: prod.price || 0,
        wholesalePrice: prod.wholesalePrice || 0,
      };
      return next;
    });
    const nextQ = [...searchQueries];
    nextQ[idx] = prod.commercialName;
    setSearchQueries(nextQ);
    const openNext = [...searchOpen];
    openNext[idx] = false;
    setSearchOpen(openNext);
  };

  const handleCreditTermChange = (term: CreditTerm) => {
    let fechaLimite = '';
    if (term === '1semana') {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      fechaLimite = d.toISOString().split('T')[0];
    } else if (term === '1mes') {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      fechaLimite = d.toISOString().split('T')[0];
    }
    setForm((f) => ({ ...f, creditTerm: term, fechaLimitePago: fechaLimite }));
  };

  const validate = (allowMissingDates = false) => {
    const e: Record<string, string> = {};
    const w: string[] = [];

    if (!form.supplierId) e.supplierId = 'Selecciona un proveedor';

    if (form.tipoPago === 'credito') {
      if (!form.fechaLimitePago) {
        e.fechaLimitePago = 'La fecha límite es obligatoria para crédito';
      } else if (form.fechaLimitePago > maxCreditDate) {
        e.fechaLimitePago = 'No puede exceder 90 días';
      } else if (form.fechaLimitePago <= today) {
        e.fechaLimitePago = 'Debe ser posterior a hoy';
      }
    }

    items.forEach((item, idx) => {
      if (!item.productName.trim()) e[`item_${idx}_name`] = 'Selecciona un producto del buscador';
      if (item.unitCost <= 0) e[`item_${idx}_cost`] = 'Ingrese costo';
      if (!allowMissingDates && !item.expiryDate) {
        w.push(`Producto "${item.productName || `#${idx + 1}`}" sin fecha de vencimiento`);
      }
    });

    setErrors(e);
    setWarnings(w);
    return { valid: Object.keys(e).length === 0, warnings: w };
  };

  const handleSave = async (skipWarnings = false) => {
    const { valid, warnings: w } = validate(skipWarnings);
    if (!valid) return;

    if (w.length > 0 && !skipWarnings) {
      // Mostrar warning, no guardar todavía
      return;
    }

    setSaving(true);
    const sup = suppliers.find((s) => s.id === form.supplierId)!;
    await addSupplierPurchase({
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCompany: sup.company,
      invoiceNumber: form.invoiceNumber || undefined,
      purchaseDate: today,
      fechaFacturacion: form.fechaFacturacion,
      tipoPago: form.tipoPago,
      fechaLimitePago: form.tipoPago === 'credito' ? form.fechaLimitePago : undefined,
      estadoPago: form.tipoPago === 'contado' ? 'pagado' : 'pendiente',
      notas: form.notas || undefined,
      total: totals.totalInversion,
      items: items.map((i) => ({
        productId: i.productId || '',
        productName: i.productName,
        quantity: i.quantity,
        unitCost: i.unitCost,
        salePrice: i.salePrice || undefined,
        wholesalePrice: i.wholesalePrice || undefined,
        lote: i.lote || undefined,
        expiryDate: i.expiryDate,
      })),
    });
    setSaving(false);
    onClose();
  };

  const updateItem = (idx: number, field: keyof CompraItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      (next[idx] as Record<string, unknown>)[field] = value;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitCost: 0, salePrice: 0, wholesalePrice: 0, lote: '', expiryDate: '' }]);
    setSearchQueries((prev) => [...prev, '']);
    setSearchOpen((prev) => [...prev, false]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSearchQueries((prev) => prev.filter((_, i) => i !== idx));
    setSearchOpen((prev) => prev.filter((_, i) => i !== idx));
  };

  // Click outside to close search dropdowns
  const handleClickOutside = useCallback((e: MouseEvent) => {
    searchRefs.current.forEach((ref, idx) => {
      if (ref && !ref.contains(e.target as Node)) {
        setSearchOpen((prev) => {
          const next = [...prev];
          next[idx] = false;
          return next;
        });
      }
    });
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-5xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <i className="ri-shopping-cart-2-line text-emerald-600"></i>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white text-base">Registrar Compra a Proveedor</h3>
              <p className="text-xs text-slate-400">Control de costos, márgenes y lotes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner(true)}
              className="px-3 py-2 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-sm hover:bg-sky-100 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <i className="ri-camera-line"></i> Escanear
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer w-8 h-8 flex items-center justify-center">
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">

          {/* ── SECCIÓN 1: Proveedor y Datos ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <i className="ri-building-2-line"></i> Datos del Proveedor y Factura
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Proveedor <span className="text-red-500">*</span></label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className={`w-full p-2.5 rounded-lg border text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-white ${errors.supplierId ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.company} — {s.name}</option>
                  ))}
                </select>
                {errors.supplierId && <p className="text-xs text-red-500 mt-0.5">{errors.supplierId}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">N° Factura</label>
                <input
                  type="text"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                  placeholder="FAC-2026-0001"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha de Facturación <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={form.fechaFacturacion}
                  onChange={(e) => setForm({ ...form, fechaFacturacion: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 2: Tipo de pago ── */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <i className="ri-bank-card-line"></i> Tipo de Pago
            </p>
            <div className="flex gap-3">
              {(['contado', 'credito'] as const).map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => setForm({ ...form, tipoPago: tipo, fechaLimitePago: '', creditTerm: 'personalizado' })}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                    form.tipoPago === tipo
                      ? tipo === 'contado'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <i className={`${tipo === 'contado' ? 'ri-money-dollar-circle-line' : 'ri-calendar-check-line'} mr-2`}></i>
                  {tipo === 'contado' ? 'Contado' : 'Crédito'}
                </button>
              ))}
            </div>
            {form.tipoPago === 'credito' && (
              <div className="mt-3 space-y-3">
                {/* Opciones de plazo */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { key: '1semana' as CreditTerm, label: '1 Semana', icon: 'ri-calendar-event-line' },
                    { key: '1mes' as CreditTerm, label: '1 Mes', icon: 'ri-calendar-2-line' },
                    { key: 'personalizado' as CreditTerm, label: 'Personalizado', icon: 'ri-edit-line' },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleCreditTermChange(opt.key)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        form.creditTerm === opt.key
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 text-amber-700 dark:text-amber-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <i className={opt.icon}></i> {opt.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                    Fecha Límite de Pago <span className="text-red-500">*</span> <span className="text-slate-400">(máx. 90 días)</span>
                  </label>
                  <input
                    type="date"
                    value={form.fechaLimitePago}
                    min={today}
                    max={maxCreditDate}
                    onChange={(e) => setForm({ ...form, fechaLimitePago: e.target.value, creditTerm: 'personalizado' })}
                    className={`w-full sm:w-64 p-2 rounded-lg border text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white ${errors.fechaLimitePago ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                  />
                  {errors.fechaLimitePago && <p className="text-xs text-red-500 mt-0.5">{errors.fechaLimitePago}</p>}
                </div>
              </div>
            )}
          </div>

          {/* ── SECCIÓN 3: Productos ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                <i className="ri-medicine-bottle-line"></i> Productos <span className="text-red-500">*</span>
              </p>
              <button onClick={addItem} className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer flex items-center gap-1 whitespace-nowrap">
                <i className="ri-add-circle-line"></i> Agregar producto
              </button>
            </div>

            {/* Header tabla extendida */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-1 px-2 mb-1">
              <span className="col-span-3 text-xs text-slate-400">Producto</span>
              <span className="col-span-1 text-xs text-slate-400 text-center">Cant.</span>
              <span className="col-span-2 text-xs text-slate-400 text-center">Costo Unit.</span>
              <span className="col-span-2 text-xs text-slate-400 text-center">P. Venta</span>
              <span className="col-span-1 text-xs text-slate-400 text-center">Margen</span>
              <span className="col-span-1 text-xs text-slate-400 text-center">Lote</span>
              <span className="col-span-1 text-xs text-slate-400 text-center">Vence</span>
              <span className="col-span-1"></span>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const margin = calcMargin(item.unitCost, item.salePrice);
                const subtotal = item.quantity * item.unitCost;
                const ganancia = item.salePrice > 0 ? (item.salePrice - item.unitCost) * item.quantity : null;
                const isLoss = ganancia !== null && ganancia < 0;
                const filtered = getFilteredProducts(searchQueries[idx] || '');

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border ${isLoss ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}
                  >
                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 items-start">
                      {/* Buscador inteligente de producto */}
                      <div className="col-span-2 lg:col-span-3 relative" ref={(el) => { searchRefs.current[idx] = el; }}>
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">Producto</label>
                        <div className="relative">
                          <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                          <input
                            type="text"
                            value={searchQueries[idx] || ''}
                            onChange={(e) => handleSearchChange(idx, e.target.value)}
                            onFocus={() => {
                              if ((searchQueries[idx] || '').trim().length > 0) {
                                setSearchOpen((prev) => {
                                  const next = [...prev];
                                  next[idx] = true;
                                  return next;
                                });
                              }
                            }}
                            placeholder="Busca por nombre, genérico o código..."
                            className={`w-full pl-8 pr-3 py-2 rounded-lg border text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-white ${errors[`item_${idx}_name`] ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                          {item.productId && (
                            <button
                              onClick={() => {
                                updateItem(idx, 'productId', '');
                                updateItem(idx, 'productName', '');
                                handleSearchChange(idx, '');
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 cursor-pointer"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          )}
                        </div>
                        {errors[`item_${idx}_name`] && <p className="text-xs text-red-500 mt-0.5">{errors[`item_${idx}_name`]}</p>}

                        {/* Dropdown de resultados */}
                        {searchOpen[idx] && filtered.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                            {filtered.map((prod) => (
                              <button
                                key={prod.id}
                                onClick={() => handleSelectProduct(idx, prod)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0 cursor-pointer"
                              >
                                <p className="text-xs font-medium text-slate-800 dark:text-white">{prod.commercialName}</p>
                                <p className="text-[10px] text-slate-400">{prod.genericName} · {prod.lab} · {prod.barcode}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchOpen[idx] && (searchQueries[idx] || '').trim().length > 0 && filtered.length === 0 && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3">
                            <p className="text-xs text-slate-400 text-center">No se encontraron productos</p>
                            <button
                              onClick={() => {
                                updateItem(idx, 'productName', searchQueries[idx] || '');
                                setSearchOpen((prev) => {
                                  const next = [...prev];
                                  next[idx] = false;
                                  return next;
                                });
                              }}
                              className="mt-2 w-full text-center text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            >
                              Usar "{searchQueries[idx]}" como nombre manual
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Cantidad */}
                      <div className="col-span-1 lg:col-span-1">
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">Cant.</label>
                        <input
                          type="number" min={1} value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs text-center"
                        />
                      </div>

                      {/* Costo */}
                      <div className="col-span-1 lg:col-span-2">
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">Costo Unit.</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <input
                            type="number" min={0} step={0.01} value={item.unitCost || ''}
                            onChange={(e) => updateItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className={`w-full pl-5 pr-2 py-1.5 rounded-lg border bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs text-center ${errors[`item_${idx}_cost`] ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                          />
                        </div>
                      </div>

                      {/* Precio venta */}
                      <div className="col-span-1 lg:col-span-2">
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">P. Venta Sugerido</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <input
                            type="number" min={0} step={0.01} value={item.salePrice || ''}
                            onChange={(e) => updateItem(idx, 'salePrice', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className={`w-full pl-5 pr-2 py-1.5 rounded-lg border bg-white dark:bg-slate-800 text-xs text-center ${
                              isLoss ? 'border-red-400 text-red-600' : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Margen badge */}
                      <div className="col-span-1 lg:col-span-1 flex items-center justify-center">
                        {margin !== null ? (
                          <MarginBadge cost={item.unitCost} sale={item.salePrice} />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </div>

                      {/* Lote */}
                      <div className="col-span-1 lg:col-span-1">
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">Lote</label>
                        <input
                          type="text" value={item.lote}
                          onChange={(e) => updateItem(idx, 'lote', e.target.value.toUpperCase())}
                          placeholder="LOT-001"
                          className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-mono uppercase text-center"
                        />
                      </div>

                      {/* Vencimiento */}
                      <div className="col-span-1 lg:col-span-1">
                        <label className="text-xs text-slate-400 mb-1 block lg:hidden">Vence</label>
                        <input
                          type="date" value={item.expiryDate}
                          onChange={(e) => updateItem(idx, 'expiryDate', e.target.value)}
                          className={`w-full p-1.5 rounded-lg border text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-white ${!item.expiryDate ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700'}`}
                        />
                        {!item.expiryDate && <p className="text-[10px] text-amber-500 mt-0.5">Sin fecha</p>}
                      </div>

                      {/* Eliminar */}
                      <div className="col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-end gap-2">
                        <div className="lg:hidden text-xs text-slate-500">
                          Subtotal: <span className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency(subtotal)}</span>
                          {ganancia !== null && (
                            <span className={`ml-2 font-bold ${ganancia < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                              {ganancia < 0 ? '▼' : '▲'} {formatCurrency(Math.abs(ganancia))}
                            </span>
                          )}
                        </div>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 cursor-pointer w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subtotal desktop */}
                    <div className="hidden lg:flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-400">
                        Subtotal compra: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(subtotal)}</span>
                      </span>
                      {ganancia !== null && (
                        <span className={`text-xs font-semibold ${ganancia < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          Ganancia estimada: {ganancia < 0 ? '▼' : '▲'} {formatCurrency(Math.abs(ganancia))}
                        </span>
                      )}
                      {isLoss && (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                          <i className="ri-error-warning-line"></i> P. venta menor al costo
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warnings de fechas faltantes */}
          {warnings.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-start gap-2">
                <i className="ri-alarm-warning-fill text-amber-500 text-lg mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Faltan fechas de vencimiento</p>
                  <ul className="mt-1 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-600 dark:text-amber-400">• {w}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-500 mt-1">Podés guardar igual, pero recordá completarlas luego desde el detalle de la compra.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Resumen total ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Total Invertido</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{formatCurrency(totals.totalInversion)}</p>
            </div>
            <div className={`sm:col-span-1 p-4 rounded-xl border ${totals.gananciaEstimada < 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'}`}>
              <p className="text-xs text-slate-400 mb-1">Ganancia Estimada</p>
              <p className={`text-xl font-bold ${totals.gananciaEstimada < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {totals.gananciaEstimada >= 0 ? '+' : ''}{formatCurrency(totals.gananciaEstimada)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">si se vende todo al precio indicado</p>
            </div>
            <div className="sm:col-span-1 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Productos</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">
                {items.reduce((s, i) => s + i.quantity, 0)} <span className="text-sm font-normal text-slate-400">unidades</span>
              </p>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Notas (opcional)</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              maxLength={500}
              placeholder="Observaciones sobre esta compra..."
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="text-sm text-slate-500 flex items-center gap-2">
            {form.tipoPago === 'credito' && form.fechaLimitePago && (
              <span className="flex items-center gap-1 text-amber-600 text-xs">
                <i className="ri-calendar-line"></i> Vence: {form.fechaLimitePago}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            {warnings.length > 0 && (
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-save-line"></i> Guardar sin fechas
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              {saving ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-save-line"></i>}
              {saving ? 'Guardando...' : 'Guardar Compra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}