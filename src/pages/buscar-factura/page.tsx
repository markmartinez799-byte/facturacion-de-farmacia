import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Barcode, Hash, Clock, CheckCircle, XCircle, ShieldCheck, ScanLine, Printer, Loader } from 'lucide-react';
import BarcodeDisplay from '@/pages/pago/components/BarcodeDisplay';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';
import { printReceipt } from '@/services/printService';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import PinModal from './components/PinModal';
import FacturaDetalleModal from './components/FacturaDetalleModal';

interface FacturaResumen {
  id: string;
  ncf: string;
  tipo_ncf: string;
  total: number;
  metodo_pago: string;
  estado: string;
  created_at: string;
  numero_factura?: number;
}

type SearchMode = 'barcode' | 'number';

export default function BuscarFacturaPage() {
  const { companySettings } = useAuthStore();
  const { settings: appSettings, printerSettings } = useAppStore();
  const company = companySettings ?? appSettings;

  const [isVerified, setIsVerified] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('barcode');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacturaResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedFacturaId, setSelectedFacturaId] = useState<string | null>(null);
  const [recentFacturas, setRecentFacturas] = useState<FacturaResumen[]>([]);
  const [quickPrintingId, setQuickPrintingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar facturas recientes al verificar
  useEffect(() => {
    if (isVerified) {
      loadRecentFacturas();
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isVerified]);

  const loadRecentFacturas = async () => {
    const { data } = await supabase
      .from('facturas_farmacia')
      .select('id, ncf, tipo_ncf, total, metodo_pago, estado, created_at, numero_factura')
      .order('created_at', { ascending: false })
      .limit(8);
    if (data) setRecentFacturas(data);
  };

  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);

    let queryBuilder = supabase
      .from('facturas_farmacia')
      .select('id, ncf, tipo_ncf, total, metodo_pago, estado, created_at, numero_factura')
      .order('created_at', { ascending: false })
      .limit(20);

    if (searchMode === 'barcode') {
      // El código de barras usa el numero_factura (solo números)
      const numericVal = value.trim().replace(/^0+/, '') || '0';
      queryBuilder = queryBuilder.or(`ncf.ilike.%${value.trim()}%,numero_factura.eq.${numericVal}`);
    } else {
      // Búsqueda por número de factura (NCF exacto o parcial), ID o numero_factura
      const isUUID = /^[0-9a-f]{8}-/i.test(value.trim());
      const isNumeric = /^\d+$/.test(value.trim());
      if (isUUID) {
        queryBuilder = queryBuilder.eq('id', value.trim());
      } else if (isNumeric) {
        queryBuilder = queryBuilder.or(`ncf.ilike.%${value.trim()}%,numero_factura.eq.${parseInt(value.trim(), 10)}`);
      } else {
        queryBuilder = queryBuilder.ilike('ncf', `%${value.trim()}%`);
      }
    }

    const { data, error } = await queryBuilder;
    setLoading(false);
    if (!error && data) {
      setResults(data);
    } else {
      setResults([]);
    }
  }, [searchMode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      handleSearch(query);
    }
  };

  const handleQuickPrint = async (e: React.MouseEvent, f: FacturaResumen) => {
    e.stopPropagation();
    setQuickPrintingId(f.id);

    try {
      // Cargar factura completa con detalles
      const { data: factura } = await supabase
        .from('facturas_farmacia')
        .select('*')
        .eq('id', f.id)
        .maybeSingle();

      if (!factura) {
        setQuickPrintingId(null);
        return;
      }

      const { data: detalles } = await supabase
        .from('detalle_factura_farmacia')
        .select('nombre_producto, cantidad, precio, itbis_monto, descuento, subtotal, numero_lote')
        .eq('factura_id', f.id);

      let cajeroNombre = 'N/A';
      if (factura.usuario_id) {
        const { data: usr } = await supabase
          .from('usuarios_farmacia')
          .select('nombre')
          .eq('id', factura.usuario_id)
          .maybeSingle();
        if (usr) cajeroNombre = usr.nombre;
      }

      let clienteNombre = '';
      if (factura.cliente_id) {
        const { data: cli } = await supabase
          .from('clientes_farmacia')
          .select('nombre')
          .eq('id', factura.cliente_id)
          .maybeSingle();
        if (cli) clienteNombre = cli.nombre;
      }

      let sucursalNombre = '';
      if (factura.sucursal_id) {
        const { data: suc } = await supabase
          .from('branches')
          .select('name')
          .eq('id', factura.sucursal_id)
          .maybeSingle();
        if (suc) sucursalNombre = suc.name;
      }

      await printReceipt({
        companyName: company.name || 'FARMACIA',
        branchName: sucursalNombre || 'SUCURSAL',
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
        cajero: cajeroNombre,
        clienteNombre,
        metodoPago: factura.metodo_pago,
        items: (detalles || []).map((i) => ({
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
    } catch {
      /* ignore — printReceipt ya muestra errores internamente */
    } finally {
      setQuickPrintingId(null);
    }
  };

  const estadoColor = (estado: string) =>
    estado === 'activa'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

  const ncfColor = (tipo: string) => {
    if (tipo === 'B01') return 'text-emerald-600 dark:text-emerald-400';
    if (tipo === 'B14') return 'text-amber-600 dark:text-amber-400';
    if (tipo === 'B15') return 'text-sky-600 dark:text-sky-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  const FacturaCard = ({ f }: { f: FacturaResumen }) => (
    <button
      onClick={() => setSelectedFacturaId(f.id)}
      className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 cursor-pointer transition-all group relative"
    >
      {/* Quick print button — top right */}
      <button
        onClick={(e) => handleQuickPrint(e, f)}
        disabled={quickPrintingId === f.id}
        className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors cursor-pointer z-10"
        title="Reimprimir factura"
      >
        {quickPrintingId === f.id ? (
          <Loader className="w-4 h-4 animate-spin text-emerald-500" />
        ) : (
          <Printer className="w-4 h-4" />
        )}
      </button>

      <div className="flex items-start justify-between gap-3 pr-10">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Mini barcode preview */}
          {f.numero_factura ? (
            <div className="w-16 flex-shrink-0 bg-white border border-slate-100 rounded-lg p-1 overflow-hidden">
              <BarcodeDisplay
                value={String(f.numero_factura).padStart(10, '0')}
                width={1}
                height={28}
                fontSize={7}
                displayValue={false}
                className="w-full"
              />
            </div>
          ) : (
            <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 rounded-xl flex-shrink-0 transition-colors">
              <Barcode className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-mono font-bold text-sm ${ncfColor(f.tipo_ncf)}`}>{f.ncf}</p>
              {f.numero_factura && (
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-bold">
                  #{String(f.numero_factura).padStart(10, '0')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${estadoColor(f.estado)}`}>
                {f.estado === 'activa' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {f.estado}
              </span>
              <span className="text-xs text-slate-400 capitalize">{f.metodo_pago}</span>
              <span className="text-xs text-slate-400">{f.tipo_ncf}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">{formatCurrency(f.total)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(f.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
          </p>
          <p className="text-xs text-slate-400">
            {new Date(f.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </button>
  );

  // ── PANTALLA DE ACCESO BLOQUEADO ──
  if (!isVerified) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ScanLine className="w-10 h-10 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Buscar Factura</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
            Esta función permite consultar facturas por código de barras o número de comprobante.<br />
            Se requiere PIN de administrador para acceder.
          </p>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-6 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Barcode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Código de Barras</p>
                <p className="text-xs text-slate-400">Escanea el código impreso en la factura</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                <Hash className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Número de Factura</p>
                <p className="text-xs text-slate-400">Busca por NCF o ID de la factura</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowPinModal(true)}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base flex items-center justify-center gap-3 cursor-pointer transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-5 h-5" />
            Ingresar PIN de Administrador
          </button>
        </div>

        {showPinModal && (
          <PinModal
            onSuccess={() => { setIsVerified(true); setShowPinModal(false); }}
            onClose={() => setShowPinModal(false)}
          />
        )}
      </div>
    );
  }

  // ── PANTALLA PRINCIPAL (verificado) ──
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ScanLine className="w-6 h-6 text-emerald-600" />
            Buscar Factura
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Consulta facturas por código de barras o número de comprobante
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Acceso verificado</span>
        </div>
      </div>

      {/* Modo de búsqueda */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        {/* Toggle modo */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setSearchMode('barcode'); setQuery(''); setResults([]); setSearched(false); setTimeout(() => inputRef.current?.focus(), 100); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              searchMode === 'barcode'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <Barcode className="w-4 h-4" />
            Código de Barras
          </button>
          <button
            onClick={() => { setSearchMode('number'); setQuery(''); setResults([]); setSearched(false); setTimeout(() => inputRef.current?.focus(), 100); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              searchMode === 'number'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <Hash className="w-4 h-4" />
            Número / ID
          </button>
        </div>

        {/* Input de búsqueda */}
        <div className="relative">
          {searchMode === 'barcode' ? (
            <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          ) : (
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              searchMode === 'barcode'
                ? 'Escanea o escribe el código de barras de la factura...'
                : 'Escribe el NCF (ej: B020000000001) o ID de factura...'
            }
            className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:border-emerald-500 outline-none text-sm transition-colors"
            autoFocus
          />
          {loading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {searchMode === 'barcode'
            ? 'El código de barras del sistema corresponde al NCF de la factura (ej: B020000000001)'
            : 'Puedes buscar por NCF completo, parcial o por el ID UUID de la factura'}
        </p>
      </div>

      {/* Resultados de búsqueda */}
      {searched && (
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            {results.length > 0 ? `${results.length} resultado(s) encontrado(s)` : 'Sin resultados'}
          </p>
          {results.length === 0 && !loading && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
              <Search className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No se encontró ninguna factura</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Verifica el código o número ingresado</p>
            </div>
          )}
          <div className="space-y-2">
            {results.map((f) => <FacturaCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {/* Facturas recientes */}
      {!searched && recentFacturas.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Facturas Recientes
            </p>
          </div>
          <div className="space-y-2">
            {recentFacturas.map((f) => <FacturaCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedFacturaId && (
        <FacturaDetalleModal
          facturaId={selectedFacturaId}
          onClose={() => { setSelectedFacturaId(null); loadRecentFacturas(); }}
        />
      )}
    </div>
  );
}
