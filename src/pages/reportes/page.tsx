import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { usePOSStore } from '@/store/posStore';
import { formatCurrency, formatDateShort } from '@/utils/formatters';
import { fetchSalesForReport, fetchPurchasesForReport, saveReporteGenerado } from '@/services/supabaseService';
import type { Sale, SupplierPurchase, Product } from '@/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type ReportType = 'ventas' | 'compras' | 'general' | 'laboratorio' | 'mas_vendidos' | 'menos_vendidos';

interface LabReportRow {
  lab: string;
  productCount: number;
  totalStock: number;
  totalValue: number;
  totalCost: number;
  avgPrice: number;
}

interface LabProductRow {
  id: string;
  name: string;
  code: string;
  lab: string;
  presentation: string;
  stock: number;
  purchaseCost: number;
  price: number;
  itbis: boolean;
  expiryDate: string;
  totalValue: number;
  totalCost: number;
  topCashier: { name: string; units: number } | null;
  // Nuevos campos para ventas
  unitsSold: number;
  unitSalePrice: number;
  totalSoldAmount: number;
  // Control de vencimiento
  isExpired: boolean;
}

interface ProductSaleAgg {
  productId: string;
  name: string;
  lab: string;
  unitsSold: number;
  revenue: number;
  timesSold: number;
  topCashier: { name: string; units: number } | null;
  currentStock: number;
}

