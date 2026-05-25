import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet, ChevronRight, Loader, Info } from 'lucide-react';
import { usePOSStore } from '@/store/posStore';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/utils/formatters';
import { supabase } from '@/lib/supabase';
import { generateId, now } from '@/utils/formatters';
import { checkDuplicateProduct } from '@/services/supabaseService';
import type { DuplicateCheckResult } from '@/services/supabaseService';

// ─── Types ──────────────────────────────────────────────────────────────────

type ImportMode = 'skip_duplicates' | 'replace_all' | 'review_one_by_one';

interface ParsedRow {
  barcode: string;
  commercialName: string;
  genericName: string;
  lab: string;
  presentation: string;
  price: number;
  purchaseCost: number;
  itbisApplicable: boolean;
  stock: number;
  expiryDate: string;
  descripcion: string;
  estante: string;
  _warnings: string[];
  _rowIndex: number;
  _duplicateInfo?: DuplicateCheckResult;
  _action?: 'insert' | 'update' | 'skip' | 'price_update';
  _priceChanged?: boolean;
}

interface ImportSummary {
  total: number;
  inserted: number;
  updated: number;
  priceUpdated: number;
  skipped: number;
  errors: number;
  skippedNames: string[];
  errorNames: string[];
}

interface ExcelImportModalProps {
  onClose: () => void;
}

// ─── Column detection ────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  barcode: ['codigo_barras','codigo barras','código barras','código_barras','barcode','cod_barras','codbarras','codigo','código','ean','upc','cod barras','codigobarras','cod.barras','c.barras'],
  commercialName: ['nombre_comercial','nombre comercial','nombre','name','producto','medicamento','descripcion_producto','nom_comercial','nomcomercial','comercial','product name','item','articulo','artículo'],
  genericName: ['nombre_generico','nombre generico','nombre genérico','nombre_genérico','generico','genérico','generic','generic name','genericname','nom_generico','principio_activo','principio activo'],
  lab: ['laboratorio','lab','laboratory','fabricante','marca','brand','manufacturer'],
  presentation: ['presentacion','presentación','presentation','forma','forma_farmaceutica','forma farmaceutica','unidad','contenido','dosis','dose','formato'],
  price: ['precio','price','precio_venta','precio venta','pvp','valor','importe','monto','precio_unitario','precio unitario','p.venta','p_venta','venta'],
  purchaseCost: ['precio_compra','precio compra','costo','cost','costo_unitario','costo unitario','precio_costo','p.compra','compra'],
  itbis: ['itbis','iva','tax','impuesto','aplica_itbis','aplica itbis','con_itbis','itbis_aplicable','gravado','exento'],
  stock: ['stock','cantidad','qty','quantity','existencia','existencias','inventario','inventory','unidades','units','disponible','cant','stock_actual','stock actual'],
  expiryDate: ['fecha_vencimiento','fecha vencimiento','vencimiento','expiry','expiry_date','expiry date','fecha_exp','fecha exp','exp','vence','fecha_caducidad','fecha caducidad','caducidad','expiration','fec_venc','f.venc','f_venc'],
  descripcion: ['descripcion','descripción','description','detalle','notas','notes','indicaciones','uso','observaciones','info','informacion','información'],
  estante: ['estante','ubicacion','ubicación','location','shelf','posicion','posición','position','lugar','anaquel','rack','fila'],
};

function detectColumn(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const norm = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normAlias = alias.toLowerCase().replace(/\s+/g, '_');
      const idx = norm.findIndex((h) => h === normAlias || h.includes(normAlias) || normAlias.includes(h));
      if (idx !== -1) { mapping[field] = headers[idx]; break; }
    }
  }
  return mapping;
}

function parseExcelDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(val);
      if (!date) return '';
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
    } catch { return ''; }
  }
  const str = String(val).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) { const [d,m,y] = str.split('/'); return `${y}-${m}-${d}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) { const [d,m,y] = str.split('-'); return `${y}-${m}-${d}`; }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) { const p = str.split('/'); return `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`; }
  return str;
}

function parseNum(val: unknown): number {
  if (!val && val !== 0) return 0;
  return parseFloat(String(val).replace(/[$,\s]/g,'').replace(/[^0-9.]/g,'')) || 0;
}

function parseStock(val: unknown): number {
  if (!val && val !== 0) return 0;
  return parseInt(String(val).replace(/[^0-9]/g,''),10) || 0;
}

function parseItbis(val: unknown): boolean {
  const str = String(val || '').trim().toUpperCase();
  return ['SI','SÍ','YES','1','TRUE','X'].includes(str);
}

// ─── Batch insert (new products only) ────────────────────────────────────────

async function batchInsert(
  rows: ParsedRow[],
  branchIds: string[],
  selectedBranchId: string,
  onProgress: (n: number) => void
): Promise<{ success: number; errors: number; errorNames: string[] }> {
  const CHUNK = 50;
  let success = 0; let errors = 0;
  const errorNames: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const productRows = chunk.map((row) => ({
      id: generateId(),
      nombre: row.commercialName || `Producto ${row._rowIndex}`,
      nombre_generico: row.genericName || '',
      codigo_barra: row.barcode || `AUTO-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      laboratorio: row.lab || '',
      presentacion: row.presentation || '',
      precio_venta: row.price || 0,
      precio_compra: row.purchaseCost || null,
      itbis: row.itbisApplicable ? 0.18 : 0,
      itbis_aplicable: row.itbisApplicable,
      activo: true,
      fecha_vencimiento: row.expiryDate || null,
      tipo: 'medicamento',
      requiere_receta: false,
      estante: row.estante || null,
      descripcion: row.descripcion || null,
      created_at: now(),
    }));

    const { data: inserted, error } = await supabase
      .from('productos_farmacia').insert(productRows).select('id, codigo_barra');

    if (error || !inserted) {
      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const sr = { ...productRows[j], codigo_barra: `${productRows[j].codigo_barra}-${Date.now()}-${j}` };
        const { data: si } = await supabase.from('productos_farmacia').insert([sr]).select('id');
        if (si?.[0]) {
          const pid = si[0].id;
          await supabase.from('stock_farmacia').upsert(
            branchIds.map((bid) => ({ producto_id: pid, sucursal_id: bid, cantidad: bid === selectedBranchId ? row.stock : 0 })),
            { onConflict: 'producto_id,sucursal_id' }
          );
          success++;
        } else { errors++; errorNames.push(row.commercialName); }
      }
    } else {
      const stockRows = inserted.flatMap((ins: { id: string }, idx: number) =>
        branchIds.map((bid) => ({ producto_id: ins.id, sucursal_id: bid, cantidad: bid === selectedBranchId ? chunk[idx].stock : 0 }))
      );
      if (stockRows.length > 0) await supabase.from('stock_farmacia').upsert(stockRows, { onConflict: 'producto_id,sucursal_id' });
      success += inserted.length;
    }

    onProgress(Math.min(i + CHUNK, rows.length));
    await new Promise((r) => setTimeout(r, 50));
  }
  return { success, errors, errorNames };
}

// ─── Update existing product ──────────────────────────────────────────────────

