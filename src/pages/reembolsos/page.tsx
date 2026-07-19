import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Hash, User, Phone, Calendar, Package, ArrowLeft, RotateCcw, CheckCircle, XCircle, ShieldCheck, Loader, AlertTriangle, ShoppingCart, CreditCard, Clock, ScanLine } from 'lucide-react';
import BarcodeDisplay from '@/pages/pago/components/BarcodeDisplay';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';
import { useAuthStore } from '@/store/authStore';
import PinModal from '@/pages/buscar-factura/components/PinModal';
import AutorizacionReembolsoModal from './components/AutorizacionReembolsoModal';
import ProductosVencidosPanel from './components/ProductosVencidosPanel';

interface FacturaResumen {
  id: string;
  ncf: string;
  tipo_ncf: string;
  total: number;
  metodo_pago: string;
  estado: string;
  created_at: string;
  numero_factura?: number;
  cliente_nombre?: string;
  cajero_nombre?: string;
}

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
  cliente_telefono?: string;
  cajero_nombre?: string;
  sucursal_nombre?: string;
  sucursal_id?: string;
  usuario_id?: string;
  items: DetalleItem[];
}

interface DetalleItem {
  id: string;
  producto_id: string;
  nombre_producto: string;
  numero_lote?: string;
  fecha_vencimiento?: string;
  cantidad: number;
  precio: number;
  itbis_monto: number;
  descuento: number;
  subtotal: number;
  selected: boolean;
}

type PageState = 'verification' | 'search' | 'detail' | 'processing' | 'success';

