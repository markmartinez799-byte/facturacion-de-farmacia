import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import type { Product } from '@/types';
import { checkDuplicateProduct } from '@/services/supabaseService';
import type { DuplicateCheckResult } from '@/services/supabaseService';
import DuplicateProductModal from './DuplicateProductModal';
import type { DuplicateAction } from './DuplicateProductModal';

interface Props {
  product?: Product | null;
  onClose: () => void;
}

type Section = 'identificacion' | 'precios' | 'inventario' | 'lote' | 'impuestos' | 'imagen' | 'descripcion';

const SECCIONES: { id: Section; label: string; icon: string }[] = [
  { id: 'identificacion', label: 'Identificación', icon: 'ri-barcode-line' },
  { id: 'precios', label: 'Precios', icon: 'ri-money-dollar-circle-line' },
  { id: 'inventario', label: 'Inventario', icon: 'ri-stack-line' },
  { id: 'lote', label: 'Lote / Vencimiento', icon: 'ri-calendar-check-line' },
  { id: 'impuestos', label: 'Impuestos', icon: 'ri-percent-line' },
  { id: 'imagen', label: 'Imagen', icon: 'ri-image-line' },
  { id: 'descripcion', label: 'Descripción', icon: 'ri-file-text-line' },
];

const DEFAULT_MARGIN = 30;

