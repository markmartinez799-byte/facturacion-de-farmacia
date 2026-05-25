import { useState, useEffect } from 'react';
import { X, Printer, Package, User, Calendar, CreditCard, Hash, CheckCircle, XCircle, Loader } from 'lucide-react';
import BarcodeDisplay from '@/pages/pago/components/BarcodeDisplay';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { formatCurrency } from '@/utils/formatters';
import { printReceipt } from '@/services/printService';

interface FacturaDetalle {
  id: string;
  ncf: string;
  tipo_ncf: string;
  subtotal: number;
  itbis_total: number;
  descuento: number;
  total: number;
  metodo_pago: string;
  estado: string;
  created_at: string;
  numero_factura?: number;
  cliente_nombre?: string;
  cajero_nombre?: string;
  sucursal_nombre?: string;
  items: {
    nombre_producto: string;
    cantidad: number;
    precio: number;
    itbis_monto: number;
    descuento: number;
    subtotal: number;
    numero_lote?: string;
  }[];
}

interface FacturaDetalleModalProps {
  facturaId: string;
  onClose: () => void;
}

export default function FacturaDetalleModal({ facturaId, onClose }: FacturaDetalleModalProps) {
  const { companySettings } = useAuthStore();
  const { settings: appSettings, printerSettings } = useAppStore();
  const company = companySettings ?? appSettings;

  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [printMsg, setPrintMsg] = useState('');

  useEffect(() => {
    loadFactura();
  }, [facturaId]);

  const loadFactura = async () => {
    setLoading(true);
    setError('');
    try {
      // Cargar factura principal
      const { data: f, error: fErr } = await supabase
        .from('facturas_farmacia')
        .select('*, numero_factura')
        .eq('id', facturaId)
        .maybeSingle();

      if (fErr || !f) {
        setError('No se pudo cargar la factura.');
        setLoading(false);
        return;
      }

      // Cargar detalles
      const { data: detalles } = await supabase
        .from('detalle_factura_farmacia')
        .select('nombre_producto, cantidad, precio, itbis_monto, descuento, subtotal, numero_lote')
        .eq('factura_id', facturaId);

      // Cargar nombre del cajero
      let cajeroNombre = 'N/A';
      if (f.usuario_id) {
        const { data: usr } = await supabase
          .from('usuarios_farmacia')
          .select('nombre')
          .eq('id', f.usuario_id)
          .maybeSingle();
        if (usr) cajeroNombre = usr.nombre;
      }

      // Cargar nombre del cliente
      let clienteNombre = '';
      if (f.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes_farmacia')
          .select('nombre')
          .eq('id', f.cliente_id)
          .maybeSingle();
        if (cli) clienteNombre = cli.nombre;
      }

      // Cargar nombre de sucursal
      let sucursalNombre = '';
      if (f.sucursal_id) {
        const { data: suc } = await supabase
          .from('branches')
          .select('name')
          .eq('id', f.sucursal_id)
          .maybeSingle();
        if (suc) sucursalNombre = suc.name;
      }

      setFactura({
        ...f,
        cajero_nombre: cajeroNombre,
        cliente_nombre: clienteNombre,
        sucursal_nombre: sucursalNombre,
        items: detalles || [],
      });
    } catch {
      setError('Error inesperado al cargar la factura.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!factura) return;
    setPrintStatus('printing');
    setPrintMsg('Enviando a impresora...');

    try {
      await printReceipt({
        companyName: company.name || 'FARMACIA',
        branchName: factura.sucursal_nombre || 'SUCURSAL',
        rnc: company.rnc,
        phone: company.phone,
        address: company.address,
        website: company.website,
        logo: company.logo,
        invoiceHeader: (company as unknown as Record<string, string>).invoiceHeader,
        invoiceFooter: printerSettings.footerText,
        invoiceColor: (company as unknown as Record<string, string>).invoiceColor || '#10b981',
        showLogo: printerSettings.printLogo,
        ncf: factura.ncf,
        numeroFactura: factura.numero_factura,
        facturaId: factura.id,
        fecha: new Date(factura.created_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }),
        cajero: factura.cajero_nombre,
        clienteNombre: factura.cliente_nombre,
        metodoPago: factura.metodo_pago,
        items: factura.items.map((i) => ({
          name: i.nombre_producto,
          quantity: i.cantidad,
          unitPrice: i.precio,
          lineDiscount: i.descuento,
        })),
        subtotal: factura.subtotal,
        itbis: factura.itbis_total,
        discountAmount: factura.descuento,
        globalDiscount: 0,
        total: factura.total,
        printerType: printerSettings.printerType as '58mm' | '80mm' | 'A4',
        fontSize: printerSettings.fontSize as 'small' | 'medium' | 'large',
        copies: printerSettings.copies,
      }, true);

      setPrintStatus('success');
      setPrintMsg('Factura impresa correctamente');
      setTimeout(() => setPrintStatus('idle'), 3000);
    } catch (err) {
      setPrintStatus('error');
      setPrintMsg(err instanceof Error ? err.message : 'No se pudo imprimir. Verifique la impresora.');
      setTimeout(() => setPrintStatus('idle'), 4000);
    }
  };

  const estadoColor = factura?.estado === 'activa'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Hash className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Detalle de Factura</h3>
              {factura && (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{factura.ncf}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Cargando factura...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-rose-500">
              <XCircle className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {factura && !loading && (
            <div className="space-y-4">
              {/* Estado + empresa + sucursal */}
              <div className="text-center pb-4 border-b border-dashed border-slate-200 dark:border-slate-700">
                {company.logo && (
                  <img src={company.logo} alt="Logo" className="h-10 mx-auto mb-2 object-contain" />
                )}
                {/* Sucursal — grande */}
                {factura.sucursal_nombre && (
                  <p className="font-black text-slate-800 dark:text-white tracking-wide" style={{ fontSize: '16px' }}>
                    {factura.sucursal_nombre.toUpperCase()}
                  </p>
                )}
                {/* Empresa — pequeña */}
                <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: '11px' }}>
                  {company.name || 'FARMACIA'}
                </p>
                {company.rnc && <p className="text-xs text-slate-500">RNC: {company.rnc}</p>}
                {company.phone && <p className="text-xs text-slate-500">Tel: {company.phone}</p>}
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${estadoColor}`}>
                    {factura.estado === 'activa' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {factura.estado.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Info general */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">NCF</span>
                  </div>
                  <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{factura.ncf}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{factura.tipo_ncf}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fecha</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {new Date(factura.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(factura.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cajero</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{factura.cajero_nombre}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pago</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{factura.metodo_pago}</p>
                </div>
              </div>

              {factura.cliente_nombre && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Cliente</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{factura.cliente_nombre}</p>
                </div>
              )}

              {/* Código de barras + Número */}
              {factura.numero_factura && (
                <div className="bg-white border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Código de Factura</p>
                  <div className="flex flex-col items-center gap-1">
                    <BarcodeDisplay
                      value={String(factura.numero_factura).padStart(10, '0')}
                      width={2}
                      height={60}
                      fontSize={12}
                      displayValue={false}
                      className="w-full max-w-[260px]"
                    />
                    <p className="font-mono font-black text-slate-800 dark:text-white text-xl tracking-[0.25em] leading-none mt-1">
                      {String(factura.numero_factura).padStart(10, '0')}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Número de Factura</p>
                  </div>
                </div>
              )}

              {/* ID completo */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">ID de Factura</p>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400 break-all">{factura.id}</p>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Productos ({factura.items.length})
                </p>
                <div className="space-y-2">
                  {factura.items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg flex-shrink-0 mt-0.5">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{item.nombre_producto}</p>
                          <p className="text-xs text-slate-400">
                            {item.cantidad} × {formatCurrency(item.precio)}
                            {item.numero_lote && ` · Lote: ${item.numero_lote}`}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 text-sm flex-shrink-0">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(factura.subtotal)}</span>
                </div>
                {factura.descuento > 0 && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Descuento</span>
                    <span className="font-mono">-{formatCurrency(factura.descuento)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>ITBIS (18%)</span>
                  <span className="font-mono">{formatCurrency(factura.itbis_total)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 dark:text-white text-base pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>TOTAL</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(factura.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {factura && (
          <div className="flex flex-col gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            {/* Estado de impresión */}
            {printStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                printStatus === 'printing'
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : printStatus === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {printStatus === 'printing' && <Loader className="w-3.5 h-3.5 animate-spin" />}
                {printStatus === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                {printStatus === 'error' && <XCircle className="w-3.5 h-3.5" />}
                {printMsg}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap"
              >
                Cerrar
              </button>
              <button
                onClick={handlePrint}
                disabled={printStatus === 'printing'}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
              >
                {printStatus === 'printing' ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Imprimiendo...</>
                ) : (
                  <><Printer className="w-4 h-4" /> Imprimir</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}