export default function ReembolsosPage() {
  const { currentUser, companySettings } = useAuthStore();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('verification');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<FacturaResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Detail
  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Authorization
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{ success: boolean; message: string; reembolsoId?: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [subTab, setSubTab] = useState<'reembolsar' | 'vencidos'>('reembolsar');

  useEffect(() => {
    if (pageState === 'search') setTimeout(() => inputRef.current?.focus(), 200);
  }, [pageState]);

  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true); setSearched(true);

    const q = value.trim();

    // First, try to find clients matching the query (by name or phone)
    let clientIds: string[] = [];
    const { data: matchingClients } = await supabase
      .from('clientes_farmacia')
      .select('id')
      .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
      .limit(20);

    if (matchingClients && matchingClients.length > 0) {
      clientIds = matchingClients.map((c: Record<string, unknown>) => c.id as string);
    }

    // Build main query
    let queryBuilder = supabase
      .from('facturas_farmacia')
      .select('id, ncf, tipo_ncf, total, metodo_pago, estado, created_at, numero_factura, cliente_id, usuario_id, sucursal_id')
      .eq('estado', 'activa')
      .order('created_at', { ascending: false })
      .limit(30);

    const isNumeric = /^\d+$/.test(q);

    if (clientIds.length > 0) {
      // Search by client ID from matched clients
      queryBuilder = queryBuilder.in('cliente_id', clientIds);
    } else if (isNumeric) {
      queryBuilder = queryBuilder.or(`ncf.ilike.%${q}%,numero_factura.eq.${parseInt(q, 10)}`);
    } else {
      queryBuilder = queryBuilder.ilike('ncf', `%${q}%`);
    }

    const { data } = await queryBuilder;
    setLoading(false);
    if (!data) { setResults([]); return; }

    // Enrich with names
    const enriched: FacturaResumen[] = await Promise.all(data.map(async (f: Record<string, unknown>) => {
      let clienteNombre = '';
      let cajeroNombre = '';
      if (f.cliente_id) {
        const { data: cli } = await supabase.from('clientes_farmacia').select('nombre').eq('id', f.cliente_id).maybeSingle();
        if (cli) clienteNombre = cli.nombre;
      }
      if (f.usuario_id) {
        const { data: usr } = await supabase.from('usuarios_farmacia').select('nombre').eq('id', f.usuario_id).maybeSingle();
        if (usr) cajeroNombre = usr.nombre;
      }
      return { ...f as unknown as FacturaResumen, cliente_nombre: clienteNombre, cajero_nombre: cajeroNombre };
    }));

    setResults(enriched);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      handleSearch(searchQuery);
    }
  };

  const openDetail = async (facturaId: string) => {
    setLoadingDetail(true);
    setPageState('detail');

    const { data: f } = await supabase.from('facturas_farmacia').select('*').eq('id', facturaId).maybeSingle();
    if (!f) { setLoadingDetail(false); return; }

    const { data: detalles } = await supabase.from('detalle_factura_farmacia')
      .select('id, producto_id, nombre_producto, numero_lote, fecha_vencimiento, cantidad, precio, itbis_monto, descuento, subtotal')
      .eq('factura_id', facturaId);

    let clienteNombre = '', clienteTelefono = '';
    if (f.cliente_id) {
      const { data: cli } = await supabase.from('clientes_farmacia').select('nombre, telefono').eq('id', f.cliente_id).maybeSingle();
      if (cli) { clienteNombre = cli.nombre; clienteTelefono = cli.telefono; }
    }
    let cajeroNombre = '';
    if (f.usuario_id) {
      const { data: usr } = await supabase.from('usuarios_farmacia').select('nombre').eq('id', f.usuario_id).maybeSingle();
      if (usr) cajeroNombre = usr.nombre;
    }
    let sucursalNombre = '';
    if (f.sucursal_id) {
      const { data: suc } = await supabase.from('branches').select('name').eq('id', f.sucursal_id).maybeSingle();
      if (suc) sucursalNombre = suc.name;
    }

    const items: DetalleItem[] = (detalles || []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      producto_id: d.producto_id as string,
      nombre_producto: d.nombre_producto as string,
      numero_lote: d.numero_lote as string || undefined,
      fecha_vencimiento: d.fecha_vencimiento as string || undefined,
      cantidad: Number(d.cantidad) || 0,
      precio: Number(d.precio) || 0,
      itbis_monto: Number(d.itbis_monto) || 0,
      descuento: Number(d.descuento) || 0,
      subtotal: Number(d.subtotal) || 0,
      selected: true,
    }));

    setFactura({
      ...(f as unknown as FacturaDetalle),
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      cajero_nombre: cajeroNombre,
      sucursal_nombre: sucursalNombre,
      items,
    });
    setLoadingDetail(false);
  };

  const toggleItemSelection = (idx: number) => {
    if (!factura) return;
    const newItems = [...factura.items];
    newItems[idx] = { ...newItems[idx], selected: !newItems[idx].selected };
    setFactura({ ...factura, items: newItems });
  };

  const toggleAllItems = () => {
    if (!factura) return;
    const allSelected = factura.items.every((i) => i.selected);
    const newItems = factura.items.map((i) => ({ ...i, selected: !allSelected }));
    setFactura({ ...factura, items: newItems });
  };

  const selectedItems = factura?.items.filter((i) => i.selected) || [];
  const selectedTotal = selectedItems.reduce((sum, i) => sum + i.subtotal, 0);

  const handleProcessRefund = () => {
    if (selectedItems.length === 0) return;
    setShowAuthModal(true);
  };

  const executeRefund = async (codigo: string) => {
    if (!factura || !currentUser) return;
    setShowAuthModal(false);
    setAuthCode(codigo);
    setProcessing(true);
    setPageState('processing');

    try {
      const reembolsoId = crypto.randomUUID();
      const tipo = selectedItems.length === factura.items.length ? 'total' : 'parcial';

      const subtotalDevuelto = selectedItems.reduce((s, i) => s + i.subtotal, 0);
      const itbisDevuelto = selectedItems.reduce((s, i) => s + i.itbis_monto, 0);
      const totalDevuelto = subtotalDevuelto + itbisDevuelto;

      // 1. Insert reembolso header
      const { error: reembolsoError } = await supabase.from('reembolsos_farmacia').insert({
        id: reembolsoId,
        factura_id: factura.id,
        sucursal_id: factura.sucursal_id || null,
        cajero_id: currentUser.id,
        admin_autorizo_id: currentUser.id,
        codigo_autorizacion: codigo,
        tipo,
        subtotal_devuelto: subtotalDevuelto,
        itbis_devuelto: itbisDevuelto,
        total_devuelto: totalDevuelto,
        motivo: 'Reembolso solicitado por cliente',
        estado: 'completado',
      });
      if (reembolsoError) throw new Error(reembolsoError.message);

      // 2. Process each item
      const now = new Date().toISOString().split('T')[0];

      for (const item of selectedItems) {
        const fueReintegrado = item.fecha_vencimiento ? new Date(item.fecha_vencimiento) > new Date() : true;
        const fueAVencidos = !fueReintegrado && !!item.fecha_vencimiento;

        // Insert detalle
        await supabase.from('detalle_reembolsos_farmacia').insert({
          reembolso_id: reembolsoId,
          factura_detalle_id: item.id,
          producto_id: item.producto_id,
          nombre_producto: item.nombre_producto,
          numero_lote: item.numero_lote || null,
          fecha_vencimiento: item.fecha_vencimiento || null,
          cantidad_devuelta: item.cantidad,
          precio_unitario: item.precio,
          subtotal_devuelto: item.subtotal,
          itbis_devuelto: item.itbis_monto,
          fue_reintegrado: fueReintegrado,
          fue_a_vencidos: fueAVencidos,
        });

        if (fueReintegrado && factura.sucursal_id) {
          // Reintegrate to stock_farmacia
          const { data: stockActual } = await supabase
            .from('stock_farmacia')
            .select('cantidad')
            .eq('producto_id', item.producto_id)
            .eq('sucursal_id', factura.sucursal_id)
            .maybeSingle();

          const nuevaCantidad = (stockActual?.cantidad || 0) + item.cantidad;
          await supabase.from('stock_farmacia').upsert({
            producto_id: item.producto_id,
            sucursal_id: factura.sucursal_id,
            cantidad: nuevaCantidad,
          }, { onConflict: 'producto_id,sucursal_id' });
        }

        if (fueAVencidos) {
          // Move to expired products
          await supabase.from('productos_vencidos_farmacia').insert({
            producto_id: item.producto_id || null,
            nombre_producto: item.nombre_producto,
            numero_lote: item.numero_lote || 'N/A',
            cantidad: item.cantidad,
            fecha_vencimiento: item.fecha_vencimiento!,
            fecha_ingreso: new Date().toISOString(),
            origen_reembolso_id: reembolsoId,
            usuario_id: currentUser.id,
            estado: 'pendiente',
            motivo: 'Producto vencido al momento de reembolso',
          });
        }
      }

      setProcessResult({
        success: true,
        message: tipo === 'total' ? 'Reembolso total procesado correctamente' : 'Reembolso parcial procesado correctamente',
        reembolsoId,
      });
    } catch (err: any) {
      setProcessResult({ success: false, message: err.message || 'Error al procesar el reembolso' });
    } finally {
      setProcessing(false);
      setPageState('success');
    }
  };

  const resetAll = () => {
    setPageState('search');
    setFactura(null);
    setProcessResult(null);
    setAuthCode('');
    setSearchQuery('');
    setResults([]);
    setSearched(false);
  };

  // ── VERIFICATION SCREEN ──
  if (pageState === 'verification') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        {/* Botón volver */}
        <div className="w-full max-w-md mb-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-all text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        </div>
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <RotateCcw className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Reembolsos y Devoluciones</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
            Procesa reembolsos de facturas existentes. Se requiere PIN de administrador y código de autorización.<br />
            Los productos válidos se reintegran al inventario y los vencidos van a cuarentena.
          </p>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-6 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Search className="w-4 h-4 text-emerald-600" />
              </div>
              <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Buscar Factura</p><p className="text-xs text-slate-400">Por NCF, nombre de cliente o número</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
              </div>
              <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Autorización Requerida</p><p className="text-xs text-slate-400">Código maestro de administrador para cada reembolso</p></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <Package className="w-4 h-4 text-sky-600" />
              </div>
              <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Control de Inventario</p><p className="text-xs text-slate-400">Válidos → stock · Vencidos → cuarentena automática</p></div>
            </div>
          </div>

          <button onClick={() => setShowPinModal(true)} className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-base flex items-center justify-center gap-3 cursor-pointer transition-colors whitespace-nowrap">
            <ShieldCheck className="w-5 h-5" />
            Ingresar PIN de Administrador
          </button>
        </div>

        {showPinModal && (
          <PinModal
            onSuccess={() => { setPageState('search'); setShowPinModal(false); }}
            onClose={() => setShowPinModal(false)}
          />
        )}
      </div>
    );
  }

  // ── SEARCH SCREEN ──
  if (pageState === 'search') {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header with sub-tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-amber-400 hover:text-amber-600 cursor-pointer transition-colors text-slate-500"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-6 h-6 text-amber-600" />
                Reembolsos y Devoluciones
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {subTab === 'reembolsar' ? 'Busca la factura que deseas reembolsar' : 'Productos vencidos en cuarentena'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Acceso verificado</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab('reembolsar')}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              subTab === 'reembolsar'
                ? 'bg-amber-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <RotateCcw className="w-4 h-4" /> Reembolsar
          </button>
          <button
            onClick={() => setSubTab('vencidos')}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              subTab === 'vencidos'
                ? 'bg-red-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Productos Vencidos
          </button>
        </div>

        {subTab === 'vencidos' ? (
          <ProductosVencidosPanel />
        ) : (
          <>
            {/* Search */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Busca por NCF, número de factura, nombre de cliente o teléfono..."
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:border-amber-500 outline-none text-sm transition-colors"
                  autoFocus
                />
                {loading && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Busca por NCF (ej: B020000000001), número de factura, o nombre de cliente
              </p>
            </div>

            {/* Results */}
            {searched && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                  {results.length > 0 ? `${results.length} factura(s) encontrada(s)` : 'Sin resultados'}
                </p>
                {results.length === 0 && !loading && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">No se encontró ninguna factura activa</p>
                    <p className="text-xs text-slate-400 mt-1">Verifica el NCF o número de factura</p>
                  </div>
                )}
                <div className="space-y-2">
                  {results.map((f) => (
                    <button key={f.id} onClick={() => openDetail(f.id)}
                      className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 cursor-pointer transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-xl flex-shrink-0">
                            <Hash className="w-5 h-5 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">{f.ncf}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {f.cliente_nombre && (
                                <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                  <User className="w-3 h-3" /> {f.cliente_nombre}
                                </span>
                              )}
                              {f.cajero_nombre && (
                                <span className="text-xs text-slate-400">· {f.cajero_nombre}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(f.total)}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(f.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
                            {' '}
                            {new Date(f.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── DETAIL SCREEN ──
  if (pageState === 'detail' && factura) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Back header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setPageState('search'); setFactura(null); }} className="w-9 h-9 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-amber-400 cursor-pointer transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Detalle de Factura</h1>
            <p className="text-sm text-slate-500">Selecciona los productos a devolver</p>
          </div>
        </div>

        {/* Invoice Info */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">NCF</p>
              <p className="font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">{factura.ncf}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Fecha</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {new Date(factura.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(factura.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Cajero</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{factura.cajero_nombre || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Pago</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" /> {factura.metodo_pago}
              </p>
            </div>
          </div>
          {factura.cliente_nombre && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">{factura.cliente_nombre}</span>
              {factura.cliente_telefono && <span className="text-slate-400">· {factura.cliente_telefono}</span>}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={toggleAllItems}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                  factura.items.every((i) => i.selected)
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {factura.items.every((i) => i.selected) && <CheckCircle className="w-3.5 h-3.5" />}
              </button>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Productos ({factura.items.length})
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {selectedItems.length} de {factura.items.length} seleccionados
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {factura.items.map((item, idx) => {
              const isExpired = item.fecha_vencimiento ? new Date(item.fecha_vencimiento) < new Date() : false;
              return (
                <div key={item.id}
                  onClick={() => toggleItemSelection(idx)}
                  className={`px-5 py-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-750 ${
                    item.selected ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''
                  }`}
                >
                  <button className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    item.selected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {item.selected && <CheckCircle className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{item.nombre_producto}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{item.cantidad} × {formatCurrency(item.precio)}</span>
                      {item.numero_lote && <span className="text-xs text-slate-400">· Lote: {item.numero_lote}</span>}
                      {item.fecha_vencimiento && (
                        <span className={`text-xs font-medium ${isExpired ? 'text-red-500' : 'text-emerald-500'}`}>
                          · Vence: {new Date(item.fecha_vencimiento).toLocaleDateString('es-DO')}
                          {isExpired && ' (VENCIDO)'}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 text-sm flex-shrink-0">
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Totals & Action */}
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal factura</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(factura.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total factura</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(factura.total)}</span>
            </div>
            {selectedItems.length > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-amber-200 dark:border-amber-800">
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Total a devolver</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{formatCurrency(selectedTotal)}</span>
              </div>
            )}
            <button
              onClick={handleProcessRefund}
              disabled={selectedItems.length === 0}
              className="w-full mt-3 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Procesar Reembolso ({selectedItems.length} producto{selectedItems.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>

        {showAuthModal && (
          <AutorizacionReembolsoModal
            onSuccess={executeRefund}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </div>
    );
  }

  // ── PROCESSING SCREEN ──
  if (pageState === 'processing') {
    return (
      <div className="max-w-md mx-auto text-center py-20 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-6">
          <div className="w-full h-full border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Procesando Reembolso</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Actualizando inventario y registrando la operación...</p>
      </div>
    );
  }

  // ── SUCCESS/ERROR SCREEN ──
  if (pageState === 'success' && processResult) {
    return (
      <div className="max-w-md mx-auto text-center py-12 animate-fade-in">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
          processResult.success ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          {processResult.success
            ? <CheckCircle className="w-10 h-10 text-emerald-600" />
            : <XCircle className="w-10 h-10 text-red-600" />
          }
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
          {processResult.success ? 'Reembolso Completado' : 'Error al Procesar'}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">{processResult.message}</p>

        {processResult.success && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-4 h-4 text-amber-500" />
              <span className="text-slate-500">Reembolso ID:</span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate">{processResult.reembolsoId}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span className="text-slate-500">Código usado:</span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{authCode}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={resetAll} className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm cursor-pointer transition-colors whitespace-nowrap">
            Nuevo Reembolso
          </button>
          <button onClick={() => { setPageState('search'); setFactura(null); setProcessResult(null); }} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap">
            Volver a Buscar
          </button>
        </div>
      </div>
    );
  }

  return null;
}