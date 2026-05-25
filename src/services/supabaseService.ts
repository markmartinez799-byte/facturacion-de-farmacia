import { supabase } from '@/lib/supabase';
import type { Product, Client, Supplier, SupplierPurchase, ReturnToSupplier, Branch, AbonoCompra, User } from '@/types';
import { generateId, now } from '@/utils/formatters';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function productToRow(p: Omit<Product, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
  return {
    id: p.id,
    nombre: p.commercialName,
    nombre_generico: p.genericName,
    codigo_barra: p.barcode,
    laboratorio: p.lab,
    presentacion: p.presentation,
    precio_venta: p.price,
    precio_compra: p.purchaseCost ?? null,
    precio_mayorista: p.wholesalePrice ?? null,
    calculo_automatico: p.autoCalcPrice ?? false,
    itbis: p.itbisApplicable ? 0.18 : 0,
    itbis_aplicable: p.itbisApplicable,
    activo: p.isActive,
    imagen_url: p.image ?? null,
    fecha_vencimiento: p.expiryDate || null,
    tipo: 'medicamento',
    requiere_receta: false,
    estante: p.estante ?? null,
    posicion: p.posicion ?? null,
    descripcion: p.descripcion ?? null,
  };
}

function rowToProduct(row: Record<string, unknown>, stockMap: Record<string, Record<string, number>>): Product {
  const id = row.id as string;
  return {
    id,
    barcode: (row.codigo_barra as string) || '',
    commercialName: (row.nombre as string) || '',
    genericName: (row.nombre_generico as string) || '',
    lab: (row.laboratorio as string) || '',
    presentation: (row.presentacion as string) || '',
    price: Number(row.precio_venta) || 0,
    purchaseCost: row.precio_compra != null ? Number(row.precio_compra) : undefined,
    wholesalePrice: row.precio_mayorista != null ? Number(row.precio_mayorista) : undefined,
    autoCalcPrice: Boolean(row.calculo_automatico),
    itbisApplicable: Boolean(row.itbis_aplicable),
    stock: stockMap[id] || {},
    expiryDate: (row.fecha_vencimiento as string) || '',
    image: (row.imagen_url as string) || undefined,
    isActive: Boolean(row.activo),
    createdAt: (row.created_at as string) || now(),
    estante: (row.estante as string) || undefined,
    posicion: (row.posicion as string) || undefined,
    descripcion: (row.descripcion as string) || undefined,
  };
}

function clientToRow(c: Omit<Client, 'id' | 'createdAt'> & { id?: string }) {
  return {
    id: c.id,
    nombre: c.name,
    rnc_cedula: c.cedula || c.rnc || null,
    telefono: c.phone || null,
    tipo_ncf_default: c.defaultNCF,
    activo: true,
  };
}

function rowToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: row.nombre as string,
    cedula: (row.rnc_cedula as string) || undefined,
    rnc: (row.rnc_cedula as string) || undefined,
    phone: (row.telefono as string) || undefined,
    defaultNCF: (row.tipo_ncf_default as 'B01' | 'B02' | 'B14' | 'B15') || 'B02',
    createdAt: (row.created_at as string) || now(),
  };
}

function supplierToRow(s: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }) {
  return {
    id: s.id,
    nombre: s.name,
    empresa: s.company,
    telefono: s.phone,
    email: s.email || null,
    logo_url: s.logo || null,
    activo: s.isActive,
  };
}

function rowToSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    name: row.nombre as string,
    company: row.empresa as string,
    phone: row.telefono as string,
    email: (row.email as string) || undefined,
    logo: (row.logo_url as string) || undefined,
    isActive: Boolean(row.activo),
    createdAt: (row.created_at as string) || now(),
  };
}

function rowToBranch(row: Record<string, unknown>): Branch {
  return {
    id: row.id as string,
    name: row.name as string,
    address: row.address as string,
    phone: row.phone as string,
    rnc: (row.rnc as string) || undefined,
    isActive: Boolean(row.is_active),
    createdAt: (row.created_at as string) || now(),
  };
}

// ─── PRODUCTS ───────────────────────────────────────────────────────────────