export default function ProductoModal({ product, onClose }: Props) {
  const { addProduct, updateProduct } = usePOSStore();
  const { branches } = useAuthStore();
  const [activeSection, setActiveSection] = useState<Section>('identificacion');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [pendingProductData, setPendingProductData] = useState<Omit<Product, 'id' | 'createdAt'> | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageMode, setImageMode] = useState<'url' | 'file'>('url');
  const [imagePreview, setImagePreview] = useState('');

  const [form, setForm] = useState({
    barcode: '',
    commercialName: '',
    genericName: '',
    lab: '',
    presentation: '',
    purchaseCost: '',
    price: '',
    wholesalePrice: '',
    autoCalcPrice: false,
    marginPercent: DEFAULT_MARGIN.toString(),
    itbisApplicable: false,
    stock: {} as Record<string, string>,
    expiryDate: '',
    lote: '',
    image: '',
    estante: '',
    posicion: '',
    descripcion: '',
  });

  useEffect(() => {
    if (product) {
      const purchaseCost = product.purchaseCost ?? 0;
      const price = product.price ?? 0;
      const margin = purchaseCost > 0 ? Math.round(((price - purchaseCost) / purchaseCost) * 100) : DEFAULT_MARGIN;
      setForm({
        barcode: product.barcode || '',
        commercialName: product.commercialName || '',
        genericName: product.genericName || '',
        lab: product.lab || '',
        presentation: product.presentation || '',
        purchaseCost: purchaseCost.toString(),
        price: price.toString(),
        wholesalePrice: (product.wholesalePrice ?? '').toString(),
        autoCalcPrice: product.autoCalcPrice ?? false,
        marginPercent: margin.toString(),
        itbisApplicable: product.itbisApplicable || false,
        stock: Object.fromEntries(branches.map((b) => [b.id, (product.stock[b.id] || 0).toString()])),
        expiryDate: product.expiryDate || '',
        lote: '',
        image: product.image || '',
        estante: product.estante || '',
        posicion: product.posicion || '',
        descripcion: product.descripcion || '',
      });
      setImagePreview(product.image || '');
    } else {
      setForm((f) => ({
        ...f,
        stock: Object.fromEntries(branches.map((b) => [b.id, '0'])),
      }));
    }
  }, [product, branches]);

  // Recalculate price when cost/margin changes in auto mode
  const handleCostChange = (cost: string) => {
    const costNum = parseFloat(cost) || 0;
    const marginNum = parseFloat(form.marginPercent) || 0;
    if (form.autoCalcPrice && costNum > 0) {
      const newPrice = costNum * (1 + marginNum / 100);
      setForm((f) => ({ ...f, purchaseCost: cost, price: newPrice.toFixed(2) }));
    } else {
      setForm((f) => ({ ...f, purchaseCost: cost }));
    }
  };

  const handleMarginChange = (margin: string) => {
    const marginNum = parseFloat(margin) || 0;
    const costNum = parseFloat(form.purchaseCost) || 0;
    if (form.autoCalcPrice && costNum > 0) {
      const newPrice = costNum * (1 + marginNum / 100);
      setForm((f) => ({ ...f, marginPercent: margin, price: newPrice.toFixed(2) }));
    } else {
      setForm((f) => ({ ...f, marginPercent: margin }));
    }
  };

  const handlePriceChange = (price: string) => {
    const priceNum = parseFloat(price) || 0;
    const costNum = parseFloat(form.purchaseCost) || 0;
    if (costNum > 0 && priceNum > 0) {
      const margin = ((priceNum - costNum) / costNum) * 100;
      setForm((f) => ({ ...f, price, marginPercent: margin.toFixed(1) }));
    } else {
      setForm((f) => ({ ...f, price }));
    }
  };

  const getMarginColor = () => {
    const margin = parseFloat(form.marginPercent) || 0;
    const cost = parseFloat(form.purchaseCost) || 0;
    const price = parseFloat(form.price) || 0;
    if (cost > 0 && price < cost) return 'text-red-600';
    if (margin <= 0) return 'text-red-500';
    if (margin < 10) return 'text-amber-500';
    return 'text-emerald-600';
  };

  const isLoss = () => {
    const cost = parseFloat(form.purchaseCost) || 0;
    const price = parseFloat(form.price) || 0;
    return cost > 0 && price > 0 && price < cost;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      setForm((f) => ({ ...f, image: result }));
    };
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = { ...errors };
    delete e.commercialName; delete e.purchaseCost; delete e.price;
    if (!form.commercialName.trim()) e.commercialName = 'El nombre comercial es obligatorio';
    if (!form.purchaseCost || parseFloat(form.purchaseCost) <= 0) e.purchaseCost = 'El precio de compra es obligatorio';
    if (!form.price || parseFloat(form.price) <= 0) e.price = 'El precio de venta es obligatorio';
    if (isLoss()) e.price = 'El precio de venta no puede ser menor al precio de compra';
    setErrors(e);
    const hasFieldErrors = !!(e.commercialName || e.purchaseCost || e.price);
    if (hasFieldErrors) {
      if (e.commercialName) setActiveSection('identificacion');
      else setActiveSection('precios');
      return false;
    }
    return true;
  };

  // Real-time suggestion: check while user types barcode
  const checkBarcodeRealtime = useCallback((barcode: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!barcode.trim() || barcode.trim().length < 4) return;
    debounceRef.current = setTimeout(async () => {
      const result = await checkDuplicateProduct({
        barcode: barcode.trim(),
        excludeId: product?.id,
      });
      if (result.isDuplicate && result.matchType === 'barcode') {
        setErrors((prev) => ({
          ...prev,
          barcode: `⚠ Código ya registrado: "${result.existingProduct?.commercialName}"`,
        }));
      } else {
        setErrors((prev) => { const next = { ...prev }; delete next.barcode; return next; });
      }
    }, 500);
  }, [product?.id]);

  const buildProductData = () => {
    const stockData: Record<string, number> = {};
    branches.forEach((b) => { stockData[b.id] = parseInt(form.stock[b.id] || '0', 10); });
    return {
      barcode: form.barcode.trim(),
      commercialName: form.commercialName.trim(),
      genericName: form.genericName.trim(),
      lab: form.lab.trim(),
      presentation: form.presentation.trim(),
      price: parseFloat(form.price) || 0,
      wholesalePrice: form.wholesalePrice ? parseFloat(form.wholesalePrice) : undefined,
      purchaseCost: parseFloat(form.purchaseCost) || 0,
      autoCalcPrice: form.autoCalcPrice,
      itbisApplicable: form.itbisApplicable,
      stock: stockData,
      expiryDate: form.expiryDate,
      image: form.image || undefined,
      isActive: true,
      estante: form.estante.trim().toUpperCase() || undefined,
      posicion: form.posicion.trim().toUpperCase() || undefined,
      descripcion: form.descripcion.trim() || undefined,
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    // Skip duplicate check if editing existing product
    if (product) {
      setSaving(true);
      await updateProduct(product.id, buildProductData());
      setSaving(false);
      onClose();
      return;
    }

    // Check for duplicates before creating
    setChecking(true);
    const result = await checkDuplicateProduct({
      barcode: form.barcode.trim(),
      commercialName: form.commercialName.trim(),
      presentation: form.presentation.trim(),
      genericName: form.genericName.trim(),
    });
    setChecking(false);

    if (result.isDuplicate) {
      setPendingProductData(buildProductData());
      setDuplicateResult(result);
      return;
    }

    // No duplicate — save directly
    setSaving(true);
    await addProduct(buildProductData());
    setSaving(false);
    onClose();
  };

  const handleDuplicateAction = async (action: DuplicateAction) => {
    if (action === 'cancel') {
      setDuplicateResult(null);
      setPendingProductData(null);
      return;
    }

    if (!pendingProductData) return;
    setSaving(true);
    setDuplicateResult(null);

    if (action === 'replace' && duplicateResult?.existingProduct) {
      await updateProduct(duplicateResult.existingProduct.id, pendingProductData);
      setSuccessMsg('✓ Producto actualizado correctamente');
    } else if (action === 'create_new') {
      await addProduct(pendingProductData);
      setSuccessMsg('✓ Producto duplicado creado');
    }

    setSaving(false);
    setPendingProductData(null);
    setTimeout(() => onClose(), 800);
  };

  const purchaseCostNum = parseFloat(form.purchaseCost) || 0;
  const priceNum = parseFloat(form.price) || 0;
  const wholesaleNum = parseFloat(form.wholesalePrice) || 0;
  const marginNum = parseFloat(form.marginPercent) || 0;
  const itbisPrice = form.itbisApplicable ? priceNum * 1.18 : priceNum;
  const profitUnit = priceNum - purchaseCostNum;

  return (
    <>
    {duplicateResult?.isDuplicate && duplicateResult.existingProduct && (
      <DuplicateProductModal
        existingProduct={duplicateResult.existingProduct}
        matchType={duplicateResult.matchType!}
        onAction={handleDuplicateAction}
      />
    )}
    {createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <i className="ri-medicine-bottle-line text-emerald-600 text-lg"></i>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white text-base">
                {product ? 'Editar Producto' : 'Nuevo Producto'}
              </h3>
              {form.commercialName && (
                <p className="text-xs text-slate-400">{form.commercialName}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer w-8 h-8 flex items-center justify-center">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Nav secciones */}
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 px-3 gap-0 scrollbar-hide">
          {SECCIONES.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                activeSection === sec.id
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              } ${(errors.commercialName && sec.id === 'identificacion') || ((errors.purchaseCost || errors.price) && sec.id === 'precios') ? 'text-red-500' : ''}`}
            >
              <i className={`${sec.icon} text-sm`}></i>
              {sec.label}
              {((errors.commercialName && sec.id === 'identificacion') || ((errors.purchaseCost || errors.price) && sec.id === 'precios')) && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5"></span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido secciones */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* ── SECCIÓN 1: IDENTIFICACIÓN ── */}
          {activeSection === 'identificacion' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <i className="ri-barcode-line text-slate-500 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Identificación del Producto</h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                    Código de Barras <span className="text-slate-400 font-normal">(auto si vacío)</span>
                  </label>
                  <div className="relative">
                    <i className="ri-barcode-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, barcode: e.target.value }));
                        if (!product) checkBarcodeRealtime(e.target.value);
                      }}
                      placeholder="Escanear o escribir..."
                      className={`w-full pl-8 pr-3 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm ${
                        errors.barcode ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                  </div>
                  {errors.barcode && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      {errors.barcode}
                    </p>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Laboratorio / Fabricante</label>
                  <input
                    type="text"
                    value={form.lab}
                    onChange={(e) => setForm((f) => ({ ...f, lab: e.target.value }))}
                    placeholder="Ej: Bayer, Roche..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  Nombre Comercial <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.commercialName}
                  onChange={(e) => setForm((f) => ({ ...f, commercialName: e.target.value }))}
                  placeholder="Ej: Panadol, Amoxicilina 500mg..."
                  className={`w-full p-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm ${errors.commercialName ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                />
                {errors.commercialName && <p className="text-xs text-red-500 mt-1">{errors.commercialName}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Nombre Genérico (DCI)</label>
                <input
                  type="text"
                  value={form.genericName}
                  onChange={(e) => setForm((f) => ({ ...f, genericName: e.target.value }))}
                  placeholder="Ej: Paracetamol, Amoxicilina..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Presentación</label>
                <input
                  type="text"
                  value={form.presentation}
                  onChange={(e) => setForm((f) => ({ ...f, presentation: e.target.value }))}
                  placeholder="Ej: Caja x 10 comprimidos, Frasco 120ml..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>
            </div>
          )}

          {/* ── SECCIÓN 2: PRECIOS ── */}
          {activeSection === 'precios' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <i className="ri-money-dollar-circle-line text-emerald-600 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Precios y Márgenes</h4>
              </div>

              {/* Precio de compra */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  Precio de Compra (Costo) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">RD$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.purchaseCost}
                    onChange={(e) => handleCostChange(e.target.value)}
                    placeholder="0.00"
                    className={`w-full pl-10 pr-3 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono ${errors.purchaseCost ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                  />
                </div>
                {errors.purchaseCost && <p className="text-xs text-red-500 mt-1">{errors.purchaseCost}</p>}
              </div>

              {/* Precio de venta + Margen lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                    Precio de Venta Unitario <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">RD$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.price}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      placeholder="0.00"
                      className={`w-full pl-10 pr-3 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono ${errors.price ? 'border-red-400' : isLoss() ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                    />
                  </div>
                  {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block flex items-center justify-between">
                    <span>Margen de Ganancia</span>
                    <span className={`text-xs font-bold ${getMarginColor()}`}>{marginNum.toFixed(1)}%</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">%</span>
                    <input
                      type="number"
                      min={-100}
                      step={0.1}
                      value={form.marginPercent}
                      onChange={(e) => handleMarginChange(e.target.value)}
                      placeholder="30"
                      className={`w-full pl-8 pr-3 py-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono ${marginNum < 0 ? 'border-red-300' : marginNum < 10 ? 'border-amber-300' : 'border-slate-200 dark:border-slate-700'}`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {form.autoCalcPrice
                      ? 'El precio se calcula automáticamente desde el costo y este margen.'
                      : 'Editá el margen para recalcular el precio, o editá el precio para ver el margen resultante.'}
                  </p>
                </div>
              </div>

              {/* Toggle auto-calcular */}
              <div
                className={`p-3 border rounded-xl cursor-pointer transition-all flex items-center gap-3 ${form.autoCalcPrice ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
                onClick={() => {
                  const next = !form.autoCalcPrice;
                  setForm((f) => ({ ...f, autoCalcPrice: next }));
                  if (next) {
                    const costNum = parseFloat(form.purchaseCost) || 0;
                    const marginNum = parseFloat(form.marginPercent) || 0;
                    if (costNum > 0) {
                      const newPrice = costNum * (1 + marginNum / 100);
                      setForm((f) => ({ ...f, autoCalcPrice: true, price: newPrice.toFixed(2) }));
                    }
                  }
                }}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${form.autoCalcPrice ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {form.autoCalcPrice && <i className="ri-check-line text-white text-xs"></i>}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-white">Auto-calcular precio desde margen</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cada vez que cambies el costo o el margen, el precio de venta se actualizará automáticamente.</p>
                </div>
              </div>

              {/* Precio mayorista */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  Precio Mayorista
                  <span className="text-slate-400 cursor-help" title="Precio especial para compras en grandes cantidades. Opcional.">
                    <i className="ri-question-line text-xs"></i>
                  </span>
                  <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">RD$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.wholesalePrice}
                    onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono"
                  />
                </div>
                {wholesaleNum > 0 && wholesaleNum < purchaseCostNum && (
                  <p className="text-xs text-red-500 mt-1">⚠ El precio mayorista es menor al costo</p>
                )}
              </div>

              {/* Resumen de precios */}
              {purchaseCostNum > 0 && priceNum > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Resumen de Precios</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-1">Costo</p>
                      <p className="text-base font-bold font-mono text-slate-700 dark:text-slate-200">RD${purchaseCostNum.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-1">Venta</p>
                      <p className="text-base font-bold font-mono text-slate-700 dark:text-slate-200">RD${priceNum.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-1">Margen</p>
                      <p className={`text-base font-bold font-mono ${getMarginColor()}`}>{marginNum.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-1">Precio +ITBIS</p>
                      <p className="text-base font-bold font-mono text-amber-600">
                        {form.itbisApplicable ? `RD$${itbisPrice.toFixed(2)}` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Ganancia por unidad:</span>
                    <span className={`text-sm font-bold font-mono ${profitUnit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      RD${profitUnit.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {isLoss() && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
                  <i className="ri-error-warning-fill text-red-500"></i>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    <strong>¡Atención!</strong> El precio de venta (RD${priceNum.toFixed(2)}) es menor al costo (RD${purchaseCostNum.toFixed(2)}). Esto generará pérdida en cada venta.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── SECCIÓN 3: INVENTARIO ── */}
          {activeSection === 'inventario' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <i className="ri-stack-line text-amber-600 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Inventario y Ubicación</h4>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Stock por Sucursal</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {branches.filter((b) => b.isActive).map((branch) => (
                    <div key={branch.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                      <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1.5">
                        <i className="ri-store-2-line mr-1"></i>{branch.name}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.stock[branch.id] || '0'}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val < 0) return;
                          setForm((f) => ({ ...f, stock: { ...f.stock, [branch.id]: e.target.value } }));
                        }}
                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm font-mono text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-map-pin-line text-amber-600 text-sm"></i>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Ubicación en Estante</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                      Estante <span className="text-slate-400">(ej: A, B, C)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={5}
                      value={form.estante}
                      onChange={(e) => setForm((f) => ({ ...f, estante: e.target.value.toUpperCase() }))}
                      placeholder="A"
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono uppercase text-center"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                      Posición <span className="text-slate-400">(ej: A1, B3)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={form.posicion}
                      onChange={(e) => setForm((f) => ({ ...f, posicion: e.target.value.toUpperCase() }))}
                      placeholder="A1"
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono uppercase text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 4: LOTE / VENCIMIENTO ── */}
          {activeSection === 'lote' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                  <i className="ri-calendar-check-line text-rose-500 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Control de Lote y Vencimiento</h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Número de Lote</label>
                  <input
                    type="text"
                    value={form.lote}
                    onChange={(e) => setForm((f) => ({ ...f, lote: e.target.value.toUpperCase() }))}
                    placeholder="Ej: LOT-2026-A01"
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                  />
                </div>
              </div>

              {form.expiryDate && (() => {
                const today = new Date();
                const expiry = new Date(form.expiryDate);
                const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diff < 0) return (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl flex items-center gap-2">
                    <i className="ri-error-warning-fill text-red-500"></i>
                    <p className="text-sm text-red-700 dark:text-red-400"><strong>Producto vencido.</strong> La fecha de vencimiento ya pasó.</p>
                  </div>
                );
                if (diff <= 60) return (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl flex items-center gap-2">
                    <i className="ri-alarm-warning-fill text-amber-500"></i>
                    <p className="text-sm text-amber-700 dark:text-amber-400"><strong>Próximo a vencer:</strong> {diff} días restantes. Considera promocionar este producto.</p>
                  </div>
                );
                return (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 rounded-xl flex items-center gap-2">
                    <i className="ri-checkbox-circle-fill text-emerald-500"></i>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">Vence en {diff} días ({form.expiryDate})</p>
                  </div>
                );
              })()}

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <i className="ri-information-line"></i>
                  Para gestionar múltiples lotes del mismo producto, utiliza el módulo de <strong>Compras a Proveedores</strong> donde puedes registrar lote y vencimiento por cada entrada de inventario.
                </p>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 5: IMPUESTOS ── */}
          {activeSection === 'impuestos' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                  <i className="ri-percent-line text-violet-500 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Configuración de Impuestos</h4>
              </div>

              <div className="p-4 border-2 rounded-xl cursor-pointer transition-all border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                onClick={() => setForm((f) => ({ ...f, itbisApplicable: !f.itbisApplicable }))}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${form.itbisApplicable ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                    {form.itbisApplicable && <i className="ri-check-line text-white text-xs"></i>}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">Aplica ITBIS (18%)</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      El impuesto se aplicará automáticamente en el punto de venta al momento de facturar.
                    </p>
                  </div>
                </div>
              </div>

              {priceNum > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cálculo de ITBIS</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Precio base</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">RD${priceNum.toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between text-sm ${form.itbisApplicable ? '' : 'opacity-40'}`}>
                      <span className="text-slate-600 dark:text-slate-400">ITBIS 18%</span>
                      <span className="font-mono font-semibold text-amber-600">
                        {form.itbisApplicable ? `+ RD${(priceNum * 0.18).toFixed(2)}` : 'No aplica'}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Precio al cliente</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-white">
                        RD${(form.itbisApplicable ? priceNum * 1.18 : priceNum).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400">
                  <i className="ri-information-line mr-1"></i>
                  En República Dominicana, los medicamentos de uso humano están exentos del ITBIS según la Ley 11-92. Solo aplica ITBIS a productos cosméticos y suplementos.
                </p>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 6: IMAGEN ── */}
          {activeSection === 'imagen' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                  <i className="ri-image-line text-sky-500 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Imagen del Producto</h4>
              </div>

              <div className="flex gap-2">
                {(['url', 'file'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setImageMode(mode);
                      if (mode === 'file') setTimeout(() => fileInputRef.current?.click(), 50);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${imageMode === mode ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-300'}`}
                  >
                    <i className={mode === 'url' ? 'ri-link text-sm' : 'ri-upload-2-line text-sm'}></i>
                    {mode === 'url' ? 'Por enlace URL' : 'Subir archivo'}
                  </button>
                ))}
                {imagePreview && (
                  <button
                    onClick={() => { setImagePreview(''); setForm((f) => ({ ...f, image: '' })); }}
                    className="ml-auto flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-delete-bin-line text-sm"></i> Quitar imagen
                  </button>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

              {imageMode === 'url' && (
                <input
                  type="text"
                  value={form.image}
                  onChange={(e) => { setForm((f) => ({ ...f, image: e.target.value })); setImagePreview(e.target.value); }}
                  placeholder="https://ejemplo.com/imagen-producto.jpg"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              )}

              {imagePreview ? (
                <div className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="w-24 h-24 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 bg-white">
                    <img src={imagePreview} alt="Vista previa" className="w-full h-full object-contain" onError={() => setImagePreview('')} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Vista previa</p>
                    <p className="text-xs text-slate-400 mt-1">La imagen se mostrará en el catálogo y en el punto de venta</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
                  <i className="ri-image-add-line text-3xl mb-2"></i>
                  <p className="text-sm">Sin imagen. Puedes agregar una por URL o subiendo un archivo.</p>
                </div>
              )}
            </div>
          )}

          {/* ── SECCIÓN 7: DESCRIPCIÓN ── */}
          {activeSection === 'descripcion' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <i className="ri-file-text-line text-slate-500 text-sm"></i>
                </div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Descripción e Indicaciones</h4>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
                  Notas, Indicaciones, Uso
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={6}
                  maxLength={500}
                  placeholder="Ej: Analgésico y antipirético. Indicado para dolor leve a moderado, fiebre y malestar general. Posología: 1 comprimido cada 8 horas. Tomar con alimentos. Conservar en lugar fresco y seco..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm resize-none"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-slate-400">Esta descripción se mostrará en el chat del asistente de farmacia</p>
                  <p className="text-xs text-slate-400">{form.descripcion.length}/500</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="mx-4 mb-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2">
            <i className="ri-checkbox-circle-fill text-emerald-500"></i>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">{successMsg}</p>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="flex gap-1 flex-wrap">
            {SECCIONES.map((sec, idx) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${activeSection === sec.id ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300'}`}
                title={`${idx + 1}. ${sec.label}`}
              ></button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const cur = SECCIONES.findIndex((s) => s.id === activeSection);
                if (cur > 0) setActiveSection(SECCIONES[cur - 1].id);
              }}
              disabled={activeSection === SECCIONES[0].id}
              className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-30 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-left-line"></i> Anterior
            </button>
            {activeSection !== SECCIONES[SECCIONES.length - 1].id ? (
              <button
                onClick={() => {
                  const cur = SECCIONES.findIndex((s) => s.id === activeSection);
                  setActiveSection(SECCIONES[cur + 1].id);
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                Siguiente <i className="ri-arrow-right-line"></i>
              </button>
            ) : null}
            <button
              onClick={handleSave}
              disabled={saving || checking}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              {(saving || checking) ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-save-line"></i>}
              {checking ? 'Verificando...' : saving ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
    )}
    </>
  );
}
