/**
 * printService.ts
 * Impresión automática directa a impresora predeterminada.
 * Compatible con impresoras térmicas (58mm / 80mm) y convencionales (A4).
 *
 * ESTRATEGIA DE IMPRESIÓN (en orden de prioridad):
 * 1. Electron printHTML — imprime HTML directo SIN DIÁLOGO a impresora seleccionada
 * 2. Electron print — imprime iframe actual sin diálogo
 * 3. WebView2 postMessage — envía HTML al host nativo
 * 4. Tauri print — usa plugin de impresión nativa
 * 5. Fallback iframe + window.print() — abre diálogo del navegador (último recurso)
 *
 * Para EVITAR el diálogo "Guardar como", configurá el bridge nativo
 * en tu proceso principal de Electron (ver ELECTRON_SETUP.md).
 */

function formatCurrencyPrint(amount: number): string {
  return `RD$${amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PrintReceiptData {
  companyName: string;
  branchName: string;
  rnc?: string;
  phone?: string;
  address?: string;
  website?: string;
  logo?: string;
  invoiceHeader?: string;
  invoiceFooter?: string;
  invoiceColor?: string;
  showLogo?: boolean;

  ncf: string;
  numeroFactura?: number;
  facturaId: string;
  fecha: string;
  cajero: string;
  clienteNombre?: string;
  clienteRnc?: string;
  metodoPago: string;

  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineDiscount: number;
  }>;

  subtotal: number;
  itbis: number;
  discountAmount: number;
  globalDiscount: number;
  insuranceCoverage?: number;
  insuranceName?: string;
  total: number;
  cashReceived?: number;
  change?: number;

  printerType?: '58mm' | '80mm' | 'A4';
  fontSize?: 'small' | 'medium' | 'large';
  copies?: number;
}

let isCurrentlyPrinting = false;

/** Cache de impresoras para no consultar repetidamente */
let cachedPrinters: { name: string; isDefault: boolean; status?: number }[] | null = null;
let lastPrinterCheck = 0;

/** Devuelve el bridge nativo disponible, o null si no hay */
function getNativeBridge(): 'electron-html' | 'electron-print' | 'webview2' | 'tauri' | null {
  const w = window as Window & { electronAPI?: { print?: () => void; printHTML?: (html: string, options?: Record<string, unknown>) => Promise<unknown>; getPrinters?: () => Promise<unknown>; checkPrinter?: (name: string) => Promise<unknown> } };
  if (w.electronAPI?.printHTML) return 'electron-html';
  if (w.electronAPI?.print) return 'electron-print';
  if ((window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }).chrome?.webview?.postMessage) return 'webview2';
  if ((window as Window & { __TAURI__?: { print?: (html: string) => Promise<unknown> } }).__TAURI__?.print) return 'tauri';
  return null;
}

/** Detecta si el entorno es Electron con capacidad de impresión nativa */
export function hasElectronBridge(): boolean {
  const w = window as Window & { electronAPI?: { printHTML?: () => void; print?: () => void } };
  return !!(w.electronAPI?.printHTML || w.electronAPI?.print);
}

/**
 * Obtiene la lista de impresoras del sistema.
 * Solo funciona si hay un bridge nativo (Electron) configurado.
 * En navegador puro retorna array vacío.
 */
export async function getSystemPrinters(): Promise<{ name: string; isDefault: boolean; status?: number; description?: string }[]> {
  const bridge = getNativeBridge();
  if (bridge !== 'electron-html' && bridge !== 'electron-print') return [];

  const now = Date.now();
  if (cachedPrinters && now - lastPrinterCheck < 30000) {
    return cachedPrinters;
  }

  try {
    const w = window as Window & { electronAPI?: { getPrinters?: () => Promise<{ name: string; isDefault: boolean; status?: number; description?: string }[]> } };
    const printers = await w.electronAPI?.getPrinters?.();
    if (printers && Array.isArray(printers)) {
      cachedPrinters = printers;
      lastPrinterCheck = now;
      return printers;
    }
  } catch {
    /* silent fail */
  }
  return [];
}

/**
 * Verifica si una impresora específica está conectada.
 * Retorna { connected: true/false, status: 'desconectada' | 'ocupada' | 'lista' | 'error' }
 */
export async function checkPrinterStatus(printerName: string): Promise<{ connected: boolean; status: string }> {
  const bridge = getNativeBridge();
  if (bridge !== 'electron-html' && bridge !== 'electron-print') {
    return { connected: true, status: 'desconocida' }; // En navegador no podemos saber
  }

  if (!printerName) {
    return { connected: true, status: 'predeterminada' };
  }

  try {
    const w = window as Window & { electronAPI?: { checkPrinter?: (name: string) => Promise<{ connected: boolean; status: string }> } };
    const result = await w.electronAPI?.checkPrinter?.(printerName);
    if (result) return result;
  } catch {
    /* silent fail */
  }

  // Fallback: verificar si existe en la lista de impresoras
  try {
    const printers = await getSystemPrinters();
    const found = printers.find((p) => p.name === printerName);
    if (found) {
      return { connected: true, status: 'lista' };
    }
    return { connected: false, status: 'desconectada' };
  } catch {
    return { connected: false, status: 'error' };
  }
}

/** Limpia la cache de impresoras (útil después de cambiar configuración) */
export function clearPrinterCache(): void {
  cachedPrinters = null;
  lastPrinterCheck = 0;
}

function buildReceiptHTML(data: PrintReceiptData): string {
  const color = data.invoiceColor || '#10b981';
  const paperWidth =
    data.printerType === '58mm' ? '58mm' :
    data.printerType === '80mm' ? '80mm' : '210mm';
  const bodyWidth =
    data.printerType === '58mm' ? '54mm' :
    data.printerType === '80mm' ? '76mm' : '190mm';
  const baseFontSize =
    data.fontSize === 'small' ? '9px' :
    data.fontSize === 'large' ? '13px' : '11px';

  const numFactura = data.numeroFactura
    ? String(data.numeroFactura).padStart(10, '0')
    : data.facturaId.slice(0, 10).toUpperCase();

  // Barcode SVG simple (CODE128-like visual)
  const barcodePattern = [2,1,3,1,2,2,1,3,2,1,1,2,3,1,2,1,3,2,1,2,1,1,3,2,1,2,2,1,3,1,2,1,2,3,1,2,1,3,1,2];
  let barsX = 4;
  const bars: string[] = [];
  barcodePattern.forEach((w, i) => {
    if (i % 2 === 0) {
      bars.push(`<rect x="${barsX}" y="0" width="${w * 2.2}" height="32" fill="#000"/>`);
    }
    barsX += w * 2.2;
  });
  const barcodeSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="32" viewBox="0 0 ${barsX + 4} 32">${bars.join('')}</svg>`;

  const itemsHTML = data.items.map((item) => {
    const lineTotal = item.quantity * item.unitPrice * (1 - item.lineDiscount / 100);
    const unitPriceStr = formatCurrencyPrint(item.unitPrice);
    return `
      <tr>
        <td style="padding:1px 0;vertical-align:top;">
          <div style="font-weight:600;word-break:break-word;">${item.name}</div>
          <div style="color:#666;font-size:0.85em;">${item.quantity} x ${unitPriceStr}${item.lineDiscount > 0 ? ` (-${item.lineDiscount}%)` : ''}</div>
        </td>
        <td style="padding:1px 0;text-align:right;vertical-align:top;white-space:nowrap;font-family:'Inter',sans-serif;font-weight:600;">
          ${formatCurrencyPrint(lineTotal)}
        </td>
      </tr>`;
  }).join('');

  const logoHTML = (data.showLogo !== false) && data.logo
    ? `<img src="${data.logo}" alt="Logo" style="max-height:40px;max-width:120px;object-fit:contain;margin-bottom:4px;" /><br/>`
    : '';

  const copies = data.copies || 1;

  const receiptBody = `
    <div class="receipt">
      <div style="text-align:center;border-bottom:3px solid ${color};padding-bottom:8px;margin-bottom:6px;">
        ${logoHTML}
        <div style="font-size:1.35em;font-weight:900;color:${color};letter-spacing:0.05em;line-height:1.2;">
          ${data.branchName.toUpperCase()}
        </div>
        <div style="font-size:0.85em;color:#666;margin-top:2px;">${data.companyName}</div>
        ${data.rnc ? `<div style="font-size:0.85em;color:#555;">RNC: ${data.rnc}</div>` : ''}
        ${data.phone ? `<div style="font-size:0.85em;color:#555;">Tel: ${data.phone}</div>` : ''}
        ${data.address ? `<div style="font-size:0.8em;color:#777;">${data.address}</div>` : ''}
        ${data.invoiceHeader ? `<div style="font-size:0.8em;color:#777;font-style:italic;margin-top:3px;">${data.invoiceHeader}</div>` : ''}
      </div>

      <div style="background:${color}18;padding:5px 6px;margin-bottom:4px;border-radius:3px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;color:${color};letter-spacing:0.08em;">FACTURA</span>
          <span style="font-family:'Inter',sans-serif;font-size:0.9em;">${data.ncf}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:#555;font-size:0.85em;margin-top:2px;">
          <span>${data.fecha}</span>
          <span>Cajero: ${data.cajero}</span>
        </div>
        ${data.clienteNombre ? `<div style="color:#555;font-size:0.85em;">Cliente: ${data.clienteNombre}</div>` : ''}
        ${data.clienteRnc ? `<div style="color:#555;font-size:0.85em;">RNC/Céd: ${data.clienteRnc}</div>` : ''}
      </div>

      <div style="border-top:1px dashed #aaa;margin:5px 0;"></div>

      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div style="border-top:1px dashed #aaa;margin:5px 0;"></div>

      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="color:#666;padding:1px 0;">Subtotal</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;">${formatCurrencyPrint(data.subtotal)}</td>
          </tr>
          ${data.discountAmount > 0 ? `
          <tr>
            <td style="color:#d97706;padding:1px 0;">Descuento (${data.globalDiscount}%)</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;color:#d97706;">-${formatCurrencyPrint(data.discountAmount)}</td>
          </tr>` : ''}
          <tr>
            <td style="color:#666;padding:1px 0;">ITBIS (18%)</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;">${formatCurrencyPrint(data.itbis)}</td>
          </tr>
          ${(data.insuranceCoverage || 0) > 0 ? `
          <tr>
            <td style="color:#0d9488;padding:1px 0;">${data.insuranceName || 'Seguro'}</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;color:#0d9488;">-${formatCurrencyPrint(data.insuranceCoverage || 0)}</td>
          </tr>` : ''}
          <tr style="border-top:1px solid #ddd;">
            <td style="font-weight:900;font-size:1.2em;color:${color};padding-top:3px;">TOTAL</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;font-weight:900;font-size:1.2em;color:${color};padding-top:3px;">${formatCurrencyPrint(data.total)}</td>
          </tr>
          <tr>
            <td style="color:#666;font-size:0.85em;padding:1px 0;">Método de pago</td>
            <td style="text-align:right;font-size:0.85em;text-transform:capitalize;">${data.metodoPago}</td>
          </tr>
          ${(data.cashReceived || 0) > 0 ? `
          <tr>
            <td style="color:#666;font-size:0.85em;padding:1px 0;">Efectivo recibido</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;font-size:0.85em;">${formatCurrencyPrint(data.cashReceived || 0)}</td>
          </tr>` : ''}
          ${(data.change || 0) > 0 ? `
          <tr>
            <td style="color:#666;font-size:0.85em;padding:1px 0;">Vuelto</td>
            <td style="text-align:right;font-family:'Inter',sans-serif;font-size:0.85em;">${formatCurrencyPrint(data.change || 0)}</td>
          </tr>` : ''}
        </tbody>
      </table>

      <div style="border-top:1px dashed #aaa;margin:5px 0;"></div>

      <div style="text-align:center;padding:4px 0;">
        <div style="font-size:0.7em;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">Código de Factura</div>
        <div style="display:inline-block;background:#fff;padding:2px 4px;">
          ${barcodeSVG}
        </div>
        <div style="font-family:'Inter',sans-serif;font-weight:900;font-size:1.1em;letter-spacing:0.15em;margin-top:2px;">${numFactura}</div>
        <div style="font-size:0.75em;color:#999;">N° Factura</div>
      </div>

      <div style="text-align:center;padding:3px 0;">
        <div style="font-size:0.7em;color:#999;text-transform:uppercase;letter-spacing:0.1em;">Comprobante Fiscal (DGII)</div>
        <div style="font-family:'Inter',sans-serif;font-weight:700;color:${color};letter-spacing:0.1em;">${data.ncf}</div>
      </div>

      ${data.invoiceFooter ? `
      <div style="background:${color}15;border-top:1px dashed ${color}60;padding:5px 6px;text-align:center;margin-top:4px;">
        <div style="font-size:0.85em;color:#555;font-style:italic;">${data.invoiceFooter}</div>
      </div>` : ''}

      ${data.website ? `<div style="text-align:center;font-size:0.8em;color:#999;margin-top:4px;">${data.website}</div>` : ''}

      <div style="text-align:center;font-size:0.8em;color:#aaa;margin-top:6px;font-style:italic;">¡Gracias por su compra!</div>
    </div>
  `;

  const allCopies = Array(copies).fill(receiptBody).join(
    `<div style="page-break-after:always;border-top:2px dashed #ccc;margin:8px 0;"></div>`
  );

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura ${data.ncf}</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 3mm 2mm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: 'Inter', 'Sora', sans-serif;
      font-size: ${baseFontSize};
      width: ${bodyWidth};
      color: #000;
      background: #fff;
      font-variant-numeric: normal;
      font-feature-settings: normal;
    }
    .receipt { width: 100%; padding: 2mm 0; }
    table { width: 100%; }
    @media print { body { margin: 0; } .receipt { page-break-inside: avoid; } }
  </style>
