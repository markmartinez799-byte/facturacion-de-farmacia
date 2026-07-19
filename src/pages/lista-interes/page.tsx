import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { ListaInteresForm } from './components/ListaInteresForm';
import { ListaInteresTable } from './components/ListaInteresTable';
import { ListaInteresSearch } from './components/ListaInteresSearch';
import { ListaInteresNotification } from './components/ListaInteresNotification';

export interface InteresItem {
  id: string;
  nombre_producto: string;
  nombre_cliente: string | null;
  nota: string | null;
  fecha_registro: string;
}

export default function ListaInteresPage() {
  const { currentUser } = useAuthStore();
  const [items, setItems] = useState<InteresItem[]>([]);
  const [filtered, setFiltered] = useState<InteresItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('lista_interes_cliente')
      .select('id, nombre_producto, nombre_cliente, nota, fecha_registro')
      .order('fecha_registro', { ascending: false });

    if (!error && data) {
      setItems(data as InteresItem[]);
    }
    setLoading(false);
  }, []);

  // Check if any item in the list now exists in products
  const checkAndAutoRemove = useCallback(async (currentItems: InteresItem[]) => {
    if (currentItems.length === 0) return;

    const names = currentItems.map((i) => i.nombre_producto.toLowerCase());
    const { data: found } = await supabase
      .from('productos_farmacia')
      .select('commercial_name');

    if (!found || found.length === 0) return;

    const foundNames = found.map((p: { commercial_name: string }) => p.commercial_name.toLowerCase());
    const toRemove = currentItems.filter((item) =>
      foundNames.some(
        (fn) =>
          fn.includes(item.nombre_producto.toLowerCase()) ||
          item.nombre_producto.toLowerCase().includes(fn)
      )
    );

    if (toRemove.length === 0) return;

    const ids = toRemove.map((i) => i.id);
    await supabase.from('lista_interes_cliente').delete().in('id', ids);

    const removedNames = toRemove.map((i) => i.nombre_producto).join(', ');
    showNotification('info', `Producto(s) ya disponible(s) en inventario y removido(s): ${removedNames}`);
    await fetchItems();
  }, [fetchItems, showNotification]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (items.length > 0) {
      checkAndAutoRemove(items);
    }
  }, [items, checkAndAutoRemove]);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(items);
    } else {
      setFiltered(
        items.filter(
          (i) =>
            i.nombre_producto.toLowerCase().includes(q) ||
            (i.nombre_cliente && i.nombre_cliente.toLowerCase().includes(q)) ||
            (i.nota && i.nota.toLowerCase().includes(q))
        )
      );
    }
  }, [search, items]);

  const handleAdd = async (nombre: string, cliente: string, nota: string) => {
    const trimmed = nombre.trim();
    if (!trimmed) return;

    // Check duplicate in list
    const exists = items.some(
      (i) => i.nombre_producto.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      showNotification('error', 'Este producto ya fue registrado en la lista');
      return;
    }

    // Check if already in inventory
    const { data: inStock } = await supabase
      .from('productos_farmacia')
      .select('commercial_name')
      .ilike('commercial_name', `%${trimmed}%`)
      .limit(1);

    if (inStock && inStock.length > 0) {
      showNotification('info', 'Este producto ya está disponible en inventario');
      return;
    }

    const { error } = await supabase.from('lista_interes_cliente').insert({
      nombre_producto: trimmed,
      nombre_cliente: cliente.trim() || null,
      nota: nota.trim() || null,
      registrado_por: currentUser?.id || null,
    });

    if (error) {
      showNotification('error', 'Error al guardar el producto');
    } else {
      showNotification('success', 'Producto agregado a la lista de interés');
      await fetchItems();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('lista_interes_cliente').delete().eq('id', id);
    if (!error) {
      showNotification('success', 'Producto eliminado de la lista');
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {notification && (
        <ListaInteresNotification type={notification.type} message={notification.message} />
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 flex items-center justify-center bg-emerald-100 rounded-xl">
            <i className="ri-heart-line text-emerald-600 text-xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
              Lista de Interés del Cliente
            </h1>
            <p className="text-sm text-slate-500">
              Registra productos solicitados que no están en inventario
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-1">
          <ListaInteresForm onAdd={handleAdd} />
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  Productos registrados
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {items.length}
                </span>
              </div>
              <ListaInteresSearch value={search} onChange={setSearch} />
            </div>

            <ListaInteresTable
              items={filtered}
              loading={loading}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