async function updateExisting(
  row: ParsedRow,
  existingId: string,
  branchIds: string[],
  selectedBranchId: string,
  priceOnly: boolean
): Promise<boolean> {
  const updateData = priceOnly
    ? { precio_venta: row.price, precio_compra: row.purchaseCost || null }
    : {
        nombre: row.commercialName,
        nombre_generico: row.genericName || '',
        codigo_barra: row.barcode || undefined,
        laboratorio: row.lab || '',
        presentacion: row.presentation || '',
        precio_venta: row.price,
        precio_compra: row.purchaseCost || null,
        itbis: row.itbisApplicable ? 0.18 : 0,
        itbis_aplicable: row.itbisApplicable,
        fecha_vencimiento: row.expiryDate || null,
        estante: row.estante || null,
        descripcion: row.descripcion || null,
      };

  const { error } = await supabase.from('productos_farmacia').update(updateData).eq('id', existingId);
  if (error) return false;

  if (!priceOnly) {
    await supabase.from('stock_farmacia').upsert(
      branchIds.map((bid) => ({ producto_id: existingId, sucursal_id: bid, cantidad: bid === selectedBranchId ? row.stock : 0 })),
      { onConflict: 'producto_id,sucursal_id' }
    );
  }
  return true;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ExcelImportModal({ onClose }: ExcelImportModalProps) {
  const { loadFromSupabase } = usePOSStore();
  const { branches } = useAuthStore();
  const activeBranches = branches.filter((b) => b.isActive);

  // Steps: upload → config → verify → importing → done
  const [step, setStep] = useState<'upload' | 'config' | 'verify' | 'importing' | 'done'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranches[0]?.id || '');
  const [importMode, setImportMode] = useState<ImportMode>('skip_duplicates');
  const [autoUpdatePrices, setAutoUpdatePrices] = useState(true);
  const [showWarningsOnly, setShowWarningsOnly] = useState(false);

  // Verify step
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verifiedRows, setVerifiedRows] = useState<ParsedRow[]>([]);
  const [verifyDone, setVerifyDone] = useState(false);

  // Import step
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  // Done step
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // Review one by one
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDecisions, setReviewDecisions] = useState<Map<number, 'replace' | 'skip'>>(new Map());

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse file ──────────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (raw.length === 0) return;

      const headers = Object.keys(raw[0]);
      const mapping = detectColumn(headers);
      setDetectedHeaders(headers);
      setColumnMapping(mapping);

      const parsed: ParsedRow[] = raw.map((row, i) => {
        const get = (field: string): unknown => mapping[field] ? row[mapping[field]] : '';
        const warnings: string[] = [];
        const barcode = String(get('barcode') || '').trim();
        const commercialName = String(get('commercialName') || '').trim();
        const price = parseNum(get('price'));
        const expiryDate = parseExcelDate(get('expiryDate'));

        if (!barcode) warnings.push('Sin código de barras (se generará automático)');
        if (!commercialName) warnings.push('Sin nombre comercial');
        if (price <= 0) warnings.push('Precio no detectado o es 0');
        if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) warnings.push('Fecha de vencimiento inválida');

        return {
          barcode,
          commercialName,
          genericName: String(get('genericName') || '').trim(),
          lab: String(get('lab') || '').trim(),
          presentation: String(get('presentation') || '').trim(),
          price,
          purchaseCost: parseNum(get('purchaseCost')),
          itbisApplicable: parseItbis(get('itbis')),
          stock: parseStock(get('stock')),
          expiryDate,
          descripcion: String(get('descripcion') || '').trim(),
          estante: String(get('estante') || '').trim(),
          _warnings: warnings,
          _rowIndex: i + 2,
        };
      });

      setRows(parsed);
      setFileName(file.name);
      setStep('config');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  };

  // ── Verify step ─────────────────────────────────────────────────────────────
  const handleStartVerify = async () => {
    setStep('verify');
    setVerifyProgress(0);
    setVerifyDone(false);
    const result: ParsedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dup = await checkDuplicateProduct({
        barcode: row.barcode,
        commercialName: row.commercialName,
        presentation: row.presentation,
        genericName: row.genericName,
      });

      let action: ParsedRow['_action'] = 'insert';
      let priceChanged = false;

      if (dup.isDuplicate) {
        const existing = dup.existingProduct;
        priceChanged = !!(existing && Math.abs(existing.price - row.price) > 0.001);

        if (importMode === 'skip_duplicates') {
          action = autoUpdatePrices && priceChanged ? 'price_update' : 'skip';
        } else if (importMode === 'replace_all') {
          action = 'update';
        } else {
          action = 'skip'; // will be decided in review
        }
      }

      result.push({ ...row, _duplicateInfo: dup.isDuplicate ? dup : undefined, _action: action, _priceChanged: priceChanged });
      setVerifyProgress(i + 1);
      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 80));
    }

    setVerifiedRows(result);
    setVerifyDone(true);

    if (importMode !== 'review_one_by_one') {
      await doImport(result);
    }
    // review mode waits for user decisions
  };

  // ── Review one-by-one ────────────────────────────────────────────────────────
  const duplicatesToReview = verifiedRows.filter((r) => r._duplicateInfo);

  const handleReviewDecision = async (action: 'replace' | 'skip') => {
    const next = new Map(reviewDecisions);
    next.set(reviewIndex, action);
    setReviewDecisions(next);

    if (reviewIndex + 1 < duplicatesToReview.length) {
      setReviewIndex(reviewIndex + 1);
    } else {
      // All reviewed — build final rows
      const finalRows = verifiedRows.map((row) => {
        if (!row._duplicateInfo) return row;
        const origIdx = duplicatesToReview.findIndex((d) => d._rowIndex === row._rowIndex);
        const decision = next.get(origIdx);
        return { ...row, _action: (decision === 'replace' ? 'update' : 'skip') as ParsedRow['_action'] };
      });
      await doImport(finalRows);
    }
  };

  // ── Do actual import ─────────────────────────────────────────────────────────
  const doImport = async (rowsToProcess: ParsedRow[]) => {
    setStep('importing');
    const branchIds = activeBranches.map((b) => b.id);
    const toInsert = rowsToProcess.filter((r) => r._action === 'insert');
    const toUpdate = rowsToProcess.filter((r) => r._action === 'update');
    const toPriceUpdate = rowsToProcess.filter((r) => r._action === 'price_update');
    const toSkip = rowsToProcess.filter((r) => r._action === 'skip');

    const total = toInsert.length + toUpdate.length + toPriceUpdate.length;
    setImportTotal(total || 1);
    setImportProgress(0);

    let inserted = 0; let updated = 0; let priceUpdated = 0; let errors = 0;
    const errorNames: string[] = [];
    const skippedNames = toSkip.map((r) => r.commercialName).filter(Boolean);

    // 1. Insert new products
    if (toInsert.length > 0) {
      const res = await batchInsert(toInsert, branchIds, selectedBranchId, (n) => setImportProgress(n));
      inserted = res.success;
      errors += res.errors;
      errorNames.push(...res.errorNames);
    }

    // 2. Full updates
    for (const row of toUpdate) {
      const existingId = row._duplicateInfo?.existingProduct?.id;
      if (!existingId) { errors++; errorNames.push(row.commercialName); continue; }
      const ok = await updateExisting(row, existingId, branchIds, selectedBranchId, false);
      if (ok) updated++; else { errors++; errorNames.push(row.commercialName); }
      setImportProgress(toInsert.length + updated + priceUpdated);
      await new Promise((r) => setTimeout(r, 20));
    }

    // 3. Price-only updates
    for (const row of toPriceUpdate) {
      const existingId = row._duplicateInfo?.existingProduct?.id;
      if (!existingId) continue;
      const ok = await updateExisting(row, existingId, branchIds, selectedBranchId, true);
      if (ok) priceUpdated++;
      setImportProgress(toInsert.length + updated + priceUpdated);
      await new Promise((r) => setTimeout(r, 20));
    }

    await loadFromSupabase();

    setSummary({
      total: rowsToProcess.length,
      inserted,
      updated,
      priceUpdated,
      skipped: toSkip.length,
      errors,
      skippedNames,
      errorNames,
    });
    setStep('done');
  };

  // ── Download report ──────────────────────────────────────────────────────────
  const downloadReport = () => {
    if (!summary) return;
    const reportData = [
      { 'Resultado': 'Nuevos insertados', 'Cantidad': summary.inserted },
      { 'Resultado': 'Actualizados (reemplazados)', 'Cantidad': summary.updated },
      { 'Resultado': 'Precio actualizado automáticamente', 'Cantidad': summary.priceUpdated },
      { 'Resultado': 'Omitidos (duplicados)', 'Cantidad': summary.skipped },
      { 'Resultado': 'Errores', 'Cantidad': summary.errors },
      { 'Resultado': 'TOTAL procesados', 'Cantidad': summary.total },
    ];
    const skippedData = summary.skippedNames.map((n) => ({ 'Producto omitido': n }));
    const errorData = summary.errorNames.map((n) => ({ 'Producto con error': n }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData), 'Resumen');
    if (skippedData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skippedData), 'Omitidos');
    if (errorData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(errorData), 'Errores');
    XLSX.writeFile(wb, `reporte_importacion_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const template = [{
      'Código Barras': '7890001234567', 'Nombre Comercial': 'Amoxicilina 500mg',
      'Nombre Genérico': 'Amoxicilina', 'Laboratorio': 'MK Pharma',
      'Presentación': 'Cápsulas x30', 'Precio': '250.00', 'Precio Compra': '180.00',
      'ITBIS': 'NO', 'Stock': '100', 'Fecha Vencimiento': '2026-12-31',
      'Descripción': 'Antibiótico de amplio espectro', 'Estante': 'A1',
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    ws['!cols'] = Object.keys(template[0]).map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'plantilla_productos_genosan.xlsx');
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const warningCount = rows.filter((r) => r._warnings.length > 0).length;
  const displayRows = showWarningsOnly ? rows.filter((r) => r._warnings.length > 0) : rows;
  const mappedFields = Object.keys(columnMapping);
  const unmappedRequired = ['barcode', 'commercialName', 'price'].filter((f) => !mappedFields.includes(f));
  const verifyPct = rows.length > 0 ? Math.round((verifyProgress / rows.length) * 100) : 0;
  const importPct = importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0;

  // Verify summary counts (before import)
  const verifyNewCount = verifiedRows.filter((r) => r._action === 'insert').length;
  const verifyUpdateCount = verifiedRows.filter((r) => r._action === 'update').length;
  const verifyPriceUpdateCount = verifiedRows.filter((r) => r._action === 'price_update').length;
  const verifySkipCount = verifiedRows.filter((r) => r._action === 'skip').length;
  const verifyDupCount = verifiedRows.filter((r) => r._duplicateInfo).length;

  const STEP_LABELS = ['Cargar', 'Configurar', 'Verificar', 'Importar', 'Listo'];
  const STEP_KEYS = ['upload', 'config', 'verify', 'importing', 'done'];
  const currentStepIdx = STEP_KEYS.indexOf(step);

  const currentReviewItem = duplicatesToReview[reviewIndex];
  const currentReviewExisting = currentReviewItem?._duplicateInfo?.existingProduct;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">Importar Productos desde Excel / CSV</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Detección automática · Anti-duplicados · Actualización de precios</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step bar */}
        <div className="px-6 pt-4 flex items-center gap-1.5 flex-shrink-0">
          {STEP_LABELS.map((label, idx) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                idx === currentStepIdx ? 'bg-emerald-600 text-white'
                : idx < currentStepIdx ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
              }`}>
                {idx < currentStepIdx && <CheckCircle className="w-3 h-3" />}
                {idx + 1}. {label}
              </div>
              {idx < STEP_LABELS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-300 text-sm">Importación inteligente con anti-duplicados</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Detecta columnas automáticamente. Verifica duplicados antes de insertar. Actualiza precios automáticamente si cambian.
                  </p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer whitespace-nowrap">
                  <Download className="w-4 h-4" /> Plantilla
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 scale-[1.01]' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Arrastra tu archivo o haz clic para seleccionar</p>
                <p className="text-sm text-slate-400 mt-1">Formatos: .xlsx, .xls, .csv — Sin límite de productos</p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Columnas detectadas automáticamente</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { label: 'Código de barras', ex: 'codigo_barras, barcode, ean', req: true },
                    { label: 'Nombre comercial', ex: 'nombre, nombre_comercial, producto', req: true },
                    { label: 'Precio venta', ex: 'precio, price, pvp, valor', req: true },
                    { label: 'Precio compra', ex: 'precio_compra, costo, cost', req: false },
                    { label: 'Nombre genérico', ex: 'generico, principio_activo', req: false },
                    { label: 'Laboratorio', ex: 'laboratorio, lab, fabricante', req: false },
                    { label: 'Presentación', ex: 'presentacion, forma, dosis', req: false },
                    { label: 'ITBIS', ex: 'itbis, iva, impuesto (SI/NO)', req: false },
                    { label: 'Stock', ex: 'stock, cantidad, existencia', req: false },
                    { label: 'Fecha vencimiento', ex: 'vencimiento, expiry, caducidad', req: false },
                    { label: 'Estante/Ubicación', ex: 'estante, ubicacion, shelf', req: false },
                    { label: 'Descripción', ex: 'descripcion, indicaciones, notas', req: false },
                  ].map((col) => (
                    <div key={col.label} className="flex items-start gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${col.req ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{col.label} {col.req && <span className="text-emerald-600">*</span>}</p>
                        <p className="text-xs text-slate-400">{col.ex}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Config ── */}
          {step === 'config' && (
            <div className="space-y-5">
              {/* File summary */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <FileSpreadsheet className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">{fileName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{rows.length} filas · {detectedHeaders.length} columnas detectadas</p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{rows.length} productos</span>
                </div>
              </div>

              {/* Column mapping */}
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">Columnas detectadas en tu archivo:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(columnMapping).map(([field, col]) => {
                    const labels: Record<string, string> = { barcode: 'Código', commercialName: 'Nombre', genericName: 'Genérico', lab: 'Lab', presentation: 'Presentación', price: 'Precio', purchaseCost: 'P.Compra', itbis: 'ITBIS', stock: 'Stock', expiryDate: 'Vencimiento', descripcion: 'Descripción', estante: 'Estante' };
                    return (
                      <span key={field} className="flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs">
                        <CheckCircle className="w-3 h-3" />
                        {labels[field] || field}: <span className="font-mono">{col}</span>
                      </span>
                    );
                  })}
                  {unmappedRequired.map((f) => {
                    const labels: Record<string, string> = { barcode: 'Código', commercialName: 'Nombre', price: 'Precio' };
                    return (
                      <span key={f} className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {labels[f]} no detectado
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Import mode */}
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                  <i className="ri-settings-3-line mr-1.5"></i>
                  Modo de importación para duplicados
                </p>
                <div className="space-y-2">
                  {([
                    { id: 'skip_duplicates', icon: 'ri-shield-check-line', label: 'Solo agregar nuevos (recomendado)', desc: 'Los productos que ya existen se omiten automáticamente. Base de datos limpia sin duplicados innecesarios.', color: 'emerald' },
                    { id: 'replace_all', icon: 'ri-refresh-line', label: 'Reemplazar existentes', desc: 'Actualiza todos los datos de los productos que ya existen con los valores del archivo.', color: 'amber' },
                    { id: 'review_one_by_one', icon: 'ri-list-check', label: 'Revisar manualmente', desc: 'Tú decides qué hacer con cada duplicado encontrado.', color: 'slate' },
                  ] as const).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        importMode === opt.id
                          ? opt.color === 'emerald' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : opt.color === 'amber' ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-400 bg-slate-100 dark:bg-slate-700/50'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <input type="radio" name="importMode" value={opt.id} checked={importMode === opt.id} onChange={() => setImportMode(opt.id)} className="sr-only" />
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                        importMode === opt.id
                          ? opt.color === 'emerald' ? 'border-emerald-500 bg-emerald-500' : opt.color === 'amber' ? 'border-amber-500 bg-amber-500' : 'border-slate-500 bg-slate-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {importMode === opt.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <i className={`${opt.icon} ${opt.color === 'emerald' ? 'text-emerald-600' : opt.color === 'amber' ? 'text-amber-600' : 'text-slate-500'} text-base`}></i>
                          <p className="font-semibold text-slate-800 dark:text-white text-sm">{opt.label}</p>
                          {opt.id === 'skip_duplicates' && <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full font-medium">✓ Por defecto</span>}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Auto update prices option */}
              {importMode === 'skip_duplicates' && (
                <div
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-emerald-300 transition-colors"
                  onClick={() => setAutoUpdatePrices(!autoUpdatePrices)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 mt-0.5 ${autoUpdatePrices ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${autoUpdatePrices ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">
                        Actualizar precios automáticamente si cambian
                        <span className="ml-2 text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full font-medium">ERP</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Si el producto existe pero el precio es diferente, solo se actualiza el precio. El historial y el ID se mantienen intactos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Branch + warnings */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">Asignar stock a:</label>
                  <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                    {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                {warningCount > 0 && (
                  <button onClick={() => setShowWarningsOnly(!showWarningsOnly)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer ${showWarningsOnly ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-700'}`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    {warningCount} filas con advertencias {showWarningsOnly ? '(ocultando resto)' : '(ver)'}
                  </button>
                )}
              </div>

              {/* Preview table - show ALL rows without 200 limit */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr>
                      {['#','','Código','Nombre Comercial','Genérico','Lab.','Precio','Costo','ITBIS','Stock','Vence'].map((h) => (
                        <th key={h} className="text-left p-2.5 text-slate-500 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr key={row._rowIndex} className={`border-t border-slate-100 dark:border-slate-700 ${row._warnings.length > 0 ? 'bg-amber-50/40 dark:bg-amber-900/5' : ''}`}>
                        <td className="p-2.5 text-slate-400">{row._rowIndex}</td>
                        <td className="p-2.5">
                          {row._warnings.length === 0 ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : (
                            <div className="group relative">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                              <div className="absolute left-0 top-6 z-10 bg-amber-700 text-white text-xs rounded-lg p-2 shadow-lg min-w-[200px] hidden group-hover:block">
                                {row._warnings.map((w, i) => <p key={i}>• {w}</p>)}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300 max-w-[90px] truncate">{row.barcode || <span className="text-amber-400 italic">auto</span>}</td>
                        <td className="p-2.5 font-medium text-slate-800 dark:text-white max-w-[150px] truncate">{row.commercialName || <span className="text-amber-400 italic">sin nombre</span>}</td>
                        <td className="p-2.5 text-slate-500 max-w-[100px] truncate">{row.genericName}</td>
                        <td className="p-2.5 text-slate-500 max-w-[70px] truncate">{row.lab}</td>
                        <td className="p-2.5 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.price > 0 ? formatCurrency(row.price) : <span className="text-amber-400">RD$0</span>}</td>
                        <td className="p-2.5 font-mono text-slate-500 whitespace-nowrap">{row.purchaseCost > 0 ? formatCurrency(row.purchaseCost) : <span className="text-slate-300">—</span>}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${row.itbisApplicable ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{row.itbisApplicable ? 'Sí' : 'No'}</span>
                        </td>
                        <td className="p-2.5 text-center text-slate-500">{row.stock}</td>
                        <td className="p-2.5 font-mono text-slate-500 whitespace-nowrap">{row.expiryDate || <span className="text-amber-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP 3: Verify ── */}
          {step === 'verify' && (
            <div className="space-y-6">
              {!verifyDone ? (
                <div className="flex flex-col items-center justify-center py-16 gap-6">
                  <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                    <Loader className="w-10 h-10 text-amber-500 animate-spin" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-white">Verificando duplicados...</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{verifyProgress} de {rows.length} productos comparados con la base de datos</p>
                  </div>
                  <div className="w-full max-w-md">
                    <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Progreso</span><span>{verifyPct}%</span></div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                      <div className="bg-amber-500 h-3 rounded-full transition-all duration-300" style={{ width: `${verifyPct}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">No cierres esta ventana...</p>
                </div>
              ) : importMode === 'review_one_by_one' && duplicatesToReview.length > 0 && reviewIndex < duplicatesToReview.length ? (
                /* ── Review one by one ── */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">Revisando duplicado {reviewIndex + 1} de {duplicatesToReview.length}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{verifyNewCount} nuevos esperando · {verifySkipCount + reviewIndex} omitidos hasta ahora</p>
                    </div>
                    <div className="flex gap-1">
                      {duplicatesToReview.map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${i < reviewIndex ? 'bg-emerald-400' : i === reviewIndex ? 'bg-amber-400' : 'bg-slate-200'}`}></div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-3">Del archivo (nuevo)</p>
                      <p className="font-semibold text-slate-800 dark:text-white">{currentReviewItem?.commercialName}</p>
                      {currentReviewItem?.genericName && <p className="text-xs text-slate-500">{currentReviewItem.genericName}</p>}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-xs"><span className="text-slate-400">Código:</span><span className="font-mono text-slate-600 dark:text-slate-300">{currentReviewItem?.barcode || '—'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-400">Precio:</span><span className={`font-mono font-semibold ${currentReviewItem?._priceChanged ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>{formatCurrency(currentReviewItem?.price || 0)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-400">Costo:</span><span className="font-mono text-slate-600 dark:text-slate-300">{currentReviewItem?.purchaseCost ? formatCurrency(currentReviewItem.purchaseCost) : '—'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-400">Stock:</span><span className="text-slate-600 dark:text-slate-300">{currentReviewItem?.stock}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-400">Vence:</span><span className="font-mono text-slate-600 dark:text-slate-300">{currentReviewItem?.expiryDate || '—'}</span></div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Existente en sistema</p>
                      {currentReviewExisting ? (
                        <>
                          <p className="font-semibold text-slate-800 dark:text-white">{currentReviewExisting.commercialName}</p>
                          {currentReviewExisting.genericName && <p className="text-xs text-slate-500">{currentReviewExisting.genericName}</p>}
                          <div className="mt-3 space-y-1.5">
                            <div className="flex justify-between text-xs"><span className="text-slate-400">Código:</span><span className="font-mono text-slate-600 dark:text-slate-300">{currentReviewExisting.barcode || '—'}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-slate-400">Precio:</span><span className={`font-mono font-semibold ${currentReviewItem?._priceChanged ? 'text-red-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{formatCurrency(currentReviewExisting.price)}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-slate-400">Costo:</span><span className="font-mono text-slate-600 dark:text-slate-300">{currentReviewExisting.purchaseCost ? formatCurrency(currentReviewExisting.purchaseCost) : '—'}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-slate-400">Stock:</span><span className="text-slate-600 dark:text-slate-300">{Object.values(currentReviewExisting.stock).reduce((a, b) => a + b, 0)}</span></div>
                          </div>
                        </>
                      ) : <p className="text-xs text-slate-400">No disponible</p>}
                    </div>
                  </div>

                  {currentReviewItem?._priceChanged && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                      <i className="ri-price-tag-3-line text-base"></i>
                      <strong>Precio cambió:</strong> {formatCurrency(currentReviewExisting?.price || 0)} → {formatCurrency(currentReviewItem.price)}
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs text-slate-500 border border-slate-200 dark:border-slate-700">
                    <i className="ri-information-line mr-1"></i>
                    Coincide por: <strong>{currentReviewItem?._duplicateInfo?.matchType === 'barcode' ? 'Código de barras' : currentReviewItem?._duplicateInfo?.matchType === 'commercial_name' ? 'Nombre comercial y presentación' : 'Nombre genérico'}</strong>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleReviewDecision('replace')} className="flex items-center justify-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 hover:border-emerald-500 cursor-pointer transition-all">
                      <i className="ri-refresh-line text-emerald-600 text-xl"></i>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Reemplazar</p>
                        <p className="text-xs text-emerald-600/70 dark:text-emerald-500">Actualiza con datos nuevos</p>
                      </div>
                    </button>
                    <button onClick={() => handleReviewDecision('skip')} className="flex items-center justify-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-slate-400 cursor-pointer transition-all">
                      <i className="ri-skip-forward-line text-slate-500 text-xl"></i>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Omitir</p>
                        <p className="text-xs text-slate-400">Mantiene el existente</p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                /* Review done or no duplicates — show verify summary before import */
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Verificación completada</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg">
                    {[
                      { label: 'Nuevos', value: verifyNewCount, color: 'emerald' },
                      { label: 'Actualizar', value: verifyUpdateCount, color: 'amber' },
                      { label: 'Precio', value: verifyPriceUpdateCount, color: 'sky' },
                      { label: 'Omitir', value: verifySkipCount, color: 'slate' },
                    ].map((item) => (
                      <div key={item.label} className={`text-center p-3 rounded-xl border ${item.color === 'emerald' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : item.color === 'amber' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : item.color === 'sky' ? 'bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700'}`}>
                        <p className={`text-2xl font-bold ${item.color === 'emerald' ? 'text-emerald-600' : item.color === 'amber' ? 'text-amber-600' : item.color === 'sky' ? 'text-sky-600' : 'text-slate-500'}`}>{item.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-500 text-center max-w-sm">Listo para importar. Haz clic en el botón de abajo para comenzar.</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <Loader className="w-10 h-10 text-emerald-600 animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-white">Importando productos...</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{importProgress} de {importTotal} productos procesados</p>
              </div>
              <div className="w-full max-w-md">
                <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Progreso</span><span>{importPct}%</span></div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                  <div className="bg-emerald-500 h-3 rounded-full transition-all duration-300" style={{ width: `${importPct}%` }} />
                </div>
              </div>
              <p className="text-xs text-slate-400">No cierres esta ventana hasta que termine</p>
            </div>
          )}

          {/* ── STEP 5: Done ── */}
          {step === 'done' && summary && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-9 h-9 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white">¡Importación completada!</h3>
              </div>

              {/* Summary message */}
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
                <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                  Se importaron <strong>{summary.inserted + summary.updated + summary.priceUpdated}</strong> productos correctamente.
                  {summary.skipped > 0 && <> <strong>{summary.skipped}</strong> fueron omitidos porque ya existen en el sistema.</>}
                  {summary.errors > 0 && <> <strong className="text-red-600">{summary.errors}</strong> no pudieron procesarse.</>}
                </p>
              </div>

              {/* Grid cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total archivo', value: summary.total, color: 'slate', icon: 'ri-file-list-3-line' },
                  { label: 'Nuevos inserados', value: summary.inserted, color: 'emerald', icon: 'ri-add-circle-fill' },
                  { label: 'Actualizados', value: summary.updated, color: 'amber', icon: 'ri-refresh-line' },
                  { label: 'Precio actualizado', value: summary.priceUpdated, color: 'sky', icon: 'ri-price-tag-3-fill' },
                  { label: 'Omitidos', value: summary.skipped, color: 'slate', icon: 'ri-skip-forward-fill' },
                ].map((c) => (
                  <div key={c.label} className={`text-center p-4 rounded-xl border ${c.color === 'emerald' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800' : c.color === 'amber' ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : c.color === 'sky' ? 'bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700'}`}>
                    <i className={`${c.icon} text-xl mb-1 block ${c.color === 'emerald' ? 'text-emerald-500' : c.color === 'amber' ? 'text-amber-500' : c.color === 'sky' ? 'text-sky-500' : 'text-slate-400'}`}></i>
                    <p className={`text-2xl font-bold ${c.color === 'emerald' ? 'text-emerald-600' : c.color === 'amber' ? 'text-amber-600' : c.color === 'sky' ? 'text-sky-600' : 'text-slate-500'}`}>{c.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-tight">{c.label}</p>
                  </div>
                ))}
              </div>

              {summary.errors > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">{summary.errors} productos con error:</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.errorNames.slice(0, 20).map((n, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs">{n}</span>
                    ))}
                    {summary.errorNames.length > 20 && <span className="text-xs text-red-500">+{summary.errorNames.length - 20} más</span>}
                  </div>
                </div>
              )}

              {summary.skipped > 0 && summary.skippedNames.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Productos omitidos (ya existían):</p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {summary.skippedNames.slice(0, 30).map((n, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs">{n}</span>
                    ))}
                    {summary.skippedNames.length > 30 && <span className="text-xs text-slate-400">+{summary.skippedNames.length - 30} más</span>}
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center gap-3">
                <i className="ri-store-2-line text-slate-400 text-lg"></i>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stock asignado a: <span className="font-semibold text-slate-700 dark:text-slate-200">{activeBranches.find((b) => b.id === selectedBranchId)?.name}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {step === 'config' && `${rows.length} filas · ${detectedHeaders.length} columnas`}
          </div>
          <div className="flex gap-2">
            {(step === 'upload' || step === 'config') && (
              <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm cursor-pointer whitespace-nowrap">
                Cancelar
              </button>
            )}

            {step === 'upload' && (
              <button onClick={downloadTemplate} className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg flex items-center gap-2 text-sm hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                <Download className="w-4 h-4" /> Plantilla Excel
              </button>
            )}

            {step === 'config' && (
              <>
                <button onClick={() => { setStep('upload'); setRows([]); setFileName(''); }} className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  Cargar otro archivo
                </button>
                <button
                  onClick={handleStartVerify}
                  disabled={rows.length === 0}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-shield-check-line"></i>
                  Verificar e importar {rows.length} productos
                </button>
              </>
            )}

            {step === 'verify' && verifyDone && importMode === 'review_one_by_one' && reviewIndex >= duplicatesToReview.length && (
              <button onClick={() => doImport(verifiedRows)} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <i className="ri-upload-cloud-line"></i>
                Iniciar importación
              </button>
            )}

            {step === 'verify' && verifyDone && importMode !== 'review_one_by_one' && (
              <button onClick={() => doImport(verifiedRows)} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <i className="ri-upload-cloud-line"></i>
                Iniciar importación ({verifyNewCount + verifyUpdateCount + verifyPriceUpdateCount} productos)
              </button>
            )}

            {step === 'done' && (
              <>
                {(summary?.skipped || 0) + (summary?.errors || 0) > 0 && (
                  <button onClick={downloadReport} className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg flex items-center gap-2 text-sm hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                    <Download className="w-4 h-4" /> Descargar reporte
                  </button>
                )}
                <button onClick={onClose} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer whitespace-nowrap">
                  Cerrar y ver productos
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