</head>
<body>
  ${allCopies}
</body>
</html>`;
}

/**
 * Imprime el recibo usando el mejor bridge nativo disponible.
 * Si no hay bridge nativo, usa iframe oculto como fallback.
 *
 * @param data Datos de la factura a imprimir
 * @param printerName Nombre de impresora específica (opcional). Si vacío, usa predeterminada.
 */
export function printReceipt(data: PrintReceiptData, printerName = '', silent = false): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCurrentlyPrinting) {
      reject(new Error('Ya hay una impresión en curso. Por favor espere.'));
      return;
    }

    try {
      isCurrentlyPrinting = true;
      const html = buildReceiptHTML(data);
      const bridge = getNativeBridge();

      // ===== 1. ELECTRON printHTML (el mejor: sin diálogo, sin iframe, envía HTML directo) =====
      if (bridge === 'electron-html') {
        const api = (window as Window & { electronAPI?: { printHTML?: (html: string, options?: Record<string, unknown>) => Promise<{ success: boolean; error?: string }> } }).electronAPI;
        api!.printHTML!(html, { silent: true, printerName })
          .then((result) => {
            isCurrentlyPrinting = false;
            if (result?.success) {
              incrementTodayPrintCount();
              resolve();
            } else {
              playPrinterErrorSound();
              reject(new Error(result?.error || 'Error de impresión en Electron'));
            }
          })
          .catch((err: Error) => {
            isCurrentlyPrinting = false;
            playPrinterErrorSound();
            reject(err);
          });
        return;
      }

      // ===== 2. ELECTRON print (silencioso si silent=true) =====
      if (bridge === 'electron-print' && silent) {
        const iframe = createHiddenIframe(html);
        const doSilentPrint = () => {
          try {
            const api = (window as Window & { electronAPI?: { print: () => void } }).electronAPI;
            api!.print();
            cleanupIframe(iframe, 1000);
            incrementTodayPrintCount();
            resolve();
          } catch (err) {
            cleanupIframe(iframe, 0);
            playPrinterErrorSound();
            reject(err);
          }
        };

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.readyState === 'complete') {
          doSilentPrint();
        } else {
          iframe.onload = doSilentPrint;
          setTimeout(doSilentPrint, 500);
        }
        return;
      }

      // ===== 3. WEBVIEW2 (Edge WebView2) =====
      if (bridge === 'webview2') {
        try {
          const wv = (window as Window & { chrome?: { webview?: { postMessage: (msg: string) => void } } }).chrome?.webview;
          wv!.postMessage(JSON.stringify({ type: 'PRINT_RECEIPT', html, printerType: data.printerType, printerName }));
          isCurrentlyPrinting = false;
          incrementTodayPrintCount();
          resolve();
        } catch (err) {
          isCurrentlyPrinting = false;
          playPrinterErrorSound();
          reject(err);
        }
        return;
      }

      // ===== 4. TAURI =====
      if (bridge === 'tauri') {
        const tauri = (window as Window & { __TAURI__?: { print?: (html: string) => Promise<void> } }).__TAURI__;
        tauri!.print!(html)
          .then(() => {
            isCurrentlyPrinting = false;
            incrementTodayPrintCount();
            resolve();
          })
          .catch((err: Error) => {
            isCurrentlyPrinting = false;
            playPrinterErrorSound();
            reject(err);
          });
        return;
      }

      // ===== 5. FALLBACK: iframe + window.print() =====
      // Este método SIEMPRE abre el diálogo del sistema. Es inevitable en navegador puro.
      const iframe = createHiddenIframe(html);
      const doPrint = () => {
        try {
          iframe.contentWindow?.focus();
          // Si hay electronAPI disponible (aunque silent sea false), preferirlo
          const electron = (window as Window & { electronAPI?: { print: () => void } }).electronAPI;
          if (electron) {
            electron.print();
          } else {
            iframe.contentWindow?.print();
          }
          cleanupIframe(iframe, 800);
          incrementTodayPrintCount();
          resolve();
        } catch (err) {
          cleanupIframe(iframe, 0);
          playPrinterErrorSound();
          reject(err);
        }
      };

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc?.readyState === 'complete') {
        doPrint();
      } else {
        iframe.onload = doPrint;
        setTimeout(doPrint, 400);
      }
    } catch (err) {
      isCurrentlyPrinting = false;
      playPrinterErrorSound();
      reject(err);
    }
  });
}

/** Crea un iframe oculto y le inyecta el HTML */
function createHiddenIframe(html: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.border = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
  return iframe;
}

/** Elimina el iframe del DOM después de un delay */
function cleanupIframe(iframe: HTMLIFrameElement, delayMs: number): void {
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch { /* ignore */ }
    isCurrentlyPrinting = false;
  }, delayMs);
}

function playPrinterErrorSound(): void {
  try {
    import('@/utils/sounds').then((mod) => {
      if (mod.playErrorSound) mod.playErrorSound();
    });
  } catch { /* silent fail */ }
}

function incrementTodayPrintCount(): void {
  const today = new Date().toISOString().split('T')[0];
  const key = `genosan_prints_${today}`;
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  localStorage.setItem(key, String(current + 1));
  localStorage.setItem('genosan_prints_last', new Date().toISOString());
}

export function getTodayPrintCount(): number {
  const today = new Date().toISOString().split('T')[0];
  const key = `genosan_prints_${today}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

