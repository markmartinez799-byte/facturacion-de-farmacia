# CONFIGURACIÓN DE ELECTRON PARA IMPRESIÓN SILENCIOSA

Este archivo contiene el código EXACTO que necesitás pegar en tu proyecto Electron
para que la impresión sea directa a la impresora térmica, SIN diálogo de "Guardar como".

## ¿Qué necesitás?

Tu app web empaquetada en Electron necesita un **preload script** y modificar el
**proceso principal (main.js)** para exponer la API de impresión al frontend.

---

## 1. Preload Script (preload.js)

Creá o modificá este archivo en tu proyecto Electron:

```js
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Imprime HTML directo a impresora (SIN DIÁLOGO) */
  printHTML: (html, options) => ipcRenderer.invoke('print-html', html, options),

  /** Obtiene lista de impresoras disponibles */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /** Verifica si una impresora está conectada */
  checkPrinter: (printerName) => ipcRenderer.invoke('check-printer', printerName),

  /** Imprime el documento actual (iframe) sin diálogo */
  print: () => ipcRenderer.send('silent-print'),
});
```

---

## 2. Proceso Principal (main.js / main.ts)

Agregá estas líneas en tu archivo principal de Electron:

```js
// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// ... tu código existente de creación de ventana ...

/**
 * IPC: Imprimir HTML directo a impresora SIN diálogo
 */
ipcMain.handle('print-html', async (event, html, options = {}) => {
  const { silent = true, printerName = '' } = options;

  try {
    // Crear ventana oculta para cargar el HTML
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Cargar el HTML directamente
    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Esperar a que cargue y luego imprimir
    return new Promise((resolve) => {
      printWindow.webContents.on('did-finish-load', () => {
        const printOptions = {
          silent: true,              // ← ESTO evita el diálogo
          printBackground: true,
          deviceName: printerName || undefined,  // ← Impresora específica o predeterminada
        };

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          printWindow.close();
          resolve({ success, error: failureReason });
        });
      });

      // Timeout de seguridad
      setTimeout(() => {
        printWindow.close();
        resolve({ success: false, error: 'Timeout al imprimir' });
      }, 15000);
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/**
 * IPC: Obtener lista de impresoras
 */
ipcMain.handle('get-printers', async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return [];

  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status,
      description: p.description || '',
    }));
  } catch {
    return [];
  }
});

/**
 * IPC: Verificar estado de una impresora
 */
ipcMain.handle('check-printer', async (event, printerName) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { connected: false, status: 'error' };

  try {
    const printers = await win.webContents.getPrintersAsync();
    const printer = printers.find((p) => p.name === printerName);

    if (!printer) {
      return { connected: false, status: 'desconectada' };
    }

    // status: 0 = disponible, otros valores = ocupada/error
    if (printer.status === 0) {
      return { connected: true, status: 'lista' };
    }
    return { connected: false, status: 'ocupada' };
  } catch {
    return { connected: false, status: 'error' };
  }
});

/**
 * IPC: Silent print del documento actual (para iframe oculto)
 */
ipcMain.on('silent-print', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.webContents.print({ silent: true, printBackground: true });
  }
});
```

---

## 3. Configurar el preload en tu ventana

En tu `main.js` donde creás la ventana, asegurate de pasar el preload:

```js
const mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),  // ← IMPORTANTE
    contextIsolation: true,
    nodeIntegration: false,
    offscreen: false,
  },
});
```

---

## 4. Instalar dependencias (si no las tenés)

```bash
npm install electron --save-dev
```

---

## ¿Cómo funciona?

1. El frontend (React) detecta automáticamente si existe `window.electronAPI`
2. Si existe, usa `printHTML()` para enviar el HTML del recibo al proceso principal
3. El proceso principal de Electron crea una ventana OCULTA, carga el HTML
4. Llama a `webContents.print({ silent: true })` → **imprime sin diálogo**
5. Cierra la ventana oculta automáticamente
6. El frontend muestra "Factura impresa correctamente"

---

## ¿Y si no quiero instalar Electron ahora?

El sistema detecta automáticamente si el bridge existe. Si no lo hay,
usa el fallback `iframe + window.print()`, que sí abre el diálogo.

**El código del frontend ya está listo.** Solo necesitás agregar el
preload.js y main.js de arriba en tu proyecto Electron.

---

## Posibles problemas y soluciones

### "No imprime nada"
- Verificá que la impresora esté configurada como **predeterminada** en Windows
- En Panel de control → Dispositivos e impresoras, asegurate de que tu
  impresora térmica (ej: "EPSON TM-T20") esté marcada con la palomita verde

### "Sale en papel A4 en vez de ticket"
- Configurá el tipo de papel en el sistema: Panel de control → Impresoras →
  Preferencias de impresión → Papel → "Rollo 80mm" o similar

### "Se ve muy pequeño o muy grande"
- Usá el selector de "Tamaño de fuente" en Configuración > Impresora
- Ajustá el tipo de papel a 58mm o 80mm según tu impresora

### "Demora en salir"
- La primera impresión puede tardar unos segundos porque crea la ventana oculta
- Las siguientes salen más rápido