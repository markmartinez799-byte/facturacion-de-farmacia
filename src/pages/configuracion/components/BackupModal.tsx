import { useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Loader, Database, Package, Users, FileText, ShoppingCart, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';

interface BackupModalProps {
  onClose: () => void;
}

type BackupType = 'products' | 'sales' | 'clients' | 'purchases';

interface BackupItem {
  type: BackupType;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  bgColor: string;
}

const BACKUP_ITEMS: BackupItem[] = [
  { type: 'products', label: 'Productos', icon: Package, description: 'Exporta todos los productos del inventario con stock, precios y ubicación', color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { type: 'sales', label: 'Ventas / Facturas', icon: FileText, description: 'Exporta todas las facturas completadas con detalle de items', color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/20' },
  { type: 'clients', label: 'Clientes', icon: Users, description: 'Exporta todos los clientes registrados con RNC y datos de contacto', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
  { type: 'purchases', label: 'Compras a Proveedores', icon: ShoppingCart, description: 'Exporta todas las compras a proveedores con sus detalles', color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/20' },
];

export default function BackupModal({ onClose }: BackupModalProps) {
  const { backupSettings, updateBackupSettings } = useAppStore();
  const [exporting, setExporting] = useState<BackupType | null>(null);
  const [completed, setCompleted] = useState<BackupType | null>(null);
  const [progress, setProgress] = useState(0);

  const handleToggleAutoBackup = () => {
    updateBackupSettings({ enabled: !backupSettings.enabled });
  };

  const handleChangeFrequency = (freq: 'daily' | 'weekly') => {
    updateBackupSettings({ frequency: freq });
  };

  const formatLastBackup = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const d = new Date(dateStr);
    return d.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
  };

  const handleExport = async (type: BackupType) => {
    setExporting(type);
    setCompleted(null);
    setProgress(0);

    try {
      switch (type) {
        case 'products': {
          // Paginate all products
          let allProducts: Record<string, unknown>[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data } = await supabase
              .from('productos_farmacia')
              .select('*')
              .order('commercial_name')
              .range(from, from + pageSize - 1);
            if (data && data.length > 0) {
              allProducts = allProducts.concat(data);
            }
            if (!data || data.length < pageSize) hasMore = false;
            else from += pageSize;
            setProgress(Math.min(100, Math.round((allProducts.length / 6236) * 100)));
          }

          // Fetch all stock
          let allStocks: Record<string, unknown>[] = [];
          let stockFrom = 0;
          let hasMoreStock = true;
          while (hasMoreStock) {
            const { data } = await supabase.from('stock_farmacia').select('producto_id, sucursal_id, cantidad').range(stockFrom, stockFrom + pageSize - 1);
            if (data && data.length > 0) allStocks = allStocks.concat(data);
            if (!data || data.length < pageSize) hasMoreStock = false;
            else stockFrom += pageSize;
          }

          const stockMap: Record<string, Record<string, number>> = {};
          allStocks.forEach((s: Record<string, unknown>) => {
            const pid = s.producto_id as string;
            const bid = s.sucursal_id as string;
            if (!pid || !bid) return;
            if (!stockMap[pid]) stockMap[pid] = {};
            stockMap[pid][bid] = Number(s.cantidad) || 0;
          });

          // Fetch branch names
          const { data: branches } = await supabase.from('branches').select('id, name');
          const branchNames: Record<string, string> = {};
          (branches || []).forEach((b: Record<string, unknown>) => { branchNames[b.id as string] = b.name as string; });

          const rows = allProducts.map((p: Record<string, unknown>) => {
            const pid = p.id as string;
            const stock = stockMap[pid] || {};
            const stockCols: Record<string, string> = {};
            Object.entries(stock).forEach(([bid, qty]) => {
              const bname = branchNames[bid] || bid;
              stockCols[`Stock_${bname.replace(/\s+/g, '_')}`] = qty;
            });

            return {
              ID: pid,
              'Código Barras': p.barcode || '',
              'Nombre Comercial': p.commercial_name || '',
              'Nombre Genérico': p.generic_name || '',
              Laboratorio: p.lab || '',
              Presentación: p.presentation || '',
              'Precio Venta': p.price || 0,
              'Precio Compra': p.purchase_cost || '',
              ITBIS: p.itbis_applicable ? 'Sí' : 'No',
              'Stock Total': Object.values(stock).reduce((a: number, b: number) => a + b, 0),
              ...stockCols,
              Estante: p.estante || '',
              Posición: p.posicion || '',
              'Fecha Vencimiento': p.expiry_date || '',
              Descripción: p.descripcion || '',
              Activo: p.is_active ? 'Sí' : 'No',
            };
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Productos');
          XLSX.writeFile(wb, `backup_productos_${new Date().toISOString().slice(0,10)}.xlsx`);
          break;
        }

        case 'sales': {
          let allSales: Record<string, unknown>[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data } = await supabase
              .from('facturas_farmacia')
              .select('*, detalle_factura_farmacia(*)')
              .eq('estado', 'completada')
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1);
            if (data && data.length > 0) allSales = allSales.concat(data);
            if (!data || data.length < pageSize) hasMore = false;
            else from += pageSize;
            setProgress(Math.min(100, Math.round((from / (from + 1000)) * 100)));
          }

          const rows = allSales.flatMap((f: Record<string, unknown>) => {
            const items = (f.detalle_factura_farmacia as Record<string, unknown>[]) || [];
            if (items.length === 0) {
              return [{
                'N° Factura': f.numero_factura || '',
                NCF: f.ncf || '',
                'Tipo NCF': f.tipo_ncf || '',
                Fecha: f.created_at ? new Date(f.created_at as string).toLocaleString('es-DO') : '',
                Cajero: f.usuario_id || '',
                Cliente: f.cliente_id || 'Consumidor Final',
                'Método Pago': f.metodo_pago || '',
                Subtotal: f.subtotal || 0,
                ITBIS: f.itbis_total || 0,
                Descuento: f.descuento || 0,
                Total: f.total || 0,
                Producto: '',
                Cantidad: '',
                'Precio Unitario': '',
                'Descuento Linea': '',
              }];
            }
            return items.map((item, idx) => ({
              'N° Factura': idx === 0 ? (f.numero_factura || '') : '',
              NCF: idx === 0 ? (f.ncf || '') : '',
              'Tipo NCF': idx === 0 ? (f.tipo_ncf || '') : '',
              Fecha: idx === 0 ? (f.created_at ? new Date(f.created_at as string).toLocaleString('es-DO') : '') : '',
              Cajero: idx === 0 ? (f.usuario_id || '') : '',
              Cliente: idx === 0 ? (f.cliente_id || 'Consumidor Final') : '',
              'Método Pago': idx === 0 ? (f.metodo_pago || '') : '',
              Subtotal: idx === 0 ? (f.subtotal || 0) : '',
              ITBIS: idx === 0 ? (f.itbis_total || 0) : '',
              Descuento: idx === 0 ? (f.descuento || 0) : '',
              Total: idx === 0 ? (f.total || 0) : '',
              Producto: item.nombre_producto || '',
              Cantidad: item.cantidad || 0,
              'Precio Unitario': item.precio || 0,
              'Descuento Linea': item.descuento || 0,
            }));
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
          XLSX.writeFile(wb, `backup_ventas_${new Date().toISOString().slice(0,10)}.xlsx`);
          break;
        }

        case 'clients': {
          let allClients: Record<string, unknown>[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data } = await supabase.from('clientes_farmacia').select('*').order('nombre').range(from, from + pageSize - 1);
            if (data && data.length > 0) allClients = allClients.concat(data);
            if (!data || data.length < pageSize) hasMore = false;
            else from += pageSize;
            setProgress(Math.min(100, Math.round((from / (from + 500)) * 100)));
          }

          const rows = allClients.map((c: Record<string, unknown>) => ({
            ID: c.id || '',
            Nombre: c.nombre || '',
            'RNC/Cédula': c.rnc_cedula || '',
            Teléfono: c.telefono || '',
            'Tipo NCF Default': c.tipo_ncf_default || '',
          }));

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
          XLSX.writeFile(wb, `backup_clientes_${new Date().toISOString().slice(0,10)}.xlsx`);
          break;
        }

        case 'purchases': {
          let allPurchases: Record<string, unknown>[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data } = await supabase
              .from('compras_proveedores_farmacia')
              .select('*, detalle_compras_farmacia(*)')
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1);
            if (data && data.length > 0) allPurchases = allPurchases.concat(data);
            if (!data || data.length < pageSize) hasMore = false;
            else from += pageSize;
            setProgress(Math.min(100, Math.round((from / (from + 500)) * 100)));
          }

          const rows = allPurchases.flatMap((p: Record<string, unknown>) => {
            const items = (p.detalle_compras_farmacia as Record<string, unknown>[]) || [];
            if (items.length === 0) {
              return [{
                ID: p.id || '',
                Proveedor: p.proveedor_nombre || '',
                Empresa: p.proveedor_empresa || '',
                'N° Factura': p.numero_factura || '',
                Fecha: p.fecha_compra || '',
                Total: p.total || 0,
                'Estado Pago': p.estado_pago || '',
                'Tipo Pago': p.tipo_pago || '',
                Producto: '',
                Cantidad: '',
                'Costo Unitario': '',
                Lote: '',
                Vencimiento: '',
              }];
            }
            return items.map((item, idx) => ({
              ID: idx === 0 ? (p.id || '') : '',
              Proveedor: idx === 0 ? (p.proveedor_nombre || '') : '',
              Empresa: idx === 0 ? (p.proveedor_empresa || '') : '',
              'N° Factura': idx === 0 ? (p.numero_factura || '') : '',
              Fecha: idx === 0 ? (p.fecha_compra || '') : '',
              Total: idx === 0 ? (p.total || 0) : '',
              'Estado Pago': idx === 0 ? (p.estado_pago || '') : '',
              'Tipo Pago': idx === 0 ? (p.tipo_pago || '') : '',
              Producto: item.producto_nombre || '',
              Cantidad: item.cantidad || 0,
              'Costo Unitario': item.costo_unitario || 0,
              Lote: item.lote || '',
              Vencimiento: item.fecha_vencimiento || '',
            }));
          });

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Compras');
          XLSX.writeFile(wb, `backup_compras_${new Date().toISOString().slice(0,10)}.xlsx`);
          break;
        }
      }

      setCompleted(type);
    } catch (err) {
      console.error('Backup error:', err);
    } finally {
      setExporting(null);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-bounce-in">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Copia de Seguridad</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Exporta tus datos a Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auto Backup Section */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-white text-sm">Backup Automático</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                El sistema exporta productos automáticamente según la frecuencia configurada
              </p>
            </div>
            <button
              onClick={handleToggleAutoBackup}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                backupSettings.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  backupSettings.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {backupSettings.enabled && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Frecuencia:</span>
                <div className="flex gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => handleChangeFrequency('daily')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      backupSettings.frequency === 'daily'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Diario
                  </button>
                  <button
                    onClick={() => handleChangeFrequency('weekly')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      backupSettings.frequency === 'weekly'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Semanal
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <i className="ri-time-line"></i>
                <span>Último backup: <span className="font-medium text-slate-700 dark:text-slate-300">{formatLastBackup(backupSettings.lastBackupDate)}</span></span>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          {BACKUP_ITEMS.map((item) => {
            const isExporting = exporting === item.type;
            const isCompleted = completed === item.type;
            const Icon = item.icon;

            return (
              <button
                key={item.type}
                onClick={() => !exporting && handleExport(item.type)}
                disabled={!!exporting}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  isCompleted
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'
                } ${exporting && !isExporting ? 'opacity-50' : ''}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${item.bgColor}`}>
                  {isExporting ? (
                    <Loader className="w-6 h-6 animate-spin text-slate-500" />
                  ) : isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <Icon className={`w-6 h-6 ${item.color}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">{item.label}</p>
                    {isCompleted && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Descargado</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                  {isExporting && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Exportando...</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                {!isExporting && !isCompleted && (
                  <Download className="w-5 h-5 text-slate-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-2xl">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Los archivos se descargan en formato Excel (.xlsx) y contienen todos los registros de tu base de datos.
          </p>
        </div>
      </div>
    </div>
  );
}