export function getLastPrintTime(): string | null {
  return localStorage.getItem('genosan_prints_last');
}

export function isPrinterAvailable(): boolean {
  return getNativeBridge() !== null || true;
}

export function printTestPage(options: {
  companyName: string;
  address?: string;
  phone?: string;
  rnc?: string;
  printerType?: '58mm' | '80mm' | 'A4';
  fontSize?: 'small' | 'medium' | 'large';
  footerText?: string;
}, printerName = ''): Promise<void> {
  return printReceipt({
    companyName: options.companyName,
    branchName: 'PÁGINA DE PRUEBA',
    rnc: options.rnc,
    phone: options.phone,
    address: options.address,
    invoiceFooter: options.footerText || 'Sistema Farmacia GENOSAN',
    invoiceColor: '#10b981',
    showLogo: false,
    ncf: 'B02-00000001',
    numeroFactura: 1001,
    facturaId: 'test-0001',
    fecha: new Date().toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }),
    cajero: 'Administrador',
    metodoPago: 'efectivo',
    items: [
      { name: 'Amoxicilina 500mg', quantity: 2, unitPrice: 90, lineDiscount: 0 },
      { name: 'Ibuprofeno 400mg', quantity: 1, unitPrice: 95, lineDiscount: 0 },
      { name: 'Vitamina C 1000mg', quantity: 3, unitPrice: 70, lineDiscount: 0 },
    ],
    subtotal: 485,
    itbis: 0,
    discountAmount: 0,
    globalDiscount: 0,
    total: 485,
    cashReceived: 500,
    change: 15,
    printerType: options.printerType || '80mm',
    fontSize: options.fontSize || 'medium',
    copies: 1,
  }, printerName);
}

