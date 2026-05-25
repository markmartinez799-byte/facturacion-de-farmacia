// native-bridge.d.ts
// Declaraciones de tipos para APIs nativas de webviews empaquetadas
// Estas APIs deben ser expuestas desde el proceso nativo (Electron main, Tauri, WebView2, etc.)

export interface ElectronPrintAPI {
  /** Imprime silenciosamente el documento actual (sin diálogo) */
  print(): void;
  /**
   * Imprime un HTML string directamente usando la impresora indicada.
   * Si printerName es vacío, usa la impresora predeterminada del sistema.
   */
  printHTML?(
    html: string,
    options?: { silent?: boolean; printerName?: string }
  ): Promise<{ success: boolean; error?: string }>;
  /** Obtiene lista de impresoras disponibles en el sistema */
  getPrinters?(): Promise<{ name: string; isDefault: boolean; status?: number; description?: string }[]>;
  /** Verifica si una impresora específica está disponible y conectada */
  checkPrinter?(printerName: string): Promise<{ connected: boolean; status: string }>;
}

export interface WebView2API {
  /** Envia mensaje al host nativo de WebView2 */
  postMessage(message: string): void;
  /** Agrega listener para mensajes del host nativo */
  addEventListener(type: 'message', listener: (event: { data: string }) => void): void;
}

export interface TauriPrintAPI {
  /** Usa el plugin de impresión de Tauri */
  print?(html: string, options?: { silent?: boolean }): Promise<void>;
}

declare global {
  interface Window {
    /** Electron preload bridge */
    electronAPI?: ElectronPrintAPI;
    /** Microsoft Edge WebView2 bridge */
    chrome?: {
      webview?: WebView2API;
    };
    /** Tauri bridge (si existe) */
    __TAURI__?: TauriPrintAPI;
    /** Electron process versions (disponible en renderer con nodeIntegration) */
    process?: {
      versions?: {
        electron?: string;
      };
    };
  }
}

export {};