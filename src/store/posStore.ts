import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, Supplier, SupplierPurchase, ReturnToSupplier, AbonoCompra, Client, Sale, SavedTicket } from '@/types';
import { generateId, now } from '@/utils/formatters';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import {
  loadAllData,
  upsertSupplier,
  deleteSupplierRemote,
  insertSupplierPurchase,
  updatePurchaseRemote,
  updatePurchasePaymentStatus,
  insertAbono,
  insertReturnToSupplier,
  updateReturnStatusRemote,
  deletePurchaseRemote,
  upsertProduct,
  initStockForNewProduct,
  deleteProductRemote,
  insertSaleRemote,
  updateProductStockRemote,
  upsertClient,
  loadCachedProducts,
  fetchProducts,
} from '@/services/supabaseService';

/**
 * Calcula el descuento por oferta tipo "NxM".
 * Ej: "3x2" con cantidad 3 → 1 item gratis → descuento = 1 × precio × (1 - descLinea/100)
 * Retorna { freeItems, discount }
 */
function parseOfferDiscount(
  offer: string,
  quantity: number,
  unitPrice: number,
  lineDiscount: number,
): { freeItems: number; discount: number } {
  const match = offer.match(/^(\d+)x(\d+)$/);
  if (!match) return { freeItems: 0, discount: 0 };
  const N = parseInt(match[1], 10);
  const M = parseInt(match[2], 10);
  // Oferta inválida o no alcanza la cantidad mínima
  if (N <= M || N <= 0 || quantity < N) return { freeItems: 0, discount: 0 };
  const freePerGroup = N - M;
  const groups = Math.floor(quantity / N);
  const freeItems = groups * freePerGroup;
  const discount = freeItems * unitPrice * (1 - lineDiscount / 100);
  return { freeItems, discount };
}