/**
 * Diagnóstico completo del entorno de impresión.
 * Útil para saber por qué no imprime en Electron.
 */
export interface PrintDiagnostics {
  bridgeType: string | null;
  hasElectronAPI: boolean;
  hasPrintHTML: boolean;
  hasPrint: boolean;
  hasGetPrinters: boolean;
  hasCheckPrinter: boolean;
  hasWebView2: boolean;
  hasTauri: boolean;
  userAgent: string;
  isElectronUserAgent: boolean;
}

export function getPrintDiagnostics(): PrintDiagnostics {
  const w = window as Window & {
    electronAPI?: {
      printHTML?: () => void;
      print?: () => void;
      getPrinters?: () => void;
      checkPrinter?: () => void;
    };
    chrome?: { webview?: { postMessage?: () => void } };
    __TAURI__?: { print?: () => void };
  };

  const ua = navigator.userAgent;
  const isElectronUA = ua.includes('Electron') || !!(w as Window & { process?: { versions?: { electron?: string } } }).process?.versions?.electron;

  return {
    bridgeType: getNativeBridge(),
    hasElectronAPI: !!w.electronAPI,
    hasPrintHTML: !!w.electronAPI?.printHTML,
    hasPrint: !!w.electronAPI?.print,
    hasGetPrinters: !!w.electronAPI?.getPrinters,
    hasCheckPrinter: !!w.electronAPI?.checkPrinter,
    hasWebView2: !!w.chrome?.webview?.postMessage,
    hasTauri: !!w.__TAURI__?.print,
    userAgent: ua,
    isElectronUserAgent: isElectronUA,
  };
}

