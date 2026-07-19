import { useState, useEffect, useRef } from 'react';
import {
  X, Banknote, CreditCard, ArrowRightLeft, Printer, CheckCircle, Loader,
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import type { PaymentMethod, NCFType, Client, ActiveInsurance } from '@/types';

export interface CheckoutTotals {
  subtotal: number;
  offerDiscount: number;
  discountAmount: number;
  globalDiscount: number;
  itbis: number;
  insuranceCoverage: number;
  total: number;
}

interface CheckoutModalProps {
  onClose: () => void;
  onCompleteSale: (params: {
    paymentMethod: PaymentMethod;
    cashReceived: number;
    cardAmount: number;
    shouldPrint: boolean;
    localClientRnc: string;
    localClientName: string;
  }) => void;
  totals: CheckoutTotals;
  ncfType: NCFType;
  onNcfTypeChange: (type: NCFType) => void;
  ncfOptions: { value: NCFType; label: string }[];
  currentClient: Client | null;
  activeInsurance: ActiveInsurance | null;
  isSaving: boolean;
  billingError: string | null;
  printMode: string;
  cartItemCount: number;
}

export default function CheckoutModal({
  onClose,
  onCompleteSale,
  totals,
  ncfType,
  onNcfTypeChange,
  ncfOptions,
  currentClient,
  activeInsurance,
  isSaving,
  billingError,
  printMode,
  cartItemCount,
}: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [localClientRnc, setLocalClientRnc] = useState('');
  const [localClientName, setLocalClientName] = useState('');
  const [shouldPrint, setShouldPrint] = useState(true);

  const cashInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const cashNum = parseFloat(cashReceived || '0');
  const cardNum = parseFloat(cardAmount || '0');
  const change = paymentMethod === 'efectivo' ? cashNum - totals.total : 0;
  const totalPaid = paymentMethod === 'mixto' ? cashNum + cardNum : paymentMethod === 'efectivo' ? cashNum : cardNum;

  const canComplete = !isSaving && (
    paymentMethod === 'tarjeta'
      ? true
      : paymentMethod === 'efectivo'
      ? cashNum >= totals.total
      : (cashNum + cardNum) >= totals.total
  );

  // Auto-focus the cash/amount input when modal opens
  useEffect(() => {
    const t = setTimeout(() => {
      if (paymentMethod === 'efectivo' || paymentMethod === 'mixto') {
        cashInputRef.current?.focus();
      } else {
        cardInputRef.current?.focus();
      }
    }, 150);
    return () => clearTimeout(t);
  }, [paymentMethod]);

  const handleSubmit = () => {
    if (!canComplete) return;
    onCompleteSale({
      paymentMethod,
      cashReceived: cashNum,
      cardAmount: cardNum,
      shouldPrint,
      localClientRnc,
      localClientName,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onKeyDown={handleKeyDown}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md animate-bounce-in max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h3 className="font-semibold text-slate-800 dark:text-white">Finalizar Venta</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* NCF Type */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Tipo de Comprobante</label>
            <select
              value={ncfType}
              onChange={(e) => onNcfTypeChange(e.target.value as NCFType)}
              className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
            >
              {ncfOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Client info for B01 or when client is set */}
          {(ncfType === 'B01' || currentClient) && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">RNC / Cédula Cliente</label>
                <input
                  type="text"
                  value={localClientRnc}
                  onChange={(e) => setLocalClientRnc(e.target.value)}
                  placeholder="001-1234567-1"
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Nombre / Razón Social</label>
                <input
                  type="text"
                  value={localClientName}
                  onChange={(e) => setLocalClientName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                />
              </div>
            </>
          )}

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Método de Pago</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'efectivo' as PaymentMethod, label: 'Efectivo', icon: Banknote },
                { value: 'tarjeta' as PaymentMethod, label: 'Tarjeta', icon: CreditCard },
                { value: 'mixto' as PaymentMethod, label: 'Mixto', icon: ArrowRightLeft },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                    paymentMethod === opt.value
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-emerald-300'
                  }`}
                >
                  <opt.icon className="w-5 h-5" />
                  <span className="text-xs whitespace-nowrap">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cash received */}
          {(paymentMethod === 'efectivo' || paymentMethod === 'mixto') && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Monto en Efectivo (RD$)</label>
              <input
                ref={cashInputRef}
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono text-lg"
                placeholder="0.00"
              />
              {cashNum > 0 && paymentMethod === 'efectivo' && (
                <p className="text-sm mt-1.5">
                  Vuelto: <span className={`font-mono font-bold ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(change)}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Card amount */}
          {(paymentMethod === 'tarjeta' || paymentMethod === 'mixto') && (
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">Monto Tarjeta (RD$)</label>
              <input
                ref={cardInputRef}
                type="number"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-mono text-lg"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Insurance */}
          {activeInsurance && (
            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">
                Seguro: {activeInsurance.planName}
              </p>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Afiliado: {activeInsurance.affiliateNumber || 'No especificado'} ·
                Cobertura: {activeInsurance.coveragePercent}%
                ({formatCurrency(totals.insuranceCoverage)})
              </p>
            </div>
          )}

          {/* Billing error */}
          {billingError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Error al guardar factura</p>
              <p className="text-xs text-rose-600 dark:text-rose-400">{billingError}</p>
            </div>
          )}

          {/* Print option (ask mode) */}
          {printMode === 'ask' && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Imprimir factura</span>
              </div>
              <button
                onClick={() => setShouldPrint(!shouldPrint)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  shouldPrint ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  shouldPrint ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          )}

          {printMode === 'auto' && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
              <i className="ri-flashlight-fill text-emerald-600"></i>
              Se imprimirá automáticamente al completar la venta
            </div>
          )}

          {printMode === 'manual' && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <i className="ri-forbid-line text-slate-400"></i>
              Modo sin impresión activado — solo se registrará en el sistema
            </div>
          )}

          {/* Total + Complete button */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="space-y-1 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.offerDiscount > 0 && (
                <div className="flex justify-between text-xs text-rose-600 dark:text-rose-400">
                  <span className="flex items-center gap-1">
                    <i className="ri-gift-line"></i>
                    Oferta
                  </span>
                  <span className="font-mono">-{formatCurrency(totals.offerDiscount)}</span>
                </div>
              )}
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-xs text-orange-600 dark:text-orange-400">
                  <span>Descuento global ({totals.globalDiscount}%)</span>
                  <span className="font-mono">-{formatCurrency(totals.discountAmount)}</span>
                </div>
              )}
              {totals.insuranceCoverage > 0 && (
                <div className="flex justify-between text-xs text-teal-600 dark:text-teal-400">
                  <span>Cobertura seguro</span>
                  <span className="font-mono">-{formatCurrency(totals.insuranceCoverage)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="font-semibold text-slate-800 dark:text-white">Total cobrado</span>
              <span className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totals.total)}
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!canComplete}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              {isSaving ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Guardando factura...
                </>
              ) : (
                <>
                  {printMode === 'auto' ? (
                    <><Printer className="w-5 h-5" /> Completar e Imprimir</>
                  ) : (
                    <><CheckCircle className="w-5 h-5" /> Completar Venta</>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}