export interface POSState {
  products: Product[];
  sales: Sale[];
  suppliers: Supplier[];
  supplierPurchases: SupplierPurchase[];
  returnsToSupplier: ReturnToSupplier[];
  reprintedSales: string[];
  isLoaded: boolean;
  cart: import('@/types').CartItem[];
  globalDiscount: number;
  ncfType: import('@/types').NCFType;
  clientRnc: string;
  clientName: string;
  cashReceived: number;
  cardAmount: number;
  clients: Client[];
  currentClient: Client | null;
  activeInsurance: import('@/types').ActiveInsurance | null;
  savedTickets: SavedTicket[];
  loadFromSupabase: () => Promise<void>;
  addSupplier: (supplierData: Omit<Supplier, 'id' | 'createdAt'>) => Promise<void>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  addSupplierPurchase: (purchaseData: Omit<SupplierPurchase, 'id' | 'createdAt'>) => Promise<void>;
  editPurchase: (id: string, updates: Partial<SupplierPurchase>) => Promise<void>;
  markPurchasePaid: (id: string) => Promise<void>;
  addAbono: (abonoData: Omit<AbonoCompra, 'id' | 'createdAt'>) => Promise<void>;
  addReturnToSupplier: (retData: Omit<ReturnToSupplier, 'id' | 'createdAt'>) => Promise<void>;
  updateReturnStatus: (id: string, status: ReturnToSupplier['status']) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  getExpiringProductsIn6Months: () => Product[];
  markSaleReprinted: (saleId: string) => void;
  clearLocalDemoData: () => void;
  addProduct: (productData: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  updateLineDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  setGlobalDiscount: (discount: number) => void;
  setNCFType: (type: import('@/types').NCFType) => void;
  setClientInfo: (rnc: string, name: string) => void;
  setPaymentAmounts: (cash: number, card: number) => void;
  setCurrentClient: (client: Client | null) => void;
  addClient: (clientData: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>;
  searchClients: (query: string) => Client[];
  setActiveInsurance: (insurance: import('@/types').ActiveInsurance | null) => void;
  saveTicket: (label: string) => void;
  restoreTicket: (ticketId: string) => void;
  deleteTicket: (ticketId: string) => void;
  calcTotals: () => { subtotal: number; offerDiscount: number; discountAmount: number; afterDiscount: number; itbis: number; insuranceCoverage: number; total: number };
  completeSale: (paymentMethod: import('@/types').PaymentMethod, cashierId: string, cashierName: string, branchId: string) => Sale | null;
  getStockInBranch: (productId: string, branchId: string) => number;
  getStockInOtherBranches: (productId: string, currentBranchId: string) => { branchId: string; stock: number }[];
  getTodaySales: (cashierId?: string, branchId?: string) => Sale[];
  getLowStockProducts: (branchId: string, threshold?: number) => Product[];
  getExpiringProducts: (days?: number) => Product[];
  getSalesStats: (branchId?: string) => { total: number; count: number; average: number };
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      products: [],
      sales: [],
      suppliers: [],
      supplierPurchases: [],
      returnsToSupplier: [],
      reprintedSales: [],
      isLoaded: false,
      cart: [],
      globalDiscount: 0,
      ncfType: 'B02',
      clientRnc: '',
      clientName: 'Cliente General',
      cashReceived: 0,
      cardAmount: 0,
      clients: [],
      currentClient: null,
      activeInsurance: null,
      savedTickets: [],

      loadFromSupabase: async () => {
        const current = get();

        // ── STEP 1: Load from IndexedDB cache INSTANTLY ─────────────────
        try {
          const cachedProducts = await loadCachedProducts();
          if (cachedProducts && cachedProducts.length > 0) {
            set((s) => ({
              products: cachedProducts,
              isLoaded: true,
            }));
            console.log(`[loadFromSupabase] Loaded ${cachedProducts.length} products from cache instantly`);
          }
        } catch (cacheErr) {
          console.warn('[loadFromSupabase] Cache read skipped:', cacheErr);
        }

        // ── STEP 2: Fetch fresh data from Supabase (parallel pages) ────
        try {
          const data = await loadAllData();
          set({
            products: data.products.length > 0 ? data.products : current.products,
            clients: data.clients.length > 0 ? data.clients : current.clients,
            suppliers: data.suppliers.length > 0 ? data.suppliers : current.suppliers,
            supplierPurchases: data.supplierPurchases.length > 0 ? data.supplierPurchases : current.supplierPurchases,
            returnsToSupplier: data.returnsToSupplier.length > 0 ? data.returnsToSupplier : current.returnsToSupplier,
            sales: data.sales.length > 0 ? data.sales : current.sales,
            isLoaded: true,
          });
          // Also update branches & users in authStore if they came back
          if (data.branches.length > 0) {
            useAuthStore.setState((s) => ({ branches: data.branches }));
          }
          if (data.users.length > 0) {
            useAuthStore.setState((s) => ({ users: data.users }));
          }
        } catch (err) {
          console.error('[loadFromSupabase] fatal error:', err);
          // Still mark as loaded so UI doesn't hang forever
          set({ isLoaded: true });
        }
      },

      addSupplier: async (supplierData) => {
        const newSupplier: Supplier = { ...supplierData, id: generateId(), createdAt: now() };
        set((s) => ({ suppliers: [...s.suppliers, newSupplier] }));
        await upsertSupplier(newSupplier);
      },

      updateSupplier: async (id, updates) => {
        set((s) => ({ suppliers: s.suppliers.map((sup) => (sup.id === id ? { ...sup, ...updates } : sup)) }));
        const updated = get().suppliers.find((s) => s.id === id);
        if (updated) await upsertSupplier(updated);
      },

      deleteSupplier: async (id) => {
        set((s) => ({ suppliers: s.suppliers.filter((sup) => sup.id !== id) }));
        await deleteSupplierRemote(id);
      },

      addSupplierPurchase: async (purchaseData) => {
        const newPurchase: SupplierPurchase = { ...purchaseData, id: generateId(), createdAt: now() };
        set((s) => ({ supplierPurchases: [...s.supplierPurchases, newPurchase] }));
        await insertSupplierPurchase(newPurchase);
      },

      editPurchase: async (id, updates) => {
        set((s) => ({
          supplierPurchases: s.supplierPurchases.map((p) =>
            p.id === id ? { ...p, ...updates, wasEditedOnce: true } : p
          ),
        }));
        await updatePurchaseRemote(id, { ...updates, wasEditedOnce: true });
      },

      markPurchasePaid: async (id) => {
        set((s) => ({
          supplierPurchases: s.supplierPurchases.map((p) =>
            p.id === id ? { ...p, estadoPago: 'pagado' as const } : p
          ),
        }));
        await updatePurchasePaymentStatus(id, 'pagado');
      },

      addAbono: async (abonoData) => {
        const newAbono: AbonoCompra = { ...abonoData, id: generateId(), createdAt: now() };
        set((s) => ({
          supplierPurchases: s.supplierPurchases.map((p) => {
            if (p.id !== abonoData.compraId) return p;
            const abonos = [...(p.abonos || []), newAbono];
            const totalAbonado = abonos.reduce((sum, a) => sum + a.monto, 0);
            const estadoPago: 'pagado' | 'pendiente' | 'vencido' = totalAbonado >= p.total ? 'pagado' : p.estadoPago;
            return { ...p, abonos, estadoPago };
          }),
        }));
        await insertAbono(newAbono);
        // If fully paid, update status
        const purchase = get().supplierPurchases.find((p) => p.id === abonoData.compraId);
        if (purchase && purchase.estadoPago === 'pagado') {
          await updatePurchasePaymentStatus(abonoData.compraId, 'pagado');
        }
      },

      addReturnToSupplier: async (retData) => {
        const newReturn: ReturnToSupplier = { ...retData, id: generateId(), createdAt: now() };
        set((s) => ({ returnsToSupplier: [...s.returnsToSupplier, newReturn] }));
        await insertReturnToSupplier(newReturn);
      },

      updateReturnStatus: async (id, status) => {
        set((s) => ({ returnsToSupplier: s.returnsToSupplier.map((r) => (r.id === id ? { ...r, status } : r)) }));
        await updateReturnStatusRemote(id, status);
      },

      deletePurchase: async (id) => {
        set((s) => ({ supplierPurchases: s.supplierPurchases.filter((p) => p.id !== id) }));
        await deletePurchaseRemote(id);
      },

      getExpiringProductsIn6Months: () => {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() + 6);
        return get().products.filter((p) => {
          const expiry = new Date(p.expiryDate);
          return expiry <= cutoff && p.isActive;
        });
      },

      markSaleReprinted: (saleId) =>
        set((s) => ({ reprintedSales: [...s.reprintedSales, saleId] })),

      clearLocalDemoData: () => {
        set({
          products: [],
          clients: [],
          suppliers: [],
          supplierPurchases: [],
          returnsToSupplier: [],
        });
      },

      addProduct: async (productData) => {
        const newProduct: Product = { ...productData, id: generateId(), createdAt: now() };
        set((s) => ({ products: [...s.products, newProduct] }));
        // Save product to DB and initialize stock for ALL branches
        await upsertProduct(newProduct);
        await initStockForNewProduct(newProduct.id, newProduct.stock);
      },

      updateProduct: async (id, updates) => {
        set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, ...updates } : p)) }));
        const updated = get().products.find((p) => p.id === id);
        if (updated) await upsertProduct(updated);
      },

      deleteProduct: async (id) => {
        set((s) => ({ products: s.products.filter((p) => p.id !== id) }));
        await deleteProductRemote(id);
      },

      addToCart: (product, quantity = 1) => {
        set((s) => {
          const existing = s.cart.find((item) => item.product.id === product.id);
          if (existing) {
            return {
              cart: s.cart.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return {
            cart: [...s.cart, { product, quantity, unitPrice: product.price, lineDiscount: 0 }],
          };
        });
      },

      removeFromCart: (productId) =>
        set((s) => ({ cart: s.cart.filter((item) => item.product.id !== productId) })),

      updateCartQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(productId);
          return;
        }
        set((s) => ({
          cart: s.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          ),
        }));
      },

      updateLineDiscount: (productId, discount) =>
        set((s) => ({
          cart: s.cart.map((item) =>
            item.product.id === productId ? { ...item, lineDiscount: discount } : item
          ),
        })),

      clearCart: () =>
        set({
          cart: [],
          globalDiscount: 0,
          clientRnc: '',
          clientName: 'Cliente General',
          cashReceived: 0,
          cardAmount: 0,
          currentClient: null,
          activeInsurance: null,
          ncfType: 'B02',
        }),

      setGlobalDiscount: (discount) => set({ globalDiscount: discount }),
      setNCFType: (type) => set({ ncfType: type }),
      setClientInfo: (rnc, name) => set({ clientRnc: rnc, clientName: name }),
      setPaymentAmounts: (cash, card) => set({ cashReceived: cash, cardAmount: card }),

      setCurrentClient: (client) => {
        set({ currentClient: client });
        if (client) {
          set({
            ncfType: client.defaultNCF,
            clientRnc: client.cedula || client.rnc || '',
            clientName: client.name,
          });
        } else {
          set({ clientRnc: '', clientName: 'Cliente General', ncfType: 'B02' });
        }
      },

      addClient: async (clientData) => {
        const newClient: Client = { ...clientData, id: generateId(), createdAt: now() };
        set((s) => ({ clients: [...s.clients, newClient] }));
        await upsertClient(newClient);
        return newClient;
      },

      searchClients: (query) => {
        const q = query.toLowerCase().trim();
        if (!q) return get().clients.slice(0, 8);
        return get().clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.cedula && c.cedula.includes(q)) ||
            (c.rnc && c.rnc.includes(q)) ||
            (c.phone && c.phone.includes(q))
        );
      },

      setActiveInsurance: (insurance) => set({ activeInsurance: insurance }),

      saveTicket: (label) => {
        const { cart, globalDiscount, ncfType, currentClient, activeInsurance } = get();
        if (cart.length === 0) return;
        const ticket: SavedTicket = {
          id: generateId(),
          label,
          cart: [...cart],
          globalDiscount,
          ncfType,
          client: currentClient ?? undefined,
          insurance: activeInsurance ?? undefined,
          savedAt: now(),
        };
        set((s) => ({ savedTickets: [...s.savedTickets, ticket] }));
        get().clearCart();
      },

      restoreTicket: (ticketId) => {
        const ticket = get().savedTickets.find((t) => t.id === ticketId);
        if (!ticket) return;
        set({
          cart: [...ticket.cart],
          globalDiscount: ticket.globalDiscount,
          ncfType: ticket.ncfType,
          currentClient: ticket.client ?? null,
          activeInsurance: ticket.insurance ?? null,
          clientRnc: ticket.client?.cedula || ticket.client?.rnc || '',
          clientName: ticket.client?.name || 'Cliente General',
          savedTickets: get().savedTickets.filter((t) => t.id !== ticketId),
        });
      },

      deleteTicket: (ticketId) =>
        set((s) => ({ savedTickets: s.savedTickets.filter((t) => t.id !== ticketId) })),

      calcTotals: () => {
        const { cart, globalDiscount, activeInsurance } = get();

        let totalOfferDiscount = 0;
        const lineDetails: { itemTotal: number; offerDisc: number; afterOffer: number }[] = [];

        const subtotal = cart.reduce((sum, item) => {
          const lineTotal = item.quantity * item.unitPrice * (1 - item.lineDiscount / 100);
          let offerDisc = 0;
          const offer = item.product.offer;
          if (offer) {
            const result = parseOfferDiscount(offer, item.quantity, item.unitPrice, item.lineDiscount);
            offerDisc = result.discount;
            totalOfferDiscount += offerDisc;
          }
          lineDetails.push({ itemTotal: lineTotal, offerDisc, afterOffer: lineTotal - offerDisc });
          return sum + lineTotal;
        }, 0);

        const afterOffer = subtotal - totalOfferDiscount;
        const discountAmount = afterOffer * (globalDiscount / 100);
        const afterGlobalDiscount = afterOffer - discountAmount;

        const itbis = cart.reduce((sum, item, idx) => {
          if (!item.product.itbisApplicable) return sum;
          const detail = lineDetails[idx];
          const lineAfterGlobal = detail.afterOffer * (1 - globalDiscount / 100);
          return sum + lineAfterGlobal * 0.18;
        }, 0);

        const beforeInsurance = afterGlobalDiscount + itbis;
        const insuranceCoverage = activeInsurance
          ? beforeInsurance * (activeInsurance.coveragePercent / 100)
          : 0;
        const total = beforeInsurance - insuranceCoverage;

        return { subtotal, offerDiscount: totalOfferDiscount, discountAmount, afterDiscount: afterGlobalDiscount, itbis, insuranceCoverage, total };
      },

      completeSale: (paymentMethod, cashierId, cashierName, branchId) => {
        const { cart, globalDiscount, ncfType, clientRnc, clientName, cashReceived, cardAmount, activeInsurance, currentClient } = get();
        if (cart.length === 0) return null;
        const { subtotal, discountAmount, itbis, insuranceCoverage, total } = get().calcTotals();
        const ncf = useAppStore.getState().nextNCF(ncfType);

        const sale: Sale = {
          id: generateId(),
          branchId,
          cashierId,
          cashierName,
          items: [...cart],
          subtotal,
          itbis,
          discount: globalDiscount,
          insuranceCoverage: insuranceCoverage > 0 ? insuranceCoverage : undefined,
          insuranceName: activeInsurance?.planName,
          total,
          paymentMethod,
          cashAmount: paymentMethod === 'efectivo' || paymentMethod === 'mixto' ? cashReceived : undefined,
          cardAmount: paymentMethod === 'tarjeta' || paymentMethod === 'mixto' ? cardAmount : undefined,
          change: paymentMethod === 'efectivo' ? cashReceived - total : undefined,
          ncf,
          ncfType,
          clientId: currentClient?.id,
          clientRnc: ncfType === 'B01' ? clientRnc : undefined,
          clientName,
          timestamp: now(),
          status: 'completed',
        };

        set((s) => ({
          sales: [...s.sales, sale],
          products: s.products.map((p) => {
            const cartItem = cart.find((c) => c.product.id === p.id);
            if (cartItem) {
              const newQty = Math.max(0, (p.stock[branchId] || 0) - cartItem.quantity);
              updateProductStockRemote(p.id, branchId, newQty).catch(() => {});
              return { ...p, stock: { ...p.stock, [branchId]: newQty } };
            }
            return p;
          }),
        }));

        // Guardar venta en Supabase en tiempo real
        insertSaleRemote(sale).catch(() => {});

        get().clearCart();
        return sale;
      },

      getStockInBranch: (productId, branchId) => {
        const product = get().products.find((p) => p.id === productId);
        return product?.stock[branchId] || 0;
      },

      getStockInOtherBranches: (productId, currentBranchId) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product) return [];
        return Object.entries(product.stock)
          .filter(([branchId]) => branchId !== currentBranchId)
          .map(([branchId, stock]) => ({ branchId, stock }));
      },

      getTodaySales: (cashierId, branchId) => {
        const today = new Date().toISOString().split('T')[0];
        return get().sales.filter((s) => {
          const saleDate = s.timestamp.split('T')[0];
          const matchDate = saleDate === today;
          const matchCashier = cashierId ? s.cashierId === cashierId : true;
          const matchBranch = branchId ? s.branchId === branchId : true;
          return matchDate && matchCashier && matchBranch && s.status === 'completed';
        });
      },

      getLowStockProducts: (branchId, threshold = 10) =>
        get().products.filter((p) => (p.stock[branchId] || 0) <= threshold && p.isActive),

      getExpiringProducts: (days = 150) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + days);
        return get().products.filter((p) => {
          if (!p.expiryDate || !p.isActive) return false;
          const expiry = new Date(p.expiryDate);
          if (isNaN(expiry.getTime())) return false;
          return expiry <= cutoff;
        });
      },

      getSalesStats: (branchId) => {
        const todaySales = get().getTodaySales(undefined, branchId);
        const total = todaySales.reduce((sum, s) => sum + s.total, 0);
        return {
          total,
          count: todaySales.length,
          average: todaySales.length > 0 ? total / todaySales.length : 0,
        };
      },
    }),
    {
      name: 'genosan-pos',
      partialize: (state) => ({
        cart: state.cart,
        globalDiscount: state.globalDiscount,
        ncfType: state.ncfType,
        clientRnc: state.clientRnc,
        clientName: state.clientName,
        cashReceived: state.cashReceived,
        cardAmount: state.cardAmount,
        currentClient: state.currentClient,
        activeInsurance: state.activeInsurance,
        savedTickets: state.savedTickets,
        reprintedSales: state.reprintedSales,
      }),
      onError: (err) => {
        console.error('Persist error:', err);
        if (err instanceof Error && err.name === 'QuotaExceededError') {
          try {
            localStorage.removeItem('genosan-pos');
            console.warn('Cleared localStorage due to quota exceeded');
          } catch (e) {
            console.error('Failed to clear localStorage:', e);
          }
        }
      },
    }
  )
);