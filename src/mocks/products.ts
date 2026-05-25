import type { Product } from '@/types';

// Branch UUIDs matching mockBranches in src/mocks/branches.ts
const B1 = 'a1b2c3d4-0001-0001-0001-000000000001'; // Sede Principal
const B2 = 'a1b2c3d4-0002-0002-0002-000000000002'; // Sucursal Este
const B3 = 'a1b2c3d4-0003-0003-0003-000000000003'; // Sucursal Norte

export const mockProducts: Product[] = [
  { id: 'p-01', barcode: '7861234560010', commercialName: 'Acetaminofén 500mg', genericName: 'Paracetamol', lab: 'Roemmers', presentation: 'Tabletas x 20', price: 35, itbisApplicable: false, stock: { [B1]: 120, [B2]: 85, [B3]: 40 }, expiryDate: '2026-08-15', image: 'https://readdy.ai/api/search-image?query=paracetamol%20acetaminophen%20white%20tablet%20medicine%20bottle%20pharmacy%20clean%20white%20background%20professional%20product%20photo&width=200&height=200&seq=p01&orientation=squarish', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
];