export async function fetchProducts(): Promise<Product[]> {
  // Paginate to fetch ALL products (Supabase default limit is 1000)
  let allProds: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: prodsPage, error: prodsError } = await supabase
      .from('productos_farmacia')
      .select('*')
      .order('nombre')
      .range(from, from + pageSize - 1);

    if (prodsError) {
      console.error('[fetchProducts] productos_farmacia error:', prodsError.message);
      break;
    }

    if (prodsPage && prodsPage.length > 0) {
      allProds = allProds.concat(prodsPage);
    }

    if (!prodsPage || prodsPage.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  // Paginate stock too
  let allStocks: Record<string, unknown>[] = [];
  let stockFrom = 0;
  let hasMoreStock = true;

  while (hasMoreStock) {
    const { data: stocksPage, error: stocksError } = await supabase
      .from('stock_farmacia')
      .select('producto_id, sucursal_id, cantidad')
      .range(stockFrom, stockFrom + pageSize - 1);

    if (stocksError) {
      console.error('[fetchProducts] stock_farmacia error:', stocksError.message);
      break;
    }

    if (stocksPage && stocksPage.length > 0) {
      allStocks = allStocks.concat(stocksPage);
    }

    if (!stocksPage || stocksPage.length < pageSize) {
      hasMoreStock = false;
    } else {
      stockFrom += pageSize;
    }
  }

  // Build stockMap: { productId: { branchId: quantity } }
  const stockMap: Record<string, Record<string, number>> = {};
  (allStocks || []).forEach((s: Record<string, unknown>) => {
    const pid = s.producto_id as string;
    const bid = s.sucursal_id as string;
    if (!pid || !bid) return;
    if (!stockMap[pid]) stockMap[pid] = {};
    stockMap[pid][bid] = Number(s.cantidad) || 0;
  });

  return allProds.map((r: Record<string, unknown>) => rowToProduct(r, stockMap));
}

export async function upsertProduct(product: Product): Promise<void> {
  const row = productToRow(product);
  await supabase.from('productos_farmacia').upsert(row, { onConflict: 'id' });

  // Upsert stock per branch in stock_farmacia
  const stockEntries = Object.entries(product.stock);
  for (const [branchId, qty] of stockEntries) {
    await supabase.from('stock_farmacia').upsert(
      { producto_id: product.id, sucursal_id: branchId, cantidad: qty },
      { onConflict: 'producto_id,sucursal_id' }
    );
  }
}

export async function deleteProductRemote(id: string): Promise<void> {
  // stock_farmacia has ON DELETE CASCADE so it auto-deletes
  await supabase.from('productos_farmacia').delete().eq('id', id);
}

export async function updateProductStockRemote(productId: string, branchId: string, quantity: number): Promise<void> {
  await supabase.from('stock_farmacia').upsert(
    { producto_id: productId, sucursal_id: branchId, cantidad: quantity },
    { onConflict: 'producto_id,sucursal_id' }
  );
}

export async function initStockForNewProduct(productId: string, stockPerBranch: Record<string, number>): Promise<void> {
  // Fetch all active branches and ensure stock exists for each
  const { data: branches } = await supabase.from('branches').select('id').eq('is_active', true);
  const allBranches = (branches || []).map((b: Record<string, unknown>) => b.id as string);

  for (const branchId of allBranches) {
    const qty = stockPerBranch[branchId] ?? 0;
    await supabase.from('stock_farmacia').upsert(
      { producto_id: productId, sucursal_id: branchId, cantidad: qty },
      { onConflict: 'producto_id,sucursal_id' }
    );
  }
}

// ─── CLIENTS ────────────────────────────────────────────────────────────────

export async function fetchClients(): Promise<Client[]> {
  const { data } = await supabase.from('clientes_farmacia').select('*').order('nombre');
  return (data || []).map((r: Record<string, unknown>) => rowToClient(r));
}

export async function upsertClient(client: Client): Promise<void> {
  await supabase.from('clientes_farmacia').upsert(clientToRow(client), { onConflict: 'id' });
}

export async function deleteClientRemote(id: string): Promise<void> {
  await supabase.from('clientes_farmacia').delete().eq('id', id);
}

// ─── SUPPLIERS ──────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data } = await supabase.from('proveedores_farmacia').select('*').order('nombre');
  return (data || []).map((r: Record<string, unknown>) => rowToSupplier(r));
}

