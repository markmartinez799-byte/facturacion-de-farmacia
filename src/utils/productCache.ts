// IndexedDB cache for products - instant load on revisit
const DB_NAME = 'genosan-product-cache';
const DB_VERSION = 1;
const CACHE_FORMAT_VERSION = 4; // v4: switched to get_products_light_page_v3 (no image/descripcion in bulk)
const STORE_NAME = 'products';
const META_KEY = '__meta__';
const PRODUCTS_KEY = '__products__';
const STOCKS_KEY = '__stocks__';
const LOTES_KEY = '__lotes__';

interface CacheMeta {
  productCount: number;
  stockCount: number;
  loteCount: number;
  lastUpdated: string;
  version: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getStore(mode: string = 'readonly'): Promise<IDBObjectStore> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Save products to cache ─────────────────────────────────────────────────

export async function saveProductsToCache(
  products: Record<string, unknown>[],
  stocks: Record<string, unknown>[],
  lotes: Record<string, unknown>[]
): Promise<void> {
  try {
    const store = await getStore('readwrite');

    const meta: CacheMeta = {
      productCount: products.length,
      stockCount: stocks.length,
      loteCount: lotes.length,
      lastUpdated: new Date().toISOString(),
      version: CACHE_FORMAT_VERSION,
    };

    await Promise.all([
      promisify(store.put(meta, META_KEY)),
      promisify(store.put(products, PRODUCTS_KEY)),
      promisify(store.put(stocks, STOCKS_KEY)),
      promisify(store.put(lotes, LOTES_KEY)),
    ]);
  } catch (err) {
    console.warn('[productCache] Failed to save cache:', err);
  }
}

// ─── Load products from cache ────────────────────────────────────────────────

export interface CachedData {
  products: Record<string, unknown>[];
  stocks: Record<string, unknown>[];
  lotes: Record<string, unknown>[];
  meta: CacheMeta | null;
}

export async function loadProductsFromCache(): Promise<CachedData | null> {
  try {
    const store = await getStore('readonly');

    const [meta, products, stocks, lotes] = await Promise.all([
      promisify(store.get(META_KEY)).catch(() => null),
      promisify(store.get(PRODUCTS_KEY)).catch(() => null),
      promisify(store.get(STOCKS_KEY)).catch(() => null),
      promisify(store.get(LOTES_KEY)).catch(() => null),
    ]);

    if (!meta || !products || !stocks) {
      return null;
    }

    // ⚠️ Version check: ignore stale cache after major data changes
    if (meta.version !== CACHE_FORMAT_VERSION) {
      console.warn(`[productCache] Cache version ${meta.version} is stale (current: ${CACHE_FORMAT_VERSION}), ignoring.`);
      await clearProductCache();
      return null;
    }

    return {
      products: products as Record<string, unknown>[],
      stocks: stocks as Record<string, unknown>[],
      lotes: (lotes as Record<string, unknown>[]) || [],
      meta: meta as CacheMeta,
    };
  } catch (err) {
    console.warn('[productCache] Failed to load cache:', err);
    return null;
  }
}

// ─── Get cache age ───────────────────────────────────────────────────────────

export async function getCacheAge(): Promise<number | null> {
  try {
    const store = await getStore('readonly');
    const meta = await promisify(store.get(META_KEY)).catch(() => null) as CacheMeta | null;
    if (!meta?.lastUpdated) return null;
    return new Date().getTime() - new Date(meta.lastUpdated).getTime();
  } catch {
    return null;
  }
}

// ─── Clear cache ─────────────────────────────────────────────────────────────

export async function clearProductCache(): Promise<void> {
  try {
    const store = await getStore('readwrite');
    await Promise.all([
      promisify(store.delete(META_KEY)),
      promisify(store.delete(PRODUCTS_KEY)),
      promisify(store.delete(STOCKS_KEY)),
      promisify(store.delete(LOTES_KEY)),
    ]);
  } catch (err) {
    console.warn('[productCache] Failed to clear cache:', err);
  }
}

// ─── Update single product in cache ──────────────────────────────────────────

export async function updateProductInCache(product: Record<string, unknown>): Promise<void> {
  try {
    const store = await getStore('readwrite');
    const raw = await promisify(store.get(PRODUCTS_KEY)).catch(() => null);
    if (!raw) return;
    const products = raw as Record<string, unknown>[];
    const idx = products.findIndex((p) => p.id === product.id);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...product };
      await promisify(store.put(products, PRODUCTS_KEY));
      // Update meta timestamp
      const meta = await promisify(store.get(META_KEY)).catch(() => null) as CacheMeta | null;
      if (meta) {
        meta.lastUpdated = new Date().toISOString();
        await promisify(store.put(meta, META_KEY));
      }
    }
  } catch (err) {
    console.warn('[productCache] Failed to update single product:', err);
  }
}

// ─── Remove single product from cache ───────────────────────────────────────

export async function removeProductFromCache(productId: string): Promise<void> {
  try {
    const store = await getStore('readwrite');
    const raw = await promisify(store.get(PRODUCTS_KEY)).catch(() => null);
    if (!raw) return;
    const products = raw as Record<string, unknown>[];
    const filtered = products.filter((p) => p.id !== productId);
    if (filtered.length === products.length) return; // not found
    await promisify(store.put(filtered, PRODUCTS_KEY));
    // Update meta
    const meta = await promisify(store.get(META_KEY)).catch(() => null) as CacheMeta | null;
    if (meta) {
      meta.productCount = filtered.length;
      meta.lastUpdated = new Date().toISOString();
      await promisify(store.put(meta, META_KEY));
    }
  } catch (err) {
    console.warn('[productCache] Failed to remove product from cache:', err);
  }
}

// ─── Invalidate all stock data (force re-fetch) ─────────────────────────────

export async function invalidateStockCache(): Promise<void> {
  try {
    const store = await getStore('readwrite');
    await promisify(store.delete(STOCKS_KEY));
    // Update meta
    const meta = await promisify(store.get(META_KEY)).catch(() => null) as CacheMeta | null;
    if (meta) {
      meta.lastUpdated = new Date().toISOString();
      await promisify(store.put(meta, META_KEY));
    }
  } catch (err) {
    console.warn('[productCache] Failed to invalidate stock cache:', err);
  }
}