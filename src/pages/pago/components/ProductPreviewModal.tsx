import { useEffect, useState } from 'react';
import { X, Package, Tag, FlaskConical, Layers, DollarSign, BarChart2, Loader } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { useAuthStore } from '@/store/authStore';
import { usePOSStore } from '@/store/posStore';
import { fetchProductDetails } from '@/services/supabaseService';
import type { Product } from '@/types';

interface ProductPreviewModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

const PLACEHOLDER = 'https://readdy.ai/api/search-image?query=clean%20white%20pharmacy%20product%20medicine%20bottle%20pill%20box%20isolated%20on%20white%20background%20minimal%20professional%20pharmaceutical%20product%20display&width=400&height=400&seq=placeholder-pharm-1&orientation=squarish';

export default function ProductPreviewModal({ product, onClose, onAddToCart }: ProductPreviewModalProps) {
  const { currentBranch, branches } = useAuthStore();
  const { getStockInBranch, getStockInOtherBranches } = usePOSStore();
  const [imgError, setImgError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [image, setImage] = useState<string | undefined>(product.image);
  const [descripcion, setDescripcion] = useState<string | undefined>(product.descripcion);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const stock = getStockInBranch(product.id, currentBranch?.id || '');
  const otherBranchStocks = getStockInOtherBranches(product.id, currentBranch?.id || '');

  // Load image and description on-demand when modal opens
  useEffect(() => {
    // If product already has image, skip fetch
    if (product.image) {
      setImage(product.image);
      setDescripcion(product.descripcion);
      return;
    }

    let cancelled = false;
    setLoadingDetails(true);

    fetchProductDetails(product.id).then((details) => {
      if (cancelled) return;
      if (details?.image) setImage(details.image);
      if (details?.descripcion) setDescripcion(details.descripcion);
      setLoadingDetails(false);
    }).catch(() => {
      if (!cancelled) setLoadingDetails(false);
    });

    return () => { cancelled = true; };
  }, [product.id, product.image, product.descripcion]);

  const daysUntilExpiry = Math.ceil(
    (new Date(product.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const getExpiryColor = () => {
    if (daysUntilExpiry <= 0) return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800';
    if (daysUntilExpiry <= 30) return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800';
    if (daysUntilExpiry <= 90) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    if (daysUntilExpiry <= 150) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
    return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
  };

  const getStockColor = () => {
    if (stock <= 0) return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
    if (stock <= 5) return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
    if (stock <= 15) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
  };

  // Mount animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-200 ${isVisible ? 'bg-black/60' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden transition-all duration-200 ${isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="font-bold text-slate-800 dark:text-white text-base leading-tight truncate">
              {product.commercialName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{product.genericName}</p>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {/* Product Image */}
          <div className="relative bg-slate-50 dark:bg-slate-900 flex items-center justify-center" style={{ height: '200px' }}>
            {loadingDetails ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader className="w-8 h-8 animate-spin" />
                <p className="text-xs">Cargando imagen...</p>
              </div>
            ) : image && !imgError ? (
              <img
                src={image}
                alt={product.commercialName}
                onError={() => setImgError(true)}
                className="w-full h-full object-contain p-4"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-300 dark:text-slate-600">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Package className="w-14 h-14 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Sin imagen disponible</p>
                </div>
              </div>
            )}

            {/* Price badge over image */}
            <div className="absolute bottom-3 right-3 bg-emerald-600 text-white px-3 py-1.5 rounded-xl font-mono font-bold text-lg shadow-lg">
              {formatCurrency(product.price)}
            </div>

            {/* Expiry badge */}
            {daysUntilExpiry <= 150 && (
              <div className={`absolute top-3 left-3 px-2 py-1 rounded-lg text-xs font-semibold border ${getExpiryColor()}`}>
                {daysUntilExpiry <= 0
                  ? 'VENCIDO'
                  : `Vence en ${daysUntilExpiry}d`}
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-2">
              <InfoRow icon={<Tag className="w-3.5 h-3.5" />} label="Presentación" value={product.presentation} />
              <InfoRow icon={<FlaskConical className="w-3.5 h-3.5" />} label="Laboratorio" value={product.lab} />
              {product.barcode && (
                <InfoRow icon={<Layers className="w-3.5 h-3.5" />} label="Código de barras" value={product.barcode} />
              )}
              {product.wholesalePrice && (
                <InfoRow icon={<DollarSign className="w-3.5 h-3.5" />} label="Precio mayoreo" value={formatCurrency(product.wholesalePrice)} />
              )}
            </div>

            {/* Stock actual */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <BarChart2 className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Stock disponible</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Sucursal actual</span>
                  {currentBranch && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">({currentBranch.name})</span>
                  )}
                </div>
                <span className={`font-bold text-sm px-3 py-1 rounded-full ${getStockColor()}`}>
                  {stock} unidades
                </span>
              </div>

              {/* Other branches */}
              {otherBranchStocks.filter((s) => s.stock > 0).length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                  {otherBranchStocks
                    .filter((s) => s.stock > 0)
                    .map((s) => {
                      const branchName = branches.find((b) => b.id === s.branchId)?.name || s.branchId;
                      return (
                        <div key={s.branchId} className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{branchName}</span>
                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                            {s.stock} uds.
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Descripción / indicaciones */}
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Descripción / Indicaciones</p>
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                {loadingDetails ? (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    <p className="text-sm">Cargando...</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {descripcion?.trim() || 'Sin descripción disponible.'}
                  </p>
                )}
              </div>
            </div>

            {/* Ubicación en estante */}
            {(product.estante || product.posicion) && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5">
                <i className="ri-map-pin-line text-amber-500 text-sm"></i>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Ubicación en estante</p>
                  <p className="text-sm text-amber-600 dark:text-amber-300 font-medium">
                    {[product.estante && `Estante ${product.estante}`, product.posicion && `Pos. ${product.posicion}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {/* Vencimiento */}
            <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 ${getExpiryColor()}`}>
              <i className="ri-calendar-event-line text-sm"></i>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Vencimiento</p>
                <p className="text-sm font-bold">
                  {new Date(product.expiryDate).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}
                  <span className="text-xs font-normal ml-2 opacity-75">
                    ({daysUntilExpiry <= 0 ? 'Vencido' : `${daysUntilExpiry} días restantes`})
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {onAddToCart && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button
              onClick={() => { onAddToCart(product); handleClose(); }}
              disabled={stock <= 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            >
              <i className="ri-shopping-cart-line text-base"></i>
              {stock <= 0 ? 'Sin stock disponible' : 'Agregar al carrito'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-0.5">
        {icon}
        <p className="text-xs uppercase tracking-wide font-medium">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{value || '—'}</p>
    </div>
  );
}