export async function upsertSupplier(supplier: Supplier): Promise<void> {
  await supabase.from('proveedores_farmacia').upsert(supplierToRow(supplier), { onConflict: 'id' });
}

export async function deleteSupplierRemote(id: string): Promise<void> {
  await supabase.from('proveedores_farmacia').delete().eq('id', id);
}

// ─── SUPPLIER PURCHASES ─────────────────────────────────────────────────────

export async function fetchSupplierPurchases(): Promise<SupplierPurchase[]> {
  const { data: purchases } = await supabase
    .from('compras_proveedores_farmacia')
    .select('*, detalle_compras_farmacia(*), abonos_compras_farmacia(*)')
    .order('created_at', { ascending: false });

  return (purchases || []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    supplierId: p.proveedor_id as string,
    supplierName: p.proveedor_nombre as string,
    supplierCompany: p.proveedor_empresa as string,
    invoiceNumber: (p.numero_factura as string) || undefined,
    total: Number(p.total) || 0,
    purchaseDate: (p.fecha_compra as string) || '',
    tipoPago: ((p.tipo_pago as string) || 'contado') as 'contado' | 'credito',
    fechaLimitePago: (p.fecha_limite_pago as string) || undefined,
    estadoPago: ((p.estado_pago as string) || 'pagado') as 'pagado' | 'pendiente' | 'vencido',
    notas: (p.notas as string) || undefined,
    wasEditedOnce: Boolean(p.was_edited_once),
    fechaFacturacion: (p.fecha_facturacion as string) || undefined,
    createdAt: (p.created_at as string) || now(),
    items: ((p.detalle_compras_farmacia as Record<string, unknown>[]) || []).map((d) => ({
      productId: d.producto_id as string,
      productName: d.producto_nombre as string,
      quantity: Number(d.cantidad) || 0,
      unitCost: Number(d.costo_unitario) || 0,
      salePrice: d.precio_venta_sugerido != null ? Number(d.precio_venta_sugerido) : undefined,
      wholesalePrice: d.precio_mayorista != null ? Number(d.precio_mayorista) : undefined,
      lote: (d.lote as string) || undefined,
      expiryDate: (d.fecha_vencimiento as string) || '',
    })),
    abonos: ((p.abonos_compras_farmacia as Record<string, unknown>[]) || []).map((a) => ({
      id: a.id as string,
      compraId: a.compra_id as string,
      monto: Number(a.monto) || 0,
      fechaAbono: (a.fecha_abono as string) || '',
      notas: (a.notas as string) || undefined,
      createdAt: (a.created_at as string) || now(),
    })),
  }));
}

export async function insertSupplierPurchase(purchase: SupplierPurchase): Promise<void> {
  const { error } = await supabase.from('compras_proveedores_farmacia').insert({
    id: purchase.id,
    proveedor_id: purchase.supplierId,
    proveedor_nombre: purchase.supplierName,
    proveedor_empresa: purchase.supplierCompany,
    numero_factura: purchase.invoiceNumber || null,
    total: purchase.total,
    fecha_compra: purchase.purchaseDate,
    fecha_facturacion: purchase.fechaFacturacion || null,
    tipo_pago: purchase.tipoPago,
    fecha_limite_pago: purchase.fechaLimitePago || null,
    estado_pago: purchase.estadoPago,
    notas: purchase.notas || null,
    was_edited_once: false,
  });
  if (error) return;

  for (const item of purchase.items) {
    const extItem = item as typeof item & { salePrice?: number; wholesalePrice?: number; lote?: string };
    await supabase.from('detalle_compras_farmacia').insert({
      compra_id: purchase.id,
      producto_id: item.productId,
      producto_nombre: item.productName,
      cantidad: item.quantity,
      costo_unitario: item.unitCost,
      precio_venta_sugerido: extItem.salePrice ?? null,
      precio_mayorista: extItem.wholesalePrice ?? null,
      lote: extItem.lote ?? null,
      fecha_vencimiento: item.expiryDate,
    });
  }
}

