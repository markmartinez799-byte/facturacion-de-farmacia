import { useState, useRef } from 'react';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDateShort, formatDateTime } from '@/utils/formatters';
import type { Supplier, SupplierPurchase, ReturnToSupplier } from '@/types';

type Tab = 'proveedores' | 'compras' | 'devoluciones' | 'vencimientos';

export default function ProveedoresPage() {
  const {
    suppliers, addSupplier, updateSupplier, deleteSupplier,
    supplierPurchases, addSupplierPurchase,
    returnsToSupplier, addReturnToSupplier, updateReturnStatus,
    getExpiringProductsIn6Months, products,
  } = usePOSStore();
  const { currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>('proveedores');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', company: '', phone: '', email: '', logo: '', isActive: true });
  const [logoMode, setLogoMode] = useState<'url' | 'file'>('url');
  const [logoPreview, setLogoPreview] = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Purchase form
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    items: [{ productId: '', productName: '', quantity: 1, unitCost: 0, expiryDate: '' }],
  });

  // Return form
  const [returnForm, setReturnForm] = useState({
    supplierId: '',
    purchaseId: '',
    items: [{ productId: '', productName: '', quantity: 1, reason: '', expiryDate: '' }],
  });

  const expiringIn6Months = getExpiringProductsIn6Months();
  const expiringIn30Days = expiringIn6Months.filter((p) => {
    const diff = new Date(p.expiryDate).getTime() - Date.now();
    return diff <= 30 * 24 * 60 * 60 * 1000;
  });

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: 'proveedores', label: 'Proveedores', icon: 'ri-building-2-line' },
    { id: 'compras', label: 'Historial de Compras', icon: 'ri-shopping-bag-3-line', count: supplierPurchases.length },
    { id: 'devoluciones', label: 'Devoluciones', icon: 'ri-arrow-go-back-line', count: returnsToSupplier.filter((r) => r.status === 'pendiente').length },
    { id: 'vencimientos', label: 'Próx. Vencimientos', icon: 'ri-alarm-warning-line', count: expiringIn6Months.length },
  ];

  const handleOpenSupplier = (sup?: Supplier) => {
    if (sup) {
      setEditing(sup);
      setSupplierForm({ name: sup.name, company: sup.company, phone: sup.phone, email: sup.email || '', logo: sup.logo || '', isActive: sup.isActive });
      setLogoPreview(sup.logo || '');
    } else {
      setEditing(null);
      setSupplierForm({ name: '', company: '', phone: '', email: '', logo: '', isActive: true });
      setLogoPreview('');
    }
    setLogoMode('url');
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = () => {
    if (!supplierForm.name || !supplierForm.company || !supplierForm.phone) return;
    const data = { ...supplierForm, logo: supplierForm.logo || undefined };
    if (editing) updateSupplier(editing.id, data);
    else addSupplier(data);
    setShowSupplierModal(false);
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      setSupplierForm((f) => ({ ...f, logo: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSavePurchase = () => {
    const sup = suppliers.find((s) => s.id === purchaseForm.supplierId);
    if (!sup || purchaseForm.items.some((i) => !i.productName || !i.expiryDate)) return;
    const total = purchaseForm.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
    addSupplierPurchase({
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCompany: sup.company,
      invoiceNumber: purchaseForm.invoiceNumber,
      purchaseDate: new Date(purchaseForm.purchaseDate).toISOString(),
      items: purchaseForm.items.map((i) => ({
        productId: i.productId || '',
        productName: i.productName,
        quantity: i.quantity,
        unitCost: i.unitCost,
        expiryDate: i.expiryDate,
      })),
      total,
    });
    setShowPurchaseModal(false);
    setPurchaseForm({ supplierId: '', invoiceNumber: '', purchaseDate: new Date().toISOString().split('T')[0], items: [{ productId: '', productName: '', quantity: 1, unitCost: 0, expiryDate: '' }] });
  };

  const handleSaveReturn = () => {
    const sup = suppliers.find((s) => s.id === returnForm.supplierId);
    if (!sup || returnForm.items.some((i) => !i.productName || !i.reason)) return;
    addReturnToSupplier({
      supplierId: sup.id,
      supplierName: sup.name,
      supplierCompany: sup.company,
      purchaseId: returnForm.purchaseId || undefined,
      status: 'pendiente',
      items: returnForm.items.map((i) => ({
        productId: i.productId || '',
        productName: i.productName,
        quantity: i.quantity,
        reason: i.reason,
        expiryDate: i.expiryDate,
      })),
    });
    setShowReturnModal(false);
    setReturnForm({ supplierId: '', purchaseId: '', items: [{ productId: '', productName: '', quantity: 1, reason: '', expiryDate: '' }] });
  };

  const downloadReturnPDF = (ret: ReturnToSupplier) => {
    const sup = suppliers.find((s) => s.id === ret.supplierId);
    const statusLabel = ret.status === 'pendiente' ? 'PENDIENTE' : ret.status === 'enviado' ? 'ENVIADO' : 'CONFIRMADO';
    const statusColor = ret.status === 'pendiente' ? '#d97706' : ret.status === 'enviado' ? '#0284c7' : '#059669';

    const itemsHTML = ret.items.map((item, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 6px;font-size:12px;">${i + 1}. ${item.productName}</td>
        <td style="padding:8px 6px;text-align:center;font-size:12px;font-family:monospace;">${item.quantity}</td>
        <td style="padding:8px 6px;text-align:center;font-size:12px;">${item.expiryDate || 'N/A'}</td>
        <td style="padding:8px 6px;font-size:12px;color:#555;">${item.reason}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Devolución - ${ret.supplierName}</title>
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div style="border-bottom:3px solid #10b981;padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:20px;font-weight:900;color:#10b981;letter-spacing:0.04em;">INFORME DE DEVOLUCIÓN</div>
    <div style="font-size:12px;color:#666;margin-top:3px;">Documento para presentar al proveedor</div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:16px;">
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Proveedor</div>
      <div style="font-size:15px;font-weight:700;color:#111;">${ret.supplierName}</div>
      <div style="font-size:12px;color:#555;margin-top:2px;">${ret.supplierCompany}</div>
      ${sup?.phone ? `<div style="font-size:12px;color:#555;margin-top:2px;">Tel: ${sup.phone}</div>` : ''}
      ${sup?.email ? `<div style="font-size:12px;color:#555;">Email: ${sup.email}</div>` : ''}
    </div>
    <div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Información</div>
      <div style="font-size:12px;color:#555;">Fecha: <strong>${formatDateTime(ret.createdAt)}</strong></div>
      <div style="font-size:12px;color:#555;margin-top:4px;">ID: <span style="font-family:monospace;">${ret.id.slice(0, 12).toUpperCase()}</span></div>
      <div style="margin-top:6px;">
        <span style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}60;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${statusLabel}</span>
      </div>
    </div>
  </div>

  <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Productos a Devolver (${ret.items.length})</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Producto</th>
        <th style="padding:8px 6px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">Cantidad</th>
        <th style="padding:8px 6px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">Vencimiento</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Motivo</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>

  <div style="margin-top:24px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:11px;color:#166534;">
    Este documento es un informe interno de devolución. Preséntelo al proveedor para gestionar el proceso de devolución.
  </div>

  <div style="margin-top:20px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px;">
    Generado el ${new Date().toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' })}
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;border:none;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(html); doc.close();
    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500);
      } catch { document.body.removeChild(iframe); }
    };
    if (doc.readyState === 'complete') doPrint();
    else { iframe.onload = doPrint; setTimeout(doPrint, 600); }
  };

  const getDaysUntilExpiry = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadge = (days: number) => {
    if (days <= 0) return 'bg-red-100 text-red-700 border-red-200';
    if (days <= 30) return 'bg-red-100 text-red-700 border-red-200';
    if (days <= 90) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  };

  const getStatusBadge = (status: ReturnToSupplier['status']) => {
    if (status === 'pendiente') return 'bg-amber-100 text-amber-700';
    if (status === 'enviado') return 'bg-sky-100 text-sky-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-sora font-bold text-slate-800 dark:text-white">Proveedores</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de compras, devoluciones y vencimientos</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'proveedores' && (
            <button onClick={() => handleOpenSupplier()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap text-sm">
              <i className="ri-add-line"></i> Nuevo Proveedor
            </button>
          )}
          {activeTab === 'compras' && (
            <button onClick={() => setShowPurchaseModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-700 cursor-pointer whitespace-nowrap text-sm">
              <i className="ri-add-line"></i> Registrar Compra
            </button>
          )}
          {activeTab === 'devoluciones' && (
            <button onClick={() => setShowReturnModal(true)} className="px-4 py-2 bg-amber-500 text-white rounded-lg flex items-center gap-2 hover:bg-amber-600 cursor-pointer whitespace-nowrap text-sm">
              <i className="ri-arrow-go-back-line"></i> Nueva Devolución
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 flex items-center gap-2 font-medium text-sm whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <i className={tab.icon}></i>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                activeTab === tab.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: PROVEEDORES ── */}
      {activeTab === 'proveedores' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((sup) => (
            <div key={sup.id} className={`bg-white dark:bg-slate-800 rounded-xl border p-5 ${sup.isActive ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-700 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  {sup.logo ? (
                    <img src={sup.logo} alt={sup.company} className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <i className="ri-building-2-line text-slate-400 text-xl"></i>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleOpenSupplier(sup)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg cursor-pointer">
                    <i className="ri-edit-line text-sm"></i>
                  </button>
                  <button onClick={() => deleteSupplier(sup.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer">
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-white text-base">{sup.name}</h3>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <i className="ri-building-2-line text-xs"></i>
                  <span className="truncate">{sup.company}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <i className="ri-phone-line text-xs"></i>
                  <span>{sup.phone}</span>
                </div>
                {sup.email && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                    <i className="ri-mail-line text-xs"></i>
                    <span className="truncate">{sup.email}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sup.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                  {sup.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <span className="text-xs text-slate-400">
                  {supplierPurchases.filter((p) => p.supplierId === sup.id).length} compra(s)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: HISTORIAL DE COMPRAS ── */}
      {activeTab === 'compras' && (
        <div className="space-y-4">
          {supplierPurchases.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <i className="ri-shopping-bag-3-line text-5xl mb-3 block opacity-30"></i>
              <p>No hay compras registradas</p>
            </div>
          ) : (
            supplierPurchases.slice().reverse().map((purchase) => (
              <div key={purchase.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-white">{purchase.supplierCompany}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">— {purchase.supplierName}</span>
                      {purchase.invoiceNumber && (
                        <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-xs font-mono">
                          {purchase.invoiceNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      <i className="ri-calendar-line mr-1"></i>
                      {formatDateTime(purchase.purchaseDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(purchase.total)}</p>
                    <p className="text-xs text-slate-400">{purchase.items.length} producto(s)</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-slate-100 dark:border-slate-700">
                        <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Producto</th>
                        <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Cantidad</th>
                        <th className="text-right p-3 text-slate-500 dark:text-slate-400 font-medium">Costo Unit.</th>
                        <th className="text-right p-3 text-slate-500 dark:text-slate-400 font-medium">Subtotal</th>
                        <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchase.items.map((item, idx) => {
                        const days = getDaysUntilExpiry(item.expiryDate);
                        const isNearExpiry = days <= 180;
                        return (
                          <tr key={idx} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="p-3 text-slate-800 dark:text-slate-200">{item.productName}</td>
                            <td className="p-3 text-center font-mono text-slate-700 dark:text-slate-300">{item.quantity}</td>
                            <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(item.unitCost)}</td>
                            <td className="p-3 text-right font-mono font-semibold text-slate-800 dark:text-white">{formatCurrency(item.quantity * item.unitCost)}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs border ${isNearExpiry ? getExpiryBadge(days) : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {item.expiryDate}
                                {isNearExpiry && days > 0 && <span className="ml-1">({days}d)</span>}
                                {days <= 0 && <span className="ml-1 font-bold">VENCIDO</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: DEVOLUCIONES ── */}
      {activeTab === 'devoluciones' && (
        <div className="space-y-4">
          {returnsToSupplier.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <i className="ri-arrow-go-back-line text-5xl mb-3 block opacity-30"></i>
              <p>No hay devoluciones registradas</p>
            </div>
          ) : (
            returnsToSupplier.slice().reverse().map((ret) => (
              <div key={ret.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-white">{ret.supplierCompany}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">— {ret.supplierName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(ret.status)}`}>
                        {ret.status.charAt(0).toUpperCase() + ret.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      <i className="ri-calendar-line mr-1"></i>
                      {formatDateTime(ret.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ret.status === 'pendiente' && (
                      <button
                        onClick={() => updateReturnStatus(ret.id, 'enviado')}
                        className="px-3 py-1.5 bg-sky-100 text-sky-700 rounded-lg text-xs font-medium hover:bg-sky-200 cursor-pointer whitespace-nowrap"
                      >
                        Marcar Enviado
                      </button>
                    )}
                    {ret.status === 'enviado' && (
                      <button
                        onClick={() => updateReturnStatus(ret.id, 'confirmado')}
                        className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 cursor-pointer whitespace-nowrap"
                      >
                        Confirmar Recibido
                      </button>
                    )}
                    <button
                      onClick={() => downloadReturnPDF(ret)}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    >
                      <i className="ri-printer-line"></i> Imprimir
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-t border-slate-100 dark:border-slate-700">
                        <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Producto</th>
                        <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Cantidad</th>
                        <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Vencimiento</th>
                        <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ret.items.map((item, idx) => (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="p-3 text-slate-800 dark:text-slate-200">{item.productName}</td>
                          <td className="p-3 text-center font-mono text-slate-700 dark:text-slate-300">{item.quantity}</td>
                          <td className="p-3 text-center">
                            <span className="text-xs text-slate-500">{item.expiryDate || 'N/A'}</span>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 text-sm">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB: VENCIMIENTOS ── */}
      {activeTab === 'vencimientos' && (
        <div className="space-y-4">
          {expiringIn30Days.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <i className="ri-alarm-warning-fill text-red-500 text-xl mt-0.5"></i>
              <div>
                <p className="font-semibold text-red-700 dark:text-red-300">
                  {expiringIn30Days.length} producto(s) vencen en menos de 30 días
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                  Considera crear una devolución al proveedor o aplicar descuento para liquidarlos.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-800 dark:text-white">
                Productos que vencen en los próximos 6 meses
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {expiringIn6Months.length} producto(s) encontrados
              </p>
            </div>
            {expiringIn6Months.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <i className="ri-checkbox-circle-line text-5xl mb-3 block opacity-30 text-emerald-500"></i>
                <p>No hay productos próximos a vencer en 6 meses</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Producto</th>
                      <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Laboratorio</th>
                      <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Vencimiento</th>
                      <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Días restantes</th>
                      <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Stock</th>
                      <th className="text-left p-3 text-slate-500 dark:text-slate-400 font-medium">Proveedor</th>
                      <th className="text-center p-3 text-slate-500 dark:text-slate-400 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringIn6Months
                      .slice()
                      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                      .map((product) => {
                        const days = getDaysUntilExpiry(product.expiryDate);
                        const totalStock = Object.values(product.stock).reduce((s, v) => s + v, 0);
                        const sup = product.supplierId ? suppliers.find((s) => s.id === product.supplierId) : null;
                        return (
                          <tr key={product.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="p-3">
                              <p className="font-medium text-slate-800 dark:text-white">{product.commercialName}</p>
                              <p className="text-xs text-slate-400">{product.presentation}</p>
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{product.lab}</td>
                            <td className="p-3 text-center font-mono text-sm text-slate-700 dark:text-slate-300">{product.expiryDate}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getExpiryBadge(days)}`}>
                                {days <= 0 ? 'VENCIDO' : `${days} días`}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono text-slate-700 dark:text-slate-300">{totalStock}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400 text-sm">
                              {sup ? (
                                <div>
                                  <p className="font-medium">{sup.name}</p>
                                  <p className="text-xs text-slate-400">{sup.phone}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">Sin proveedor</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  setReturnForm({
                                    supplierId: product.supplierId || '',
                                    purchaseId: '',
                                    items: [{ productId: product.id, productName: product.commercialName, quantity: 1, reason: `Próximo a vencer (${product.expiryDate})`, expiryDate: product.expiryDate }],
                                  });
                                  setShowReturnModal(true);
                                  setActiveTab('devoluciones');
                                }}
                                className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs hover:bg-amber-200 cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-arrow-go-back-line mr-1"></i>Devolver
                              </button>
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
      )}

      {/* ── MODAL: PROVEEDOR ── */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Mini preview en el header */}
                <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="logo" className="w-full h-full object-contain p-0.5" onError={() => setLogoPreview('')} />
                  ) : (
                    <i className="ri-building-2-line text-slate-400 text-base"></i>
                  )}
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-white">{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
              </div>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xl"></i></button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* Logo de empresa */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                  <i className="ri-image-line"></i> Logo de la Empresa
                  <span className="font-normal text-slate-400">(opcional)</span>
                </p>

                {/* Selector URL / Archivo */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setLogoMode('url')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${logoMode === 'url' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-emerald-300'}`}
                  >
                    <i className="ri-link text-xs"></i> Por URL
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLogoMode('file'); setTimeout(() => logoFileRef.current?.click(), 50); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${logoMode === 'file' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-emerald-300'}`}
                  >
                    <i className="ri-upload-2-line text-xs"></i> Subir archivo
                  </button>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={() => { setLogoPreview(''); setSupplierForm((f) => ({ ...f, logo: '' })); }}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50 cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-delete-bin-line text-xs"></i> Quitar
                    </button>
                  )}
                </div>

                <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />

                {logoMode === 'url' && (
                  <input
                    type="text"
                    value={supplierForm.logo}
                    onChange={(e) => { setSupplierForm((f) => ({ ...f, logo: e.target.value })); setLogoPreview(e.target.value); }}
                    placeholder="https://empresa.com/logo.png"
                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm"
                  />
                )}

                {logoPreview ? (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <img src={logoPreview} alt="Vista previa" className="w-full h-full object-contain p-1" onError={() => setLogoPreview('')} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Vista previa del logo. Se mostrará en la tarjeta del proveedor.</p>
                  </div>
                ) : (
                  !logoPreview && logoMode === 'url' && !supplierForm.logo && (
                    <p className="text-xs text-slate-400 mt-1">Sin logo. La tarjeta mostrará un ícono por defecto.</p>
                  )
                )}
              </div>

              {/* Campos del proveedor */}
              {[
                { label: 'Nombre del contacto *', key: 'name', placeholder: 'Ej: Carlos Méndez' },
                { label: 'Empresa *', key: 'company', placeholder: 'Ej: Distribuidora Farma RD' },
                { label: 'Teléfono *', key: 'phone', placeholder: '809-555-0000' },
                { label: 'Email (opcional)', key: 'email', placeholder: 'correo@empresa.com' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">{field.label}</label>
                  <input
                    type="text"
                    value={(supplierForm as Record<string, string>)[field.key]}
                    onChange={(e) => setSupplierForm({ ...supplierForm, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setShowSupplierModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm cursor-pointer whitespace-nowrap">Cancelar</button>
              <button
                onClick={handleSaveSupplier}
                disabled={!supplierForm.name || !supplierForm.company || !supplierForm.phone}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap flex items-center gap-2"
              >
                <i className="ri-save-line"></i> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR COMPRA ── */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
              <h3 className="font-semibold text-slate-800 dark:text-white">Registrar Compra a Proveedor</h3>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xl"></i></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Proveedor *</label>
                  <select value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm">
                    <option value="">Seleccionar...</option>
                    {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.company} — {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">N° Factura</label>
                  <input type="text" value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })} placeholder="FAC-2026-0001" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Fecha de Compra</label>
                  <input type="date" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Productos *</label>
                  <button
                    onClick={() => setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, { productId: '', productName: '', quantity: 1, unitCost: 0, expiryDate: '' }] })}
                    className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer flex items-center gap-1"
                  >
                    <i className="ri-add-line"></i> Agregar producto
                  </button>
                </div>
                <div className="space-y-2">
                  {purchaseForm.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      <div className="col-span-4">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const prod = products.find((p) => p.id === e.target.value);
                            const newItems = [...purchaseForm.items];
                            newItems[idx] = { ...newItems[idx], productId: e.target.value, productName: prod?.commercialName || '' };
                            setPurchaseForm({ ...purchaseForm, items: newItems });
                          }}
                          className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs"
                        >
                          <option value="">Seleccionar producto...</option>
                          {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.commercialName}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" min={1} value={item.quantity} onChange={(e) => { const ni = [...purchaseForm.items]; ni[idx] = { ...ni[idx], quantity: parseInt(e.target.value) || 1 }; setPurchaseForm({ ...purchaseForm, items: ni }); }} placeholder="Cant." className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs text-center" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min={0} step={0.01} value={item.unitCost} onChange={(e) => { const ni = [...purchaseForm.items]; ni[idx] = { ...ni[idx], unitCost: parseFloat(e.target.value) || 0 }; setPurchaseForm({ ...purchaseForm, items: ni }); }} placeholder="Costo" className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs text-center" />
                      </div>
                      <div className="col-span-3">
                        <input type="date" value={item.expiryDate} onChange={(e) => { const ni = [...purchaseForm.items]; ni[idx] = { ...ni[idx], expiryDate: e.target.value }; setPurchaseForm({ ...purchaseForm, items: ni }); }} className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs" />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {purchaseForm.items.length > 1 && (
                          <button onClick={() => { const ni = purchaseForm.items.filter((_, i) => i !== idx); setPurchaseForm({ ...purchaseForm, items: ni }); }} className="text-red-400 hover:text-red-600 cursor-pointer">
                            <i className="ri-delete-bin-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Total: <span className="text-emerald-600 font-mono">{formatCurrency(purchaseForm.items.reduce((s, i) => s + i.quantity * i.unitCost, 0))}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-800">
              <button onClick={() => setShowPurchaseModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={handleSavePurchase} disabled={!purchaseForm.supplierId} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap">Guardar Compra</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DEVOLUCIÓN ── */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
              <h3 className="font-semibold text-slate-800 dark:text-white">Nueva Devolución a Proveedor</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xl"></i></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Proveedor *</label>
                  <select value={returnForm.supplierId} onChange={(e) => setReturnForm({ ...returnForm, supplierId: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm">
                    <option value="">Seleccionar...</option>
                    {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.company} — {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Compra relacionada (opcional)</label>
                  <select value={returnForm.purchaseId} onChange={(e) => setReturnForm({ ...returnForm, purchaseId: e.target.value })} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm">
                    <option value="">Sin referencia</option>
                    {supplierPurchases.filter((p) => !returnForm.supplierId || p.supplierId === returnForm.supplierId).map((p) => (
                      <option key={p.id} value={p.id}>{p.invoiceNumber || p.id.slice(0, 8)} — {formatDateShort(p.purchaseDate)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Productos a devolver *</label>
                  <button
                    onClick={() => setReturnForm({ ...returnForm, items: [...returnForm.items, { productId: '', productName: '', quantity: 1, reason: '', expiryDate: '' }] })}
                    className="text-xs text-amber-600 hover:text-amber-700 cursor-pointer flex items-center gap-1"
                  >
                    <i className="ri-add-line"></i> Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {returnForm.items.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <select
                            value={item.productId}
                            onChange={(e) => {
                              const prod = products.find((p) => p.id === e.target.value);
                              const ni = [...returnForm.items];
                              ni[idx] = { ...ni[idx], productId: e.target.value, productName: prod?.commercialName || '', expiryDate: prod?.expiryDate || '' };
                              setReturnForm({ ...returnForm, items: ni });
                            }}
                            className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs"
                          >
                            <option value="">Seleccionar producto...</option>
                            {products.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.commercialName}</option>)}
                          </select>
                        </div>
                        <input type="number" min={1} value={item.quantity} onChange={(e) => { const ni = [...returnForm.items]; ni[idx] = { ...ni[idx], quantity: parseInt(e.target.value) || 1 }; setReturnForm({ ...returnForm, items: ni }); }} placeholder="Cant." className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs text-center" />
                      </div>
                      <input type="text" value={item.reason} onChange={(e) => { const ni = [...returnForm.items]; ni[idx] = { ...ni[idx], reason: e.target.value }; setReturnForm({ ...returnForm, items: ni }); }} placeholder="Motivo de devolución (ej: Próximo a vencer, Producto dañado...)" className="w-full p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs" />
                      {returnForm.items.length > 1 && (
                        <button onClick={() => { const ni = returnForm.items.filter((_, i) => i !== idx); setReturnForm({ ...returnForm, items: ni }); }} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">
                          <i className="ri-delete-bin-line mr-1"></i>Eliminar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-800">
              <button onClick={() => setShowReturnModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={handleSaveReturn} disabled={!returnForm.supplierId} className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm cursor-pointer whitespace-nowrap">Crear Devolución</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
