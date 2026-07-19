// Real-time sync service - keeps products fresh across all clients
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types';
import { usePOSStore } from '@/store/posStore';

type RealtimeCallback = () => void;

let channel: ReturnType<typeof supabase.channel> | null = null;
let listeners: RealtimeCallback[] = [];

/** Convert raw Supabase row to Product shape */
function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    barcode: (row.barcode as string) || '',
    code: (row.code as string) || '',
    commercialName: (row.commercial_name as string) || '',
    genericName: (row.generic_name as string) || '',
    lab: (row.lab as string) || '',
    presentation: (row.presentation as string) || '',
    price: (row.price as number) || 0,
    wholesalePrice: (row.wholesale_price as number) || undefined,
    purchaseCost: (row.purchase_cost as number) || 0,
    autoCalcPrice: (row.auto_calc_price as boolean) || false,
    itbisApplicable: (row.itbis_applicable as boolean) || false,
    stock: {} as Record<string, number>,
    expiryDate: (row.expiry_date as string) || '',
    lote: (row.lote as string) || '',
    image: (row.image as string) || '',
    estante: (row.estante as string) || '',
    posicion: (row.posicion as string) || '',
    descripcion: (row.descripcion as string) || '',
    offer: (row.offer as string) || '',
    isActive: (row.is_active as boolean) ?? true,
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

/** Merge stock data into product list */
function mergeStock(products: Product[], stockRows: Record<string, unknown>[]): Product[] {
  const stockMap: Record<string, Record<string, number>> = {};
  for (const row of stockRows) {
    const pid = row.producto_id as string;
    const bid = row.sucursal_id as string;
    const qty = (row.cantidad as number) || 0;
    if (!stockMap[pid]) stockMap[pid] = {};
    stockMap[pid][bid] = qty;
  }
  return products.map((p) => ({
    ...p,
    stock: stockMap[p.id] || p.stock,
  }));
}

/**
 * Subscribe to realtime changes on productos_farmacia and stock_farmacia.
 * When a product is inserted/updated/deleted, the store is automatically refreshed.
 */
export function subscribeToProductChanges(): () => void {
  if (channel) {
    // Already subscribed
    return () => {};
  }

  channel = supabase
    .channel('product-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'productos_farmacia' },
      (payload) => {
        console.log('[realtimeSync] Product change detected:', payload.eventType, payload.new?.id || payload.old?.id);
        handleProductChange(payload.eventType, payload.new as Record<string, unknown> | null, payload.old as Record<string, unknown> | null);
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stock_farmacia' },
      () => {
        // Stock changed - refresh just stock data
        console.log('[realtimeSync] Stock change detected');
        refreshStockOnly();
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtimeSync] Subscribed to product changes');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('[realtimeSync] Channel error, will retry...');
        channel = null;
        setTimeout(() => subscribeToProductChanges(), 5000);
      }
    });

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}

async function handleProductChange(
  eventType: string,
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null,
) {
  const store = usePOSStore.getState();
  const products = [...store.products];

  if (eventType === 'INSERT' && newRow) {
    const newProduct = rowToProduct(newRow);
    // Fetch stock for this product
    try {
      const { data: stockData } = await supabase
        .from('stock_farmacia')
        .select('producto_id, sucursal_id, cantidad')
        .eq('producto_id', newProduct.id);
      if (stockData) {
        const merged = mergeStock([newProduct], stockData);
        usePOSStore.setState({ products: [...products, merged[0]] });
        return;
      }
    } catch (_err) {
      // stock fetch failed, proceed without stock data
    }
    usePOSStore.setState({ products: [...products, newProduct] });
  } else if (eventType === 'UPDATE' && newRow) {
    const updatedProduct = rowToProduct(newRow);
    usePOSStore.setState({
      products: products.map((p) => (p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p)),
    });
    // Also update the IndexedDB cache for this one product
    invalidateProductCache(updatedProduct.id);
  } else if (eventType === 'DELETE' && oldRow) {
    usePOSStore.setState({
      products: products.filter((p) => p.id !== (oldRow.id as string)),
    });
    // Remove from IndexedDB cache
    removeProductFromCache(oldRow.id as string);
  }

  // Notify any external listeners
  listeners.forEach((fn) => fn());
}

async function refreshStockOnly() {
  try {
    const { data: stockData } = await supabase
      .from('stock_farmacia')
      .select('producto_id, sucursal_id, cantidad');

    if (stockData) {
      const store = usePOSStore.getState();
      const merged = mergeStock(store.products, stockData);
      usePOSStore.setState({ products: merged });
    }
  } catch (err) {
    console.warn('[realtimeSync] Stock refresh failed:', err);
  }
}

/** Invalidate a single product in the IndexedDB cache */
async function invalidateProductCache(productId: string) {
  try {
    const { loadProductsFromCache, saveProductsToCache } = await import('@/utils/productCache');
    const cached = await loadProductsFromCache();
    if (!cached) return;

    const store = usePOSStore.getState();
    const updatedProduct = store.products.find((p) => p.id === productId);
    if (!updatedProduct) return;

    // Update the single product in the cached array
    const idx = cached.products.findIndex((p: Record<string, unknown>) => p.id === productId);
    if (idx >= 0) {
      cached.products[idx] = { ...cached.products[idx], ...updatedProduct };
      await saveProductsToCache(cached.products, cached.stocks, cached.lotes);
    }
  } catch (err) {
    console.warn('[realtimeSync] Cache invalidation skipped:', err);
  }
}

/** Remove a single product from the IndexedDB cache */
async function removeProductFromCache(productId: string) {
  try {
    const { loadProductsFromCache, saveProductsToCache } = await import('@/utils/productCache');
    const cached = await loadProductsFromCache();
    if (!cached) return;

    cached.products = cached.products.filter((p: Record<string, unknown>) => p.id !== productId);
    await saveProductsToCache(cached.products, cached.stocks, cached.lotes);
  } catch (err) {
    console.warn('[realtimeSync] Cache removal skipped:', err);
  }
}

/** Add a listener for any product change */
export function onProductChange(callback: RealtimeCallback): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}