export async function updatePurchaseRemote(id: string, updates: Partial<SupplierPurchase>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.invoiceNumber !== undefined) dbUpdates.numero_factura = updates.invoiceNumber || null;
  if (updates.purchaseDate !== undefined) dbUpdates.fecha_compra = updates.purchaseDate;
  if (updates.fechaFacturacion !== undefined) dbUpdates.fecha_facturacion = updates.fechaFacturacion || null;
  if (updates.tipoPago !== undefined) dbUpdates.tipo_pago = updates.tipoPago;
  if (updates.fechaLimitePago !== undefined) dbUpdates.fecha_limite_pago = updates.fechaLimitePago || null;
  if (updates.estadoPago !== undefined) dbUpdates.estado_pago = updates.estadoPago;
  if (updates.notas !== undefined) dbUpdates.notas = updates.notas || null;
  if (updates.wasEditedOnce !== undefined) dbUpdates.was_edited_once = updates.wasEditedOnce;
  if (updates.total !== undefined) dbUpdates.total = updates.total;
  if (updates.items !== undefined) {
    // Re-insert items if items changed
    await supabase.from('detalle_compras_farmacia').delete().eq('compra_id', id);
    for (const item of updates.items) {
      const extItem = item as typeof item & { salePrice?: number; wholesalePrice?: number; lote?: string };
      await supabase.from('detalle_compras_farmacia').insert({
        compra_id: id,
        producto_id: item.productId,
        producto_nombre: item.productName,
        cantidad: item.quantity,
        costo_unitario: item.unitCost,
        precio_venta_sugerido: extItem.salePrice ?? null,
        precio_mayorista: extItem.wholesalePrice ?? null,
        lote: extItem.lote ?? null,
        fecha_vencimiento: item.expiryDate,
      });
    }
  }
  if (Object.keys(dbUpdates).length > 0) {
    await supabase.from('compras_proveedores_farmacia').update(dbUpdates).eq('id', id);
  }
}

export async function updatePurchasePaymentStatus(id: string, estadoPago: string): Promise<void> {
  await supabase.from('compras_proveedores_farmacia').update({ estado_pago: estadoPago }).eq('id', id);
}

export async function deletePurchaseRemote(id: string): Promise<void> {
  await supabase.from('abonos_compras_farmacia').delete().eq('compra_id', id);
  await supabase.from('detalle_compras_farmacia').delete().eq('compra_id', id);
  await supabase.from('compras_proveedores_farmacia').delete().eq('id', id);
}

export async function insertAbono(abono: AbonoCompra): Promise<void> {
  await supabase.from('abonos_compras_farmacia').insert({
    id: abono.id,
    compra_id: abono.compraId,
    monto: abono.monto,
    fecha_abono: abono.fechaAbono,
    notas: abono.notas || null,
  });
}

export async function fetchAbonos(compraId: string): Promise<AbonoCompra[]> {
  const { data } = await supabase
    .from('abonos_compras_farmacia')
    .select('*')
    .eq('compra_id', compraId)
    .order('fecha_abono', { ascending: false });
  return (data || []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    compraId: a.compra_id as string,
    monto: Number(a.monto) || 0,
    fechaAbono: (a.fecha_abono as string) || '',
    notas: (a.notas as string) || undefined,
    createdAt: (a.created_at as string) || now(),
  }));
}

// ─── RETURNS TO SUPPLIER ────────────────────────────────────────────────────

export async function fetchReturnsToSupplier(): Promise<ReturnToSupplier[]> {
  const { data } = await supabase
    .from('devoluciones_proveedores_farmacia')
    .select('*, detalle_devoluciones_farmacia(*)')
    .order('created_at', { ascending: false });

  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    supplierId: r.proveedor_id as string,
    supplierName: r.proveedor_nombre as string,
    supplierCompany: r.proveedor_empresa as string,
    purchaseId: (r.compra_id as string) || undefined,
    status: (r.estado as 'pendiente' | 'enviado' | 'confirmado') || 'pendiente',
    createdAt: (r.created_at as string) || now(),
    items: ((r.detalle_devoluciones_farmacia as Record<string, unknown>[]) || []).map((d) => ({
      productId: d.producto_id as string,
      productName: d.producto_nombre as string,
      quantity: Number(d.cantidad) || 0,
      reason: d.razon as string,
      expiryDate: (d.fecha_vencimiento as string) || '',
    })),
  }));
}

