export interface User {
  id: string;
  name: string;
  /** Rol del usuario en el sistema. Enum estricto con 4 niveles de permisos. */
  role: 'admin' | 'cashier' | 'supervisor' | 'manager';
  username?: string;
  password?: string;
  accessCode?: string;
  branchId?: string;
  isActive: boolean;
  createdAt: string;
  avatar?: string;
}

export interface Supplier {
  id: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  logo?: string;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierPurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  salePrice?: number;
  wholesalePrice?: number;
  lote?: string;
  expiryDate: string;
}

export type PaymentType = 'contado' | 'credito';
export type PurchasePaymentStatus = 'pagado' | 'pendiente' | 'vencido';

export interface AbonoCompra {
  id: string;
  compraId: string;
  monto: number;
  fechaAbono: string;
  notas?: string;
  createdAt: string;
}

export interface SupplierPurchase {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCompany: string;
  items: SupplierPurchaseItem[];
  total: number;
  invoiceNumber?: string;
  purchaseDate: string;
  tipoPago: PaymentType;
  fechaLimitePago?: string;
  estadoPago: PurchasePaymentStatus;
  notas?: string;
  abonos?: AbonoCompra[];
  /** Si ya fue editada una vez, no se permite editar de nuevo */
  wasEditedOnce?: boolean;
  /** Fecha de facturación del proveedor (puede ser distinta a la fecha de registro) */
  fechaFacturacion?: string;
  createdAt: string;
}

export interface ReturnToSupplier {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCompany: string;
  purchaseId?: string;
  items: { productId: string; productName: string; quantity: number; reason: string; expiryDate: string }[];
  status: 'pendiente' | 'enviado' | 'confirmado';
  createdAt: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  rnc?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  barcode: string;
  commercialName: string;
  genericName: string;
  lab: string;
  presentation: string;
  price: number;
  wholesalePrice?: number;
  purchaseCost?: number;
  autoCalcPrice?: boolean;
  itbisApplicable: boolean;
  stock: Record<string, number>;
  expiryDate: string;
  image?: string;
  isActive: boolean;
  createdAt: string;
  supplierId?: string;
  estante?: string;
  posicion?: string;
  descripcion?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
}

export type NCFType = 'B01' | 'B02' | 'B14' | 'B15';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'mixto';

export interface Client {
  id: string;
  name: string;
  cedula?: string;
  rnc?: string;
  phone?: string;
  defaultNCF: NCFType;
  createdAt: string;
}

export interface InsurancePlan {
  id: string;
  name: string;
  code: string;
  logoColor: string;
}

export interface ActiveInsurance {
  planId: string;
  planName: string;
  affiliateNumber: string;
  coveragePercent: number;
}

export interface SavedTicket {
  id: string;
  label: string;
  cart: CartItem[];
  globalDiscount: number;
  ncfType: NCFType;
  client?: Client;
  insurance?: ActiveInsurance;
  savedAt: string;
}

export interface Sale {
  id: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  items: CartItem[];
  subtotal: number;
  itbis: number;
  discount: number;
  insuranceCoverage?: number;
  insuranceName?: string;
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  change?: number;
  ncf: string;
  ncfType: NCFType;
  clientId?: string;
  clientRnc?: string;
  clientName?: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
}

export interface NCFSequence {
  type: NCFType;
  label: string;
  prefix: string;
  lastNumber: number;
  limit: number;
  isActive: boolean;
}

export interface CompanySettings {
  name: string;
  rnc: string;
  address: string;
  phone: string;
  logo: string;
  printFormat: '80mm' | 'carta';
  email: string;
  website: string;
}
