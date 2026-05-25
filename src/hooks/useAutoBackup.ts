import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

const PAGE_SIZE = 1000;

async function exportProductsToExcel(): Promise<boolean> {
  try {
    let allProducts: Record<string, unknown>[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('productos_farmacia')
        .select('*')
        .order('nombre')
        .range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
      }
      if (!data || data.length < PAGE_SIZE) hasMore = false;
      else from += PAGE_SIZE;
    }

    // Fetch stock
    let allStocks: Record<string, unknown>[] = [];
    let stockFrom = 0;
    let hasMoreStock = true;
    while (hasMoreStock) {
      const { data } = await supabase
        .from('stock_farmacia')
        .select('producto_id, sucursal_id, cantidad')
        .range(stockFrom, stockFrom + PAGE_SIZE - 1);
      if (data && data.length > 0) allStocks = allStocks.concat(data);
      if (!data || data.length < PAGE_SIZE) hasMoreStock = false;
      else stockFrom += PAGE_SIZE;
    }

    const stockMap: Record<string, Record<string, number>> = {};
    allStocks.forEach((s: Record<string, unknown>) => {
      const pid = s.producto_id as string;
      const bid = s.sucursal_id as string;
      if (!pid || !bid) return;
      if (!stockMap[pid]) stockMap[pid] = {};
      stockMap[pid][bid] = Number(s.cantidad) || 0;
    });

    const { data: branches } = await supabase.from('branches').select('id, name');
    const branchNames: Record<string, string> = {};
    (branches || []).forEach((b: Record<string, unknown>) => {
      branchNames[b.id as string] = (b.name as string) || (b.id as string);
    });

    const rows = allProducts.map((p: Record<string, unknown>) => {
      const pid = p.id as string;
      const stock = stockMap[pid] || {};
      const stockCols: Record<string, string | number> = {};
      Object.entries(stock).forEach(([bid, qty]) => {
        const bname = branchNames[bid] || bid;
        stockCols[`Stock_${bname.replace(/\s+/g, '_')}`] = qty;
      });

      return {
        ID: pid,
        'Codigo_Barra': p.codigo_barra || '',
        'Nombre_Comercial': p.nombre || '',
        'Nombre_Generico': p.nombre_generico || '',
        Laboratorio: p.laboratorio || '',
        Presentacion: p.presentacion || '',
        'Precio_Venta': p.precio_venta || 0,
        'Precio_Compra': p.precio_compra || '',
        ITBIS: p.itbis_aplicable ? 'Si' : 'No',
        'Stock_Total': Object.values(stock).reduce((a: number, b: number) => a + b, 0),
        ...stockCols,
        Estante: p.estante || '',
        Posicion: p.posicion || '',
        'Fecha_Vencimiento': p.fecha_vencimiento || '',
        Descripcion: p.descripcion || '',
        Activo: p.activo ? 'Si' : 'No',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, `auto_backup_productos_${new Date().toISOString().slice(0, 10)}_${new Date().toTimeString().slice(0, 5).replace(':', '')}.xlsx`);
    return true;
  } catch (err) {
    console.error('[AutoBackup] Error exporting products:', err);
    return false;
  }
}

function shouldRunBackup(lastDate: string | null, frequency: 'daily' | 'weekly'): boolean {
  if (!lastDate) return true;
  const last = new Date(lastDate);
  const now = new Date();
  const diffMs = now.getTime() - last.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (frequency === 'daily') return diffHours >= 24;
  return diffHours >= 24 * 7;
}

export function useAutoBackup() {
  const { backupSettings, updateBackupSettings } = useAppStore();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!backupSettings.enabled) return;

    const check = async () => {
      if (runningRef.current) return;
      if (!shouldRunBackup(backupSettings.lastBackupDate, backupSettings.frequency)) return;

      runningRef.current = true;
      const success = await exportProductsToExcel();
      runningRef.current = false;

      if (success) {
        updateBackupSettings({ lastBackupDate: new Date().toISOString() });
      }
    };

    // Check immediately on mount
    check();

    // Then every 10 minutes
    const interval = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [backupSettings.enabled, backupSettings.frequency, backupSettings.lastBackupDate, updateBackupSettings]);
}