export async function insertReturnToSupplier(ret: ReturnToSupplier): Promise<void> {
  const { error } = await supabase.from('devoluciones_proveedores_farmacia').insert({
    id: ret.id,
    proveedor_id: ret.supplierId,
    proveedor_nombre: ret.supplierName,
    proveedor_empresa: ret.supplierCompany,
    compra_id: ret.purchaseId || null,
    estado: ret.status,
  });
  if (error) return;

  for (const item of ret.items) {
    await supabase.from('detalle_devoluciones_farmacia').insert({
      devolucion_id: ret.id,
      producto_id: item.productId,
      producto_nombre: item.productName,
      cantidad: item.quantity,
      razon: item.reason,
      fecha_vencimiento: item.expiryDate,
    });
  }
}

export async function updateReturnStatusRemote(id: string, status: ReturnToSupplier['status']): Promise<void> {
  await supabase.from('devoluciones_proveedores_farmacia').update({ estado: status }).eq('id', id);
}

// ─── BRANCHES ───────────────────────────────────────────────────────────────

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await supabase.from('branches').select('*').order('name');
  return (data || []).map((r: Record<string, unknown>) => rowToBranch(r));
}

export async function upsertBranch(branch: Branch): Promise<void> {
  await supabase.from('branches').upsert({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    rnc: branch.rnc || null,
    is_active: branch.isActive,
  }, { onConflict: 'id' });
}

// ─── SALES (FACTURAS) ────────────────────────────────────────────────────────

export async function insertSaleRemote(sale: import('@/types').Sale): Promise<void> {
  // Insert factura header
  const { error } = await supabase.from('facturas_farmacia').insert({
    id: sale.id,
    cliente_id: sale.clientId || null,
    usuario_id: sale.cashierId,
    ncf: sale.ncf,
    tipo_ncf: sale.ncfType,
    subtotal: sale.subtotal,
    itbis_total: sale.itbis,
    descuento: sale.discount,
    total: sale.total,
    metodo_pago: sale.paymentMethod,
    estado: 'completada',
    sucursal_id: sale.branchId,
  });
  if (error) {
    // If NCF conflict or trigger error, try with a unique NCF
    const fallbackNcf = `${sale.ncf}-${Date.now()}`;
    await supabase.from('facturas_farmacia').insert({
      id: sale.id,
      cliente_id: sale.clientId || null,
      usuario_id: sale.cashierId,
      ncf: fallbackNcf,
      tipo_ncf: sale.ncfType,
      subtotal: sale.subtotal,
      itbis_total: sale.itbis,
      descuento: sale.discount,
      total: sale.total,
      metodo_pago: sale.paymentMethod,
      estado: 'completada',
      sucursal_id: sale.branchId,
    }).then(() => {}).catch(() => {});
    return;
  }

  // Insert line items
  for (const item of sale.items) {
    await supabase.from('detalle_factura_farmacia').insert({
      factura_id: sale.id,
      producto_id: item.product.id,
      nombre_producto: item.product.commercialName,
      cantidad: item.quantity,
      precio: item.unitPrice,
      itbis_pct: item.product.itbisApplicable ? 0.18 : 0,
      itbis_monto: item.product.itbisApplicable ? item.quantity * item.unitPrice * 0.18 : 0,
      descuento: item.lineDiscount,
      subtotal: item.quantity * item.unitPrice * (1 - item.lineDiscount / 100),
    }).catch(() => {});
  }
}

export async function fetchSalesRemote(): Promise<import('@/types').Sale[]> {
  // Paginate to fetch all sales
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

    if (data && data.length > 0) {
      allSales = allSales.concat(data);
    }

    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return allSales.map((f: Record<string, unknown>) => ({
    id: f.id as string,
    branchId: (f.sucursal_id as string) || '',
    cashierId: (f.usuario_id as string) || '',
    cashierName: '',
    items: ((f.detalle_factura_farmacia as Record<string, unknown>[]) || []).map((d) => ({
      product: {
        id: d.producto_id as string,
        commercialName: d.nombre_producto as string,
        genericName: '',
        barcode: '',
        lab: '',
        presentation: '',
        price: Number(d.precio) || 0,
        itbisApplicable: Number(d.itbis_pct) > 0,
        stock: {},
        expiryDate: '',
        isActive: true,
        createdAt: '',
      },
      quantity: Number(d.cantidad) || 0,
      unitPrice: Number(d.precio) || 0,
      lineDiscount: Number(d.descuento) || 0,
    })),
    subtotal: Number(f.subtotal) || 0,
    itbis: Number(f.itbis_total) || 0,
    discount: Number(f.descuento) || 0,
    total: Number(f.total) || 0,
    paymentMethod: (f.metodo_pago as import('@/types').PaymentMethod) || 'efectivo',
    ncf: (f.ncf as string) || '',
    ncfType: (f.tipo_ncf as import('@/types').NCFType) || 'B02',
    clientId: (f.cliente_id as string) || undefined,
    clientName: 'Cliente',
    timestamp: (f.created_at as string) || now(),
    status: 'completed' as const,
  }));
}