export default function ReportesPage() {
  const { branches, users, companySettings } = useAuthStore();
  const { products, sales: localSales, supplierPurchases: localPurchases } = usePOSStore();

  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    desde: firstOfMonth,
    hasta: today,
    sucursalId: '',
    cajeroId: '',
    tipo: 'ventas' as ReportType,
    selectedLab: 'all',
  });

  const [loading, setLoading] = useState(false);
  const [reportSales, setReportSales] = useState<Sale[] | null>(null);
  const [reportPurchases, setReportPurchases] = useState<SupplierPurchase[] | null>(null);
  const [reportLabData, setReportLabData] = useState<LabReportRow[] | null>(null);
  const [reportLabProducts, setReportLabProducts] = useState<LabProductRow[] | null>(null);
  const [reportProductSales, setReportProductSales] = useState<ProductSaleAgg[] | null>(null);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setGenerated(false);

    if (filters.tipo === 'laboratorio') {
      // ─── Cargar ventas del período para reporte por laboratorio ───
      let sales: Sale[] = [];
      try {
        sales = await fetchSalesForReport({
          desde: filters.desde,
          hasta: filters.hasta,
          tipo: 'ventas',
        });
      } catch {
        sales = localSales.filter((s) => {
          const date = s.timestamp.split('T')[0];
          return date >= filters.desde && date <= filters.hasta && s.status === 'completed';
        });
      }

      // Agregar nombres de cajeros a las ventas
      sales = sales.map((s) => ({
        ...s,
        cashierName: users.find((u) => u.id === s.cashierId)?.name || s.cashierName || 'Cajero',
      }));

      // ─── Agregar ventas por producto ───
      const salesByProduct: Record<string, { unitsSold: number; totalSoldAmount: number; unitSalePrice: number }> = {};
      sales.forEach((sale) => {
        sale.items.forEach((item) => {
          const pid = item.product.id;
          if (!salesByProduct[pid]) {
            salesByProduct[pid] = { unitsSold: 0, totalSoldAmount: 0, unitSalePrice: 0 };
          }
          salesByProduct[pid].unitsSold += item.quantity;
          salesByProduct[pid].totalSoldAmount += item.quantity * item.unitPrice;
          // Usar el último precio unitario como referencia
          salesByProduct[pid].unitSalePrice = item.unitPrice;
        });
      });

      const today = new Date().toISOString().split('T')[0];
      const rows: Record<string, LabReportRow> = {};
      const productRows: LabProductRow[] = [];

      // Calcular top vendedor por producto
      const cashierAgg: Record<string, Record<string, number>> = {};
      sales.forEach((sale) => {
        sale.items.forEach((item) => {
          const pid = item.product.id;
          if (!cashierAgg[pid]) cashierAgg[pid] = {};
          const cid = sale.cashierId || 'unknown';
          cashierAgg[pid][cid] = (cashierAgg[pid][cid] || 0) + item.quantity;
        });
      });
      const topCashierMap: Record<string, { name: string; units: number } | null> = {};
      Object.keys(cashierAgg).forEach((pid) => {
        let best: { name: string; units: number } | null = null;
        Object.entries(cashierAgg[pid]).forEach(([cid, units]) => {
          if (!best || units > best.units) {
            best = { name: users.find((u) => u.id === cid)?.name || 'Cajero', units };
          }
        });
        topCashierMap[pid] = best;
      });

      products.filter((p) => p.isActive).forEach((p) => {
        const lab = p.lab?.trim() || 'Sin Laboratorio';
        if (filters.selectedLab !== 'all' && lab !== filters.selectedLab) return;

        const salesData = salesByProduct[p.id] || { unitsSold: 0, totalSoldAmount: 0, unitSalePrice: 0 };
        const stockTotal = Object.values(p.stock).reduce((s, q) => s + (q || 0), 0);
        const value = stockTotal * p.price;
        const cost = stockTotal * (p.purchaseCost || 0);
        const isExpired = !!p.expiryDate && p.expiryDate < today;

        if (!rows[lab]) {
          rows[lab] = { lab, productCount: 0, totalStock: 0, totalValue: 0, totalCost: 0, avgPrice: 0 };
        }
        rows[lab].productCount += 1;
        rows[lab].totalStock += stockTotal;
        rows[lab].totalValue += value;
        rows[lab].totalCost += cost;

        // Incluir TODOS los productos del laboratorio — los sin venta muestran cero
        productRows.push({
          id: p.id,
          name: p.commercialName || p.name || 'Sin nombre',
          code: p.code || p.barcode || '—',
          lab,
          presentation: p.presentation || 'UNID',
          stock: stockTotal,
          purchaseCost: p.purchaseCost || 0,
          price: p.price,
          itbis: p.itbis ?? false,
          expiryDate: p.expiryDate || '',
          totalValue: value,
          totalCost: cost,
          topCashier: topCashierMap[p.id] || null,
          unitsSold: salesData.unitsSold,
          unitSalePrice: salesData.unitSalePrice || p.price,
          totalSoldAmount: salesData.totalSoldAmount,
          isExpired,
        });
      });

      const sorted = Object.values(rows).sort((a, b) => b.totalValue - a.totalValue);
      sorted.forEach((r) => { r.avgPrice = r.totalStock > 0 ? r.totalValue / r.totalStock : 0; });
      // Ordenar productos por código y nombre (según requerimiento)
      const sortedProducts = productRows.sort((a, b) => {
        const codeCompare = (a.code || '').localeCompare(b.code || '');
        return codeCompare !== 0 ? codeCompare : (a.name || '').localeCompare(b.name || '');
      });
      setReportLabData(sorted);
      setReportLabProducts(sortedProducts);
      setReportSales([]);
      setReportPurchases([]);
      setReportProductSales(null);
      setGenerated(true);
      setLoading(false);
      return;
    }

    if (filters.tipo === 'mas_vendidos' || filters.tipo === 'menos_vendidos') {
      // Use local sales filtered by date (fetch from DB for period)
      let sales: Sale[] = [];
      try {
        sales = await fetchSalesForReport({
          desde: filters.desde,
          hasta: filters.hasta,
          sucursalId: filters.sucursalId || undefined,
          cajeroId: filters.cajeroId || undefined,
          tipo: 'ventas',
        });
      } catch {
        sales = localSales.filter((s) => {
          const date = s.timestamp.split('T')[0];
          const matchDate = date >= filters.desde && date <= filters.hasta;
          const matchBranch = !filters.sucursalId || s.branchId === filters.sucursalId;
          const matchCashier = !filters.cajeroId || s.cashierId === filters.cajeroId;
          return matchDate && matchBranch && matchCashier && s.status === 'completed';
        });
      }

      // Enrich cashierName
      sales = sales.map((s) => ({
        ...s,
        cashierName: users.find((u) => u.id === s.cashierId)?.name || s.cashierName || 'Cajero',
      }));

      // Aggregate product sales
      const agg: Record<string, ProductSaleAgg> = {};
      sales.forEach((sale) => {
        sale.items.forEach((item) => {
          const pid = item.product.id;
          if (!agg[pid]) {
            const prod = products.find((p) => p.id === pid);
            agg[pid] = {
              productId: pid,
              name: item.product.commercialName,
              lab: item.product.lab || 'Sin Laboratorio',
              unitsSold: 0,
              revenue: 0,
              timesSold: 0,
              topCashier: null,
              currentStock: Object.values(prod?.stock || {}).reduce((s, q) => s + (q || 0), 0),
            };
          }
          agg[pid].unitsSold += item.quantity;
          agg[pid].revenue += item.quantity * item.unitPrice * (1 - item.lineDiscount / 100);
          agg[pid].timesSold += 1;
        });
      });

      // Top cashier per product
      sales.forEach((sale) => {
        sale.items.forEach((item) => {
          const pid = item.product.id;
          if (!agg[pid]) return;
          const current = agg[pid].topCashier;
          if (!current || item.quantity > current.units) {
            agg[pid].topCashier = { name: sale.cashierName || 'Desconocido', units: item.quantity };
          }
        });
      });

      let arr = Object.values(agg);
      if (filters.tipo === 'mas_vendidos') {
        arr = arr.sort((a, b) => b.unitsSold - a.unitsSold);
      } else {
        arr = arr.sort((a, b) => a.unitsSold - b.unitsSold);
      }

      setReportProductSales(arr);
      setReportSales([]);
      setReportPurchases([]);
      setReportLabData(null);
      setReportLabProducts(null);
      setGenerated(true);
      setLoading(false);
      return;
    }

    try {
      let sales: Sale[] = [];
      let purchases: SupplierPurchase[] = [];

      if (filters.tipo === 'ventas' || filters.tipo === 'general') {
        sales = await fetchSalesForReport({
          desde: filters.desde,
          hasta: filters.hasta,
          sucursalId: filters.sucursalId || undefined,
          cajeroId: filters.cajeroId || undefined,
          tipo: filters.tipo,
        });
        sales = sales.map((s) => ({
          ...s,
          cashierName: users.find((u) => u.id === s.cashierId)?.name || s.cashierName || 'Cajero',
        }));
      }
      if (filters.tipo === 'compras' || filters.tipo === 'general') {
        purchases = await fetchPurchasesForReport({
          desde: filters.desde,
          hasta: filters.hasta,
          sucursalId: filters.sucursalId || undefined,
          tipo: filters.tipo,
        });
      }

      setReportSales(filters.tipo !== 'compras' ? sales : []);
      setReportPurchases(filters.tipo !== 'ventas' ? purchases : []);
      setReportLabData(null);
      setReportLabProducts(null);
      setReportProductSales(null);
      setGenerated(true);
    } catch {
      let sales: Sale[] = localSales;
      let purchases: SupplierPurchase[] = localPurchases;

      if (filters.desde) sales = sales.filter((s) => s.timestamp >= filters.desde + 'T00:00:00');
      if (filters.hasta) sales = sales.filter((s) => s.timestamp <= filters.hasta + 'T23:59:59');
      if (filters.sucursalId) sales = sales.filter((s) => s.branchId === filters.sucursalId);
      if (filters.cajeroId) sales = sales.filter((s) => s.cashierId === filters.cajeroId);
      if (filters.desde) purchases = purchases.filter((p) => p.purchaseDate >= filters.desde);
      if (filters.hasta) purchases = purchases.filter((p) => p.purchaseDate <= filters.hasta);

      setReportSales(filters.tipo !== 'compras' ? sales : []);
      setReportPurchases(filters.tipo !== 'ventas' ? purchases : []);
      setReportLabData(null);
      setReportLabProducts(null);
      setReportProductSales(null);
      setGenerated(true);
    }
    setLoading(false);
  };

  const totals = useMemo(() => {
    const totalVentas = (reportSales || []).reduce((s, v) => s + v.total, 0);
    const totalCompras = (reportPurchases || []).reduce((s, c) => s + c.total, 0);
    const ganancia = totalVentas - totalCompras;
    return { totalVentas, totalCompras, ganancia };
  }, [reportSales, reportPurchases]);

  const labTotals = useMemo(() => {
    if (!reportLabProducts || reportLabProducts.length === 0) return null;
    return {
      totalProducts: reportLabProducts.reduce((s, r) => s + r.unitsSold, 0),
      totalImporte: reportLabProducts.reduce((s, r) => s + r.totalSoldAmount, 0),
      totalItems: reportLabProducts.length,
      totalVencidos: reportLabProducts.filter((r) => r.isExpired).length,
      totalVigentes: reportLabProducts.filter((r) => !r.isExpired).length,
    };
  }, [reportLabProducts]);

  const productSaleTotals = useMemo(() => {
    if (!reportProductSales || reportProductSales.length === 0) return null;
    return {
      totalProducts: reportProductSales.length,
      totalUnits: reportProductSales.reduce((s, r) => s + r.unitsSold, 0),
      totalRevenue: reportProductSales.reduce((s, r) => s + r.revenue, 0),
    };
  }, [reportProductSales]);

  const allLabs = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.lab?.trim() || 'Sin Laboratorio').filter(Boolean))).sort();
  }, [products]);

  const companyName = companySettings?.name || 'GENOSAN';
  const companyRnc = companySettings?.rnc || '';
  const companyAddress = companySettings?.address || '';
  const companyPhone = companySettings?.phone || '';

  const makeDocHeader = (doc: jsPDF, title: string) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageW, 28, 'F');

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(companyName, 14, 11);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (companyRnc) doc.text(`RNC: ${companyRnc}`, 14, 17);
    if (companyAddress) doc.text(companyAddress, 14, 22);
    if (companyPhone) doc.text(`Tel: ${companyPhone}`, 14, 27);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageW - 14, 13, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${formatDateShort(filters.desde)} — ${formatDateShort(filters.hasta)}`, pageW - 14, 20, { align: 'right' });
    doc.text(`Generado: ${new Date().toLocaleString('es-DO')}`, pageW - 14, 25, { align: 'right' });

    return { pageW, pageH };
  };

  const addFooter = (doc: jsPDF) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`${companyName} — Sistema GENOSAN`, 14, pageH - 8);
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, pageH - 8, { align: 'right' });
    }
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { pageW } = makeDocHeader(doc,
      filters.tipo === 'ventas' ? 'REPORTE DE VENTAS' :
      filters.tipo === 'compras' ? 'REPORTE DE COMPRAS' :
      filters.tipo === 'mas_vendidos' ? 'PRODUCTOS MÁS VENDIDOS' :
      filters.tipo === 'menos_vendidos' ? 'PRODUCTOS MENOS VENDIDOS' :
      'REPORTE GENERAL'
    );

    let yPos = 38;
    doc.setTextColor(30, 30, 30);

    // Filtros
    const filtroTexto: string[] = [];
    if (filters.sucursalId) filtroTexto.push(`Sucursal: ${branches.find((b) => b.id === filters.sucursalId)?.name || filters.sucursalId}`);
    if (filters.cajeroId) filtroTexto.push(`Cajero: ${users.find((u) => u.id === filters.cajeroId)?.name || filters.cajeroId}`);
    if (filtroTexto.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Filtros: ${filtroTexto.join(' | ')}`, 14, yPos);
      yPos += 7;
    }

    // Summary cards
    if (filters.tipo === 'mas_vendidos' || filters.tipo === 'menos_vendidos') {
      const t = productSaleTotals!;
      const cards = [
        { label: 'Productos', value: String(t.totalProducts), color: [16, 185, 129] as [number, number, number] },
        { label: 'Unidades Vendidas', value: String(t.totalUnits), color: [100, 116, 139] as [number, number, number] },
        { label: 'Ingreso Total', value: formatCurrency(t.totalRevenue), color: [59, 130, 246] as [number, number, number] },
      ];
      const cardW = (pageW - 28) / cards.length;
      cards.forEach((card, i) => {
        const x = 14 + i * (cardW + 4);
        doc.setFillColor(...card.color);
        doc.roundedRect(x, yPos, cardW - 4, 18, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(card.label, x + 4, yPos + 6);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, x + 4, yPos + 14);
      });
      yPos += 26;
      doc.setTextColor(30, 30, 30);

      (doc as any).autoTable({
        startY: yPos,
        head: [['#', 'Producto', 'Laboratorio', 'Unidades', 'Ingreso', 'Stock Actual', 'Top Vendedor']],
        body: (reportProductSales || []).map((r, idx) => [
          String(idx + 1),
          r.name,
          r.lab,
          String(r.unitsSold),
          formatCurrency(r.revenue),
          String(r.currentStock),
          r.topCashier ? `${r.topCashier.name} (${r.topCashier.units})` : '—',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
        margin: { left: 14, right: 14 },
      });
      addFooter(doc);
      doc.save(`reporte_${filters.tipo}_${filters.desde}_${filters.hasta}.pdf`);
      await saveReporteGenerado({
        tipo: filters.tipo,
        filtro_desde: filters.desde || undefined,
        filtro_hasta: filters.hasta || undefined,
        filtro_sucursal: filters.sucursalId || undefined,
        filtro_cajero: filters.cajeroId || undefined,
        total_ventas: productSaleTotals?.totalRevenue || 0,
        total_compras: 0,
      }).catch(() => {});
      return;
    }

    const cards = [
      { label: 'Total Ventas', value: formatCurrency(totals.totalVentas), color: [16, 185, 129] as [number, number, number] },
      { label: 'Total Compras', value: formatCurrency(totals.totalCompras), color: [100, 116, 139] as [number, number, number] },
      { label: totals.ganancia >= 0 ? 'Ganancia Neta' : 'Pérdida Neta', value: formatCurrency(Math.abs(totals.ganancia)), color: totals.ganancia >= 0 ? [16, 185, 129] as [number, number, number] : [239, 68, 68] as [number, number, number] },
    ].filter((c) => {
      if (filters.tipo === 'ventas') return c.label === 'Total Ventas';
      if (filters.tipo === 'compras') return c.label === 'Total Compras';
      return true;
    });

    const cardW = (pageW - 28) / cards.length;
    cards.forEach((card, i) => {
      const x = 14 + i * (cardW + 4);
      doc.setFillColor(...card.color);
      doc.roundedRect(x, yPos, cardW - 4, 18, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(card.label, x + 4, yPos + 6);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, x + 4, yPos + 14);
    });

    yPos += 26;
    doc.setTextColor(30, 30, 30);

    if ((reportSales || []).length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle de Ventas', 14, yPos);
      yPos += 5;

      (doc as any).autoTable({
        startY: yPos,
        head: [['Fecha', 'NCF', 'Cajero', 'Sucursal', 'Método', 'Total']],
        body: (reportSales || []).map((s) => [
          formatDateShort(s.timestamp),
          s.ncf || '—',
          s.cashierName || '—',
          branches.find((b) => b.id === s.branchId)?.name || '—',
          s.paymentMethod === 'efectivo' ? 'Efectivo' : s.paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Mixto',
          formatCurrency(s.total),
        ]),
        foot: [['', '', '', '', 'TOTAL', formatCurrency(totals.totalVentas)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
        footStyles: { fontStyle: 'bold', fillColor: [240, 253, 244] },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }

    if ((reportPurchases || []).length > 0) {
      if (yPos > (doc.internal.pageSize.getHeight() - 60)) { doc.addPage(); yPos = 20; }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Detalle de Compras', 14, yPos);
      yPos += 5;

      (doc as any).autoTable({
        startY: yPos,
        head: [['Fecha', 'Proveedor', 'Factura', 'Tipo Pago', 'Estado', 'Total']],
        body: (reportPurchases || []).map((p) => [
          formatDateShort(p.purchaseDate),
          p.supplierCompany,
          p.invoiceNumber || '—',
          p.tipoPago === 'contado' ? 'Contado' : 'Crédito',
          p.estadoPago === 'pagado' ? 'Pagado' : p.estadoPago === 'vencido' ? 'Vencido' : 'Pendiente',
          formatCurrency(p.total),
        ]),
        foot: [['', '', '', '', 'TOTAL', formatCurrency(totals.totalCompras)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [100, 116, 139] },
        footStyles: { fontStyle: 'bold', fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 },
      });
    }

    addFooter(doc);
    const filename = `reporte_${filters.tipo}_${filters.desde}_${filters.hasta}.pdf`;
    doc.save(filename);

    await saveReporteGenerado({
      tipo: filters.tipo,
      filtro_desde: filters.desde || undefined,
      filtro_hasta: filters.hasta || undefined,
      filtro_sucursal: filters.sucursalId || undefined,
      filtro_cajero: filters.cajeroId || undefined,
      total_ventas: totals.totalVentas,
      total_compras: totals.totalCompras,
    }).catch(() => {});
  };

  const handleDownloadLabPDF = () => {
    if (!reportLabProducts || reportLabProducts.length === 0) return;

    const { currentUser } = useAuthStore.getState();
    const generatedBy = currentUser?.name || 'Administrador';
    const generatedAt = new Date().toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // ─── ENCABEZADO ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const titleText = 'FACTURACION - VENTAS POR LABORATORIO POR PRODUCTO';
    const titleWidth = doc.getTextWidth(titleText);
    doc.text(titleText, (pageW - titleWidth) / 2, 18);

    // Fecha y laboratorio
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const periodText = `Fecha: ${formatDateShort(filters.desde)} - ${formatDateShort(filters.hasta)}`;
    doc.text(periodText, 14, 26);

    const labText = filters.selectedLab !== 'all' ? `Laboratorio: ${filters.selectedLab}` : 'Laboratorio: Todos';
    doc.text(labText, 14, 31);

    // Pagina 1 de 1 (derecha)
    doc.text('Pagina 1 de 1', pageW - 14, 31, { align: 'right' });

    // ─── LINEA SEPARADORA ───
    doc.setLineWidth(0.5);
    doc.line(14, 35, pageW - 14, 35);

    // ─── FILA LABORATORIO ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const labLabel = 'LABORATORIO:';
    doc.text(labLabel, 14, 42);
    doc.setFont('helvetica', 'normal');
    const labValue = filters.selectedLab !== 'all' ? filters.selectedLab.toUpperCase() : 'TODOS';
    doc.text(labValue, 14 + doc.getTextWidth(labLabel) + 3, 42);

    // ─── TABLA ───
    const t = labTotals!;
    const tableStartY = 48;

    (doc as any).autoTable({
      startY: tableStartY,
      head: [['Código de Producto (SKU)', 'Descripción', 'Fecha de Vencimiento', 'Cantidad Vendida', 'Unidad', 'Precio Unitario', 'Total por Artículo']],
      body: reportLabProducts.map((r) => [
        r.code,
        r.name,
        r.expiryDate ? formatDateShort(r.expiryDate) : '—',
        String(r.unitsSold),
        r.presentation || 'UNID',
        formatCurrency(r.unitSalePrice),
        formatCurrency(r.totalSoldAmount),
      ]),
      foot: [
        ['', '', '', String(t.totalProducts), '', '', ''],
        ['TOTAL', `${t.totalItems} Registro(s)`, '', String(t.totalProducts), '', '', formatCurrency(t.totalImporte)],
      ],
      styles: {
        fontSize: 8,
        font: 'helvetica',
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [200, 200, 200],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        halign: 'center',
      },
      bodyStyles: {
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 26 },
        1: { halign: 'left', cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 14 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'right', cellWidth: 26 },
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
      },
      margin: { left: 14, right: 14 },
      theme: 'grid',
      showFoot: 'lastPage',
    });

    // ─── PIE DE PAGINA ───
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generado por: ${generatedBy}`, 14, pageH - 12);
      doc.text(`Fecha de generación: ${generatedAt}`, 14, pageH - 7);
      doc.text(`Pagina ${i} de ${totalPages}`, pageW - 14, pageH - 7, { align: 'right' });
    }

    doc.save(`reporte_laboratorio_${filters.selectedLab !== 'all' ? filters.selectedLab.replace(/\s+/g, '_') : 'todos'}_${filters.desde}_${filters.hasta}.pdf`);

    saveReporteGenerado({
      tipo: 'laboratorio',
      total_ventas: t.totalImporte,
      total_compras: 0,
    }).catch(() => {});
  };

  const downloadLabExcel = () => {
    if (!reportLabProducts || reportLabProducts.length === 0) return;
    const headers = ['Código de Producto (SKU)', 'Descripción', 'Fecha de Vencimiento', 'Cantidad Vendida', 'Unidad', 'Precio Unitario', 'Total por Artículo'];
    const rows = reportLabProducts.map((r) => [
      r.code,
      r.name,
      r.expiryDate ? formatDateShort(r.expiryDate) : '—',
      String(r.unitsSold),
      r.presentation || 'UNID',
      String(r.unitSalePrice.toFixed(2)),
      String(r.totalSoldAmount.toFixed(2)),
    ]);
    // Totales
    const t = labTotals!;
    rows.push(['', '', '', '', '', '', '']);
    rows.push(['TOTAL', `${t.totalItems} Registro(s)`, '', String(t.totalProducts), '', '', String(t.totalImporte.toFixed(2))]);

    const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_laboratorio_${filters.selectedLab !== 'all' ? filters.selectedLab.replace(/\s+/g, '_') : 'todos'}_${filters.desde}_${filters.hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadProductSalesExcel = () => {
    if (!reportProductSales || reportProductSales.length === 0) return;
    const headers = ['#', 'Producto', 'Laboratorio', 'Unidades Vendidas', 'Ingreso (RD$)', 'Stock Actual', 'Top Vendedor', 'Veces Vendido'];
    const rows = reportProductSales.map((r, idx) => [
      String(idx + 1),
      r.name,
      r.lab,
      String(r.unitsSold),
      String(r.revenue.toFixed(2)),
      String(r.currentStock),
      r.topCashier ? `${r.topCashier.name} (${r.topCashier.units})` : '—',
      String(r.timesSold),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${filters.tipo}_${filters.desde}_${filters.hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Reportes</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Genera reportes detallados en PDF con filtros avanzados</p>
        </div>
      </div>

      {/* ── Panel de filtros ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <i className="ri-filter-line"></i> Filtros del Reporte
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          {/* Tipo */}
          <div className="lg:col-span-3">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">Tipo de Reporte</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: 'ventas', label: 'Ventas', icon: 'ri-shopping-cart-line' },
                { id: 'compras', label: 'Compras', icon: 'ri-store-2-line' },
                { id: 'general', label: 'General (Ventas + Compras)', icon: 'ri-bar-chart-2-line' },
                { id: 'laboratorio', label: 'Por Laboratorio', icon: 'ri-flask-line' },
                { id: 'mas_vendidos', label: 'Más Vendidos', icon: 'ri-arrow-up-line' },
                { id: 'menos_vendidos', label: 'Menos Vendidos', icon: 'ri-arrow-down-line' },
              ] as { id: ReportType; label: string; icon: string }[]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilters({ ...filters, tipo: t.id })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    filters.tipo === t.id
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300'
                  }`}
                >
                  <i className={t.icon}></i> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desde */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Desde</label>
            <input
              type="date"
              value={filters.desde}
              onChange={(e) => setFilters({ ...filters, desde: e.target.value })}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
            />
          </div>

          {/* Hasta */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Hasta</label>
            <input
              type="date"
              value={filters.hasta}
              onChange={(e) => setFilters({ ...filters, hasta: e.target.value })}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
            />
          </div>

          {/* Períodos rápidos */}
          <div className="flex flex-col justify-end">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">Períodos rápidos</label>
            <div className="flex gap-1 flex-wrap">
              {[
                { label: 'Hoy', desde: today, hasta: today },
                { label: 'Esta semana', desde: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]; })(), hasta: today },
                { label: 'Este mes', desde: firstOfMonth, hasta: today },
                { label: 'Mes anterior', desde: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return d.toISOString().split('T')[0]; })(), hasta: (() => { const d = new Date(); d.setDate(0); return d.toISOString().split('T')[0]; })() },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => setFilters({ ...filters, desde: p.desde, hasta: p.hasta })}
                  className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-emerald-100 hover:text-emerald-700 cursor-pointer whitespace-nowrap transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sucursal */}
          {filters.tipo !== 'compras' && filters.tipo !== 'laboratorio' && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Sucursal</label>
              <select
                value={filters.sucursalId}
                onChange={(e) => setFilters({ ...filters, sucursalId: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
              >
                <option value="">Todas las sucursales</option>
                {branches.filter((b) => b.isActive).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cajero */}
          {filters.tipo !== 'compras' && filters.tipo !== 'laboratorio' && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Cajero</label>
              <select
                value={filters.cajeroId}
                onChange={(e) => setFilters({ ...filters, cajeroId: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
              >
                <option value="">Todos los cajeros</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Laboratorio selector */}
          {filters.tipo === 'laboratorio' && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Laboratorio</label>
              <select
                value={filters.selectedLab}
                onChange={(e) => setFilters({ ...filters, selectedLab: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
              >
                <option value="all">Todos los laboratorios</option>
                {allLabs.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
          >
            {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-search-line"></i>}
            {loading ? 'Cargando...' : 'Generar Reporte'}
          </button>
          {generated && filters.tipo === 'laboratorio' && (
            <>
              <button
                onClick={handleDownloadLabPDF}
                className="px-6 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-file-pdf-line"></i> Descargar PDF
              </button>
              <button
                onClick={downloadLabExcel}
                className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-file-excel-line"></i> Descargar Excel
              </button>
            </>
          )}
          {generated && (filters.tipo === 'mas_vendidos' || filters.tipo === 'menos_vendidos') && (
            <>
              <button
                onClick={handleDownloadPDF}
                className="px-6 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-file-pdf-line"></i> Descargar PDF
              </button>
              <button
                onClick={downloadProductSalesExcel}
                className="px-6 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-file-excel-line"></i> Descargar Excel
              </button>
            </>
          )}
          {generated && (filters.tipo === 'ventas' || filters.tipo === 'compras' || filters.tipo === 'general') && (
            <button
              onClick={handleDownloadPDF}
              className="px-6 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-900 dark:hover:bg-slate-600 text-sm font-medium cursor-pointer whitespace-nowrap flex items-center gap-2"
            >
              <i className="ri-file-pdf-line"></i> Descargar PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Vista previa del reporte ── */}
      {generated && (
        <div className="space-y-4">
          {/* Laboratorio cards — resumen de ventas */}
          {filters.tipo === 'laboratorio' && labTotals && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 font-medium">Cantidad Total Vendida</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{labTotals.totalProducts}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1 font-medium">Registros</p>
                <p className="text-2xl font-bold font-mono text-slate-700 dark:text-slate-200">{labTotals.totalItems}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 font-medium">Total General de Ventas</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{formatCurrency(labTotals.totalImporte)}</p>
              </div>
            </div>
          )}

          {/* Tabla laboratorios — productos vendidos */}
          {filters.tipo === 'laboratorio' && (reportLabProducts || []).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                  FACTURACION - VENTAS POR LABORATORIO POR PRODUCTO
                  <span className="ml-2 text-slate-500 font-normal">({(reportLabProducts || []).length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Fecha: {formatDateShort(filters.desde)} — {formatDateShort(filters.hasta)}
                  {filters.selectedLab !== 'all' && (
                    <span className="ml-2">| Laboratorio: {filters.selectedLab}</span>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium uppercase">Código de Producto (SKU)</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium uppercase">Descripción</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium uppercase">Fecha de Vencimiento</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium uppercase">Cantidad Vendida</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium uppercase">Unidad</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium uppercase">Precio Unitario</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium uppercase">Total por Artículo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportLabProducts || []).map((r, idx) => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{r.code}</td>
                        <td className="p-3 text-slate-800 dark:text-white font-medium text-xs">{r.name}</td>
                        <td className="p-3 text-center text-xs font-mono">
                          {r.expiryDate ? (
                            <span className={r.isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                              {formatDateShort(r.expiryDate)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300 text-xs font-mono font-semibold">{r.unitsSold}</td>
                        <td className="p-3 text-center text-slate-600 dark:text-slate-400 text-xs uppercase">{r.presentation}</td>
                        <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400 text-xs">{formatCurrency(r.unitSalePrice)}</td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-800 dark:text-white text-xs">{formatCurrency(r.totalSoldAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <td className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-200">TOTAL</td>
                      <td className="p-3 text-xs font-semibold text-slate-700 dark:text-slate-200">{labTotals?.totalItems} Registro(s)</td>
                      <td className="p-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-200"></td>
                      <td className="p-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-200 font-mono">{labTotals?.totalProducts}</td>
                      <td className="p-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-200"></td>
                      <td className="p-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-200"></td>
                      <td className="p-3 text-right text-xs font-bold font-mono text-slate-800 dark:text-white">{formatCurrency(labTotals?.totalImporte || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Más / Menos vendidos cards */}
          {(filters.tipo === 'mas_vendidos' || filters.tipo === 'menos_vendidos') && productSaleTotals && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 font-medium">Productos</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{productSaleTotals.totalProducts}</p>
              </div>
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4">
                <p className="text-xs text-sky-600 dark:text-sky-400 mb-1 font-medium">Unidades Vendidas</p>
                <p className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-300">{productSaleTotals.totalUnits}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 font-medium">Ingreso Total</p>
                <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">{formatCurrency(productSaleTotals.totalRevenue)}</p>
              </div>
            </div>
          )}

          {/* Tabla más/menos vendidos */}
          {(filters.tipo === 'mas_vendidos' || filters.tipo === 'menos_vendidos') && (reportProductSales || []).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                  {filters.tipo === 'mas_vendidos' ? 'Productos Más Vendidos' : 'Productos Menos Vendidos'} ({(reportProductSales || []).length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">#</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Producto</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Laboratorio</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium">Unidades</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Ingreso</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium">Stock</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Top Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportProductSales || []).map((r, idx) => (
                      <tr key={r.productId} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="p-3 text-slate-500 font-mono text-xs">{idx + 1}</td>
                        <td className="p-3 text-slate-800 dark:text-white font-medium text-xs">{r.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">{r.lab}</td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300 text-xs font-mono font-semibold">{r.unitsSold}</td>
                        <td className="p-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">{formatCurrency(r.revenue)}</td>
                        <td className="p-3 text-center text-slate-700 dark:text-slate-300 text-xs font-mono">{r.currentStock}</td>
                        <td className="p-3 text-xs">
                          {r.topCashier ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                              <i className="ri-user-star-line text-[10px]"></i>
                              {r.topCashier.name} ({r.topCashier.units})
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabla ventas */}
          {(reportSales || []).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                  Ventas ({(reportSales || []).length})
                  <span className="ml-2 text-emerald-600 font-mono">{formatCurrency(totals.totalVentas)}</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Fecha</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">NCF</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Cajero</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Sucursal</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium">Método</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportSales || []).slice(0, 50).map((s) => (
                      <tr key={s.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">{formatDateShort(s.timestamp)}</td>
                        <td className="p-3 font-mono text-xs text-slate-500">{s.ncf || '—'}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{s.cashierName || '—'}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{branches.find((b) => b.id === s.branchId)?.name || '—'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.paymentMethod === 'efectivo' ? 'bg-emerald-100 text-emerald-600' : s.paymentMethod === 'tarjeta' ? 'bg-sky-100 text-sky-600' : 'bg-amber-100 text-amber-600'}`}>
                            {s.paymentMethod === 'efectivo' ? 'Efectivo' : s.paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Mixto'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-800 dark:text-white text-sm">{formatCurrency(s.total)}</td>
                      </tr>
                    ))}
                    {(reportSales || []).length > 50 && (
                      <tr className="border-t border-slate-100 dark:border-slate-700">
                        <td colSpan={6} className="p-3 text-center text-xs text-slate-400">
                          Mostrando 50 de {(reportSales || []).length} registros. Descarga el PDF para el reporte completo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-emerald-50 dark:bg-emerald-900/20">
                    <tr>
                      <td colSpan={5} className="p-3 text-right font-semibold text-slate-700 text-sm">Total</td>
                      <td className="p-3 text-right font-bold font-mono text-emerald-600">{formatCurrency(totals.totalVentas)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tabla compras */}
          {(reportPurchases || []).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                  Compras ({(reportPurchases || []).length})
                  <span className="ml-2 text-slate-600 dark:text-slate-400 font-mono">{formatCurrency(totals.totalCompras)}</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Fecha</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Proveedor</th>
                      <th className="text-left p-3 text-xs text-slate-500 font-medium">Factura</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium">Pago</th>
                      <th className="text-center p-3 text-xs text-slate-500 font-medium">Estado</th>
                      <th className="text-right p-3 text-xs text-slate-500 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportPurchases || []).slice(0, 50).map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                        <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">{formatDateShort(p.purchaseDate)}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{p.supplierCompany}</td>
                        <td className="p-3 font-mono text-xs text-slate-500">{p.invoiceNumber || '—'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${p.tipoPago === 'contado' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {p.tipoPago === 'contado' ? 'Contado' : 'Crédito'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${p.estadoPago === 'pagado' ? 'bg-emerald-100 text-emerald-600' : p.estadoPago === 'vencido' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                            {p.estadoPago === 'pagado' ? 'Pagado' : p.estadoPago === 'vencido' ? 'Vencido' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-800 dark:text-white text-sm">{formatCurrency(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <td colSpan={5} className="p-3 text-right font-semibold text-slate-700 dark:text-slate-200 text-sm">Total</td>
                      <td className="p-3 text-right font-bold font-mono text-slate-800 dark:text-white">{formatCurrency(totals.totalCompras)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {(reportSales || []).length === 0 && (reportPurchases || []).length === 0 && (reportLabProducts || []).length === 0 && (reportProductSales || []).length === 0 && (
            <div className="text-center py-16 text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <i className="ri-file-search-line text-5xl block mb-3 opacity-30"></i>
              <p>No hay datos para el período y filtros seleccionados</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}