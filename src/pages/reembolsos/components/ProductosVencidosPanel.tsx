import { useState, useEffect } from 'react';
import { Package, Trash2, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';

interface ProductoVencido {
  id: string;
  producto_id?: string;
  nombre_producto: string;
  numero_lote: string;
  cantidad: number;
  fecha_vencimiento: string;
  fecha_ingreso: string;
  estado: string;
  motivo?: string;
}

export default function ProductosVencidosPanel() {
  const [productos, setProductos] = useState<ProductoVencido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<string>('todos');

  useEffect(() => {
    loadProductos();
  }, []);

  const loadProductos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('productos_vencidos_farmacia')
      .select('*')
      .order('fecha_ingreso', { ascending: false })
      .limit(100);

    setProductos((data || []) as ProductoVencido[]);
    setLoading(false);
  };

  const handleMarcarDestruido = async (id: string) => {
    await supabase.from('productos_vencidos_farmacia').update({ estado: 'destruido', updated_at: new Date().toISOString() }).eq('id', id);
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: 'destruido' } : p)));
  };

  const handleDescartar = async (id: string) => {
    await supabase.from('productos_vencidos_farmacia').update({ estado: 'descartado', updated_at: new Date().toISOString() }).eq('id', id);
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: 'descartado' } : p)));
  };

  const filtered = filterEstado === 'todos'
    ? productos
    : productos.filter((p) => p.estado === filterEstado);

  const estadoConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    pendiente: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'Pendiente', icon: <Clock className="w-3 h-3" /> },
    destruido: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'Destruido', icon: <XCircle className="w-3 h-3" /> },
    descartado: { color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300', label: 'Descartado', icon: <Trash2 className="w-3 h-3" /> },
  };

  const totales = {
    pendiente: productos.filter((p) => p.estado === 'pendiente').reduce((s, p) => s + p.cantidad, 0),
    destruido: productos.filter((p) => p.estado === 'destruido').reduce((s, p) => s + p.cantidad, 0),
    descartado: productos.filter((p) => p.estado === 'descartado').reduce((s, p) => s + p.cantidad, 0),
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['pendiente', 'destruido', 'descartado'] as const).map((est) => {
          const cfg = estadoConfig[est];
          return (
            <button
              key={est}
              onClick={() => setFilterEstado(filterEstado === est ? 'todos' : est)}
              className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                filterEstado === est
                  ? est === 'pendiente' ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                    est === 'destruido' ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                    'border-slate-400 bg-slate-50 dark:bg-slate-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                  {cfg.icon}{cfg.label}
                </span>
              </div>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{totales[est]}</p>
              <p className="text-xs text-slate-400">unidades</p>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Inventario de Productos Vencidos
          </h3>
          <span className="text-xs text-slate-400">{filtered.length} registros</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No hay productos vencidos registrados</p>
            <p className="text-xs text-slate-400 mt-1">Los productos vencidos de reembolsos aparecerán aquí</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400 font-medium">Producto</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Lote</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Cantidad</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Fecha Venc.</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Ingreso</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Estado</th>
                  <th className="text-center p-3 text-slate-600 dark:text-slate-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const cfg = estadoConfig[p.estado] || estadoConfig.pendiente;
                  return (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg flex-shrink-0">
                            <Package className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white text-xs">{p.nombre_producto}</p>
                            {p.motivo && <p className="text-xs text-slate-400">{p.motivo}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono text-xs text-slate-600 dark:text-slate-400">{p.numero_lote}</td>
                      <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">{p.cantidad}</td>
                      <td className="p-3 text-center text-xs text-slate-500">
                        {new Date(p.fecha_vencimiento).toLocaleDateString('es-DO')}
                      </td>
                      <td className="p-3 text-center text-xs text-slate-400">
                        {new Date(p.fecha_ingreso).toLocaleDateString('es-DO')}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          {p.estado === 'pendiente' && (
                            <>
                              <button onClick={() => handleMarcarDestruido(p.id)}
                                className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs font-medium hover:bg-red-200 cursor-pointer whitespace-nowrap transition-colors"
                              >
                                Destruir
                              </button>
                              <button onClick={() => handleDescartar(p.id)}
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs font-medium hover:bg-slate-200 cursor-pointer whitespace-nowrap transition-colors"
                              >
                                Descartar
                              </button>
                            </>
                          )}
                          {(p.estado === 'destruido' || p.estado === 'descartado') && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}