// ─── USERS ──────────────────────────────────────────────────────────────────

export async function fetchUsers(): Promise<import('@/types').User[]> {
  const { data } = await supabase.from('usuarios_farmacia').select('*').eq('activo', true).order('nombre');
  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.nombre as string) || '',
    role: sanitizeRole(r.rol),
    username: (r.username as string) || undefined,
    password: (r.password_hash as string) || undefined,
    accessCode: (r.codigo_acceso as string) || undefined,
    branchId: (r.sucursal_id as string) || undefined,
    isActive: Boolean(r.activo),
    avatar: (r.avatar_url as string) || undefined,
    createdAt: (r.created_at as string) || now(),
  }));
}

export async function upsertUser(user: import('@/types').User): Promise<void> {
  // rol in DB stores text values mapped by dbRole()
  const dbRol = dbRole(user.role);
  await supabase.from('usuarios_farmacia').upsert({
    id: user.id,
    nombre: user.name,
    rol: dbRol,
    username: user.username || null,
    password_hash: user.password || null,
    codigo_acceso: user.accessCode || null,
    sucursal_id: user.branchId || null,
    activo: user.isActive,
    avatar_url: user.avatar || null,
  }, { onConflict: 'id' });
}

export async function deleteUserRemote(id: string): Promise<void> {
  await supabase.from('usuarios_farmacia').update({ activo: false }).eq('id', id);
}

// ─── COMPANY SETTINGS ──────────────────────────────────────────────────────

export async function fetchCompanySettings(): Promise<import('@/types').CompanySettings | null> {
  const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
  if (!data) return null;
  return {
    name: (data.name as string) || '',
    rnc: (data.rnc as string) || '',
    address: (data.address as string) || '',
    phone: (data.phone as string) || '',
    logo: (data.logo as string) || '',
    email: (data.email as string) || '',
    website: (data.website as string) || '',
    printFormat: ((data.print_format as string) || '80mm') as '80mm' | 'carta',
  };
}