/** Devuelve true si el entorno parece ser Electron pero el bridge no está expuesto */
export function isElectronButMissingBridge(): boolean {
  const d = getPrintDiagnostics();
  return d.isElectronUserAgent && !d.hasElectronAPI;
}

/** Devuelve una descripción legible del problema de impresión */
export function getPrinterBridgeStatus(): {
  ok: boolean;
  label: string;
  detail: string;
  action?: string;
} {
  const d = getPrintDiagnostics();

  if (d.hasPrintHTML) {
    return { ok: true, label: 'Electron listo', detail: 'El bridge nativo está configurado y la impresión será silenciosa.' };
  }
  if (d.hasPrint) {
    return { ok: true, label: 'Electron básico', detail: 'El bridge está presente pero sin printHTML. Usará iframe + silent print.' };
  }
  if (d.hasWebView2) {
    return { ok: true, label: 'WebView2 listo', detail: 'Microsoft WebView2 detectado.' };
  }
  if (d.hasTauri) {
    return { ok: true, label: 'Tauri listo', detail: 'Tauri detectado.' };
  }
  if (d.isElectronUserAgent) {
    return {
      ok: false,
      label: 'Falta preload.js',
      detail: 'La app corre en Electron pero no se detectó window.electronAPI.',
      action: 'Revisá que tu preload.js exponga window.electronAPI.printHTML. Ver ELECTRON_SETUP.md',
    };
  }
  return {
    ok: false,
    label: 'Sin bridge nativo',
    detail: 'No se detectó ningún bridge de impresión. Se abrirá el diálogo del navegador.',
    action: 'Para impresión directa sin diálogo, empaquetá la app en Electron y configurá el preload.js.',
  };
}