export async function saveCompanySettings(settings: import('@/types').CompanySettings): Promise<void> {
  // Check if a row exists
  const { data: existing } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
  if (existing?.id) {
    await supabase.from('company_settings').update({
      name: settings.name,
      rnc: settings.rnc,
      address: settings.address,
      phone: settings.phone,
      logo: settings.logo,
      email: settings.email,
      website: settings.website,
      print_format: settings.printFormat,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await supabase.from('company_settings').insert({
      name: settings.name,
      rnc: settings.rnc,
      address: settings.address,
      phone: settings.phone,
      logo: settings.logo,
      email: settings.email,
      website: settings.website,
      print_format: settings.printFormat,
    });
  }
}

// ─── BRANCHES CRUD ──────────────────────────────────────────────────────────

export async function deleteBranchRemote(id: string): Promise<void> {
  await supabase.from('branches').update({ is_active: false }).eq('id', id);
}

// ─── REPORTS ────────────────────────────────────────────────────────────────

export interface ReportFilters {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
  cajeroId?: string;
  tipo: 'ventas' | 'compras' | 'general';
}

export async function fetchSalesForReport(filters: ReportFilters): Promise<import('@/types').Sale[]> {
  let query = supabase
    .from('facturas_farmacia')
    .select('*, detalle_factura_farmacia(*)')
    .eq('estado', 'completada')
    .order('created_at', { ascending: false });

  if (filters.desde) query = query.gte('created_at', filters.desde + 'T00:00:00');
  if (filters.hasta) query = query.lte('created_at', filters.hasta + 'T23:59:59');
  if (filters.sucursalId) query = query.eq('sucursal_id', filters.sucursalId);
  if (filters.cajeroId) query = query.eq('usuario_id', filters.cajeroId);

  // Paginate to fetch all matching sales
  let allSales: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await query.range(from, from + pageSize - 1);
    if (data && data.length > 0) {
      allSales = allSales.concat(data);
    }
    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return allSales.map((f: Record<string, unknown>) => ({
    id: f.id as string,
    branchId: (f.sucursal_id as string) || '',
    cashierId: (f.usuario_id as string) || '',
    cashierName: '',
    items: ((f.detalle_factura_farmacia as Record<string, unknown>[]) || []).map((d) => ({
      product: {
        id: d.producto_id as string,
        commercialName: d.nombre_producto as string,
        genericName: '',
        barcode: '',
        lab: '',
        presentation: '',
        price: Number(d.precio) || 0,
        itbisApplicable: Number(d.itbis_pct) > 0,
        stock: {},
        expiryDate: '',
        isActive: true,
        createdAt: '',
      },
      quantity: Number(d.cantidad) || 0,
      unitPrice: Number(d.precio) || 0,
      lineDiscount: Number(d.descuento) || 0,
    })),
    subtotal: Number(f.subtotal) || 0,
    itbis: Number(f.itbis_total) || 0,
    discount: Number(f.descuento) || 0,
    total: Number(f.total) || 0,
    paymentMethod: (f.metodo_pago as import('@/types').PaymentMethod) || 'efectivo',
    ncf: (f.ncf as string) || '',
    ncfType: (f.tipo_ncf as import('@/types').NCFType) || 'B02',
    clientId: (f.cliente_id as string) || undefined,
    clientName: (f.client_name as string) || 'Cliente',
    timestamp: (f.created_at as string) || now(),
    status: 'completed' as const,
  }));
}

export async function fetchPurchasesForReport(filters: ReportFilters): Promise<SupplierPurchase[]> {
  let query = supabase
    .from('compras_proveedores_farmacia')
    .select('*, detalle_compras_farmacia(*)')
    .order('created_at', { ascending: false });

  if (filters.desde) query = query.gte('created_at', filters.desde + 'T00:00:00');
  if (filters.hasta) query = query.lte('created_at', filters.hasta + 'T23:59:59');

  // Paginate to fetch all matching purchases
  let allPurchases: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await query.range(from, from + pageSize - 1);
    if (data && data.length > 0) {
      allPurchases = allPurchases.concat(data);
    }
    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  return allPurchases.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    supplierId: p.proveedor_id as string,
    supplierName: p.proveedor_nombre as string,
    supplierCompany: p.proveedor_empresa as string,
    invoiceNumber: (p.numero_factura as string) || undefined,
    total: Number(p.total) || 0,
    purchaseDate: (p.fecha_compra as string) || '',
    tipoPago: ((p.tipo_pago as string) || 'contado') as 'contado' | 'credito',
    fechaLimitePago: (p.fecha_limite_pago as string) || undefined,
    estadoPago: ((p.estado_pago as string) || 'pagado') as 'pagado' | 'pendiente' | 'vencido',
    notas: (p.notas as string) || undefined,
    createdAt: (p.created_at as string) || now(),
    items: ((p.detalle_compras_farmacia as Record<string, unknown>[]) || []).map((d) => ({
      productId: d.producto_id as string,
      productName: d.producto_nombre as string,
      quantity: Number(d.cantidad) || 0,
      unitCost: Number(d.costo_unitario) || 0,
      expiryDate: (d.fecha_vencimiento as string) || '',
    })),
    abonos: [],
  }));
}

export async function saveReporteGenerado(data: {
  tipo: string;
  filtro_desde?: string;
  filtro_hasta?: string;
  filtro_sucursal?: string;
  filtro_cajero?: string;
  generado_por?: string;
  total_ventas: number;
  total_compras: number;
}): Promise<void> {
  await supabase.from('reportes_generados').insert(data);
}

// ─── DUPLICATE CHECK ────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType: 'barcode' | 'commercial_name' | 'generic_name' | null;
  existingProduct: Product | null;
}

export async function checkDuplicateProduct(params: {
  barcode?: string;
  commercialName?: string;
  presentation?: string;
  genericName?: string;
  excludeId?: string;
}): Promise<DuplicateCheckResult> {
  const { barcode, commercialName, presentation, genericName, excludeId } = params;

  // Priority 1: exact barcode match (case-insensitive)
  if (barcode && barcode.trim()) {
    let query = supabase
      .from('productos_farmacia')
      .select('*')
      .ilike('codigo_barra', barcode.trim())
      .eq('activo', true);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.limit(1).maybeSingle();
    if (data) {
      const { data: stocks } = await supabase.from('stock_farmacia').select('sucursal_id, cantidad').eq('producto_id', data.id);
      const stockMap: Record<string, number> = {};
      (stocks || []).forEach((s: Record<string, unknown>) => { stockMap[s.sucursal_id as string] = Number(s.cantidad) || 0; });
      return {
        isDuplicate: true,
        matchType: 'barcode',
        existingProduct: rowToProduct(data as Record<string, unknown>, { [(data as Record<string, unknown>).id as string]: stockMap }),
      };
    }
  }

  // Priority 2: commercial name + presentation (case-insensitive)
  if (commercialName && commercialName.trim()) {
    let query = supabase
      .from('productos_farmacia')
      .select('*')
      .ilike('nombre', commercialName.trim())
      .eq('activo', true);
    if (presentation && presentation.trim()) query = query.ilike('presentacion', presentation.trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.limit(1).maybeSingle();
    if (data) {
      const { data: stocks } = await supabase.from('stock_farmacia').select('sucursal_id, cantidad').eq('producto_id', data.id);
      const stockMap: Record<string, number> = {};
      (stocks || []).forEach((s: Record<string, unknown>) => { stockMap[s.sucursal_id as string] = Number(s.cantidad) || 0; });
      return {
        isDuplicate: true,
        matchType: 'commercial_name',
        existingProduct: rowToProduct(data as Record<string, unknown>, { [(data as Record<string, unknown>).id as string]: stockMap }),
      };
    }
  }

  // Priority 3: generic name match (case-insensitive)
  if (genericName && genericName.trim()) {
    let query = supabase
      .from('productos_farmacia')
      .select('*')
      .ilike('nombre_generico', genericName.trim())
      .eq('activo', true);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.limit(1).maybeSingle();
    if (data) {
      const { data: stocks } = await supabase.from('stock_farmacia').select('sucursal_id, cantidad').eq('producto_id', data.id);
      const stockMap: Record<string, number> = {};
      (stocks || []).forEach((s: Record<string, unknown>) => { stockMap[s.sucursal_id as string] = Number(s.cantidad) || 0; });
      return {
        isDuplicate: true,
        matchType: 'generic_name',
        existingProduct: rowToProduct(data as Record<string, unknown>, { [(data as Record<string, unknown>).id as string]: stockMap }),
      };
    }
  }

  return { isDuplicate: false, matchType: null, existingProduct: null };
}

// ─── LOAD ALL DATA ───────────────────────────────────────────────────────────

export async function loadAllData() {
  const [products, clients, suppliers, supplierPurchases, returnsToSupplier, branches, sales, users] = await Promise.all([
    fetchProducts(),
    fetchClients(),
    fetchSuppliers(),
    fetchSupplierPurchases(),
    fetchReturnsToSupplier(),
    fetchBranches(),
    fetchSalesRemote(),
    fetchUsers(),
  ]);
  return { products, clients, suppliers, supplierPurchases, returnsToSupplier, branches, sales, users };
}

export { generateId, now };

// Mapeo completo entre valores de BD (text) y el enum del frontend
const DB_ROLE_TO_FRONTEND: Record<string, User['role']> = {
  admin: 'admin',
  cashier: 'cashier',
  cajero: 'cashier',
  supervisor: 'supervisor',
  manager: 'manager',
  gerente: 'manager',
};

const FRONTEND_ROLE_TO_DB: Record<User['role'], string> = {
  admin: 'admin',
  cashier: 'cashier',
  supervisor: 'supervisor',
  manager: 'manager',
};

function sanitizeRole(raw: unknown): User['role'] {
  if (typeof raw !== 'string') return 'cashier';
  return DB_ROLE_TO_FRONTEND[raw] ?? 'cashier';
}

function dbRole(userRole: User['role']): string {
  return FRONTEND_ROLE_TO_DB[userRole] ?? 'cashier';
}