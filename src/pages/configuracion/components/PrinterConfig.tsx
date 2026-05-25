import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import {
  printTestPage, getSystemPrinters, checkPrinterStatus,
  hasElectronBridge, clearPrinterCache,
  getPrinterBridgeStatus, isElectronButMissingBridge,
} from '@/services/printService';
import type { PrintMode } from '@/store/appStore';

type PrinterType = '58mm' | '80mm' | 'A4';
type FontSize = 'small' | 'medium' | 'large';

const MODE_LABELS: Record<PrintMode, { label: string; desc: string; icon: string; color: string }> = {
  auto: {
    label: 'Impresión automática',
    desc: 'Imprime directamente al completar cada venta sin preguntar',
    icon: 'ri-flashlight-fill',
    color: 'emerald',
  },
  ask: {
    label: 'Preguntar antes de imprimir',
    desc: 'Muestra una opción en el checkout para decidir si imprimir o no',
    icon: 'ri-questionnaire-fill',
    color: 'amber',
  },
  never: {
    label: 'No imprimir automáticamente',
    desc: 'Solo registra la factura en el sistema sin imprimir físicamente',
    icon: 'ri-forbid-line',
    color: 'slate',
  },
};

export default function PrinterConfig() {
  const { settings, printerSettings, updatePrinterSettings } = useAppStore();
  const [testStatus, setTestStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean; status?: number; description?: string }[]>([]);
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; status: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showPrinterDropdown, setShowPrinterDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isElectron = hasElectronBridge();
  const bridgeStatus = getPrinterBridgeStatus();
  const missingPreload = isElectronButMissingBridge();
  const currentMode = printerSettings.printMode || 'auto';
  const modeInfo = MODE_LABELS[currentMode];

  // Cargar impresoras al montar
  useEffect(() => {
    loadPrinters();
  }, []);

  // Detectar clic fuera del dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPrinterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Verificar estado de la impresora seleccionada
  useEffect(() => {
    const check = async () => {
      if (printerSettings.printerName) {
        const status = await checkPrinterStatus(printerSettings.printerName);
        setPrinterStatus(status);
      } else {
        setPrinterStatus(null);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [printerSettings.printerName]);

  const loadPrinters = useCallback(async () => {
    setIsScanning(true);
    try {
      const list = await getSystemPrinters();
      setPrinters(list);
      // Si hay una impresora predeterminada del sistema y no hay una configurada, usarla
      const defaultPrinter = list.find((p) => p.isDefault);
      if (defaultPrinter && !printerSettings.printerName) {
        updatePrinterSettings({ printerName: defaultPrinter.name });
      }
    } catch {
      setPrinters([]);
    } finally {
      setIsScanning(false);
    }
  }, [printerSettings.printerName, updatePrinterSettings]);

  const handleSelectPrinter = (name: string) => {
    updatePrinterSettings({ printerName: name });
    clearPrinterCache();
    setShowPrinterDropdown(false);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
    // Re-verificar estado
    checkPrinterStatus(name).then(setPrinterStatus);
  };

  const handleRemovePrinter = () => {
    updatePrinterSettings({ printerName: '' });
    clearPrinterCache();
    setPrinterStatus(null);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleTestPrint = async () => {
    setTestStatus('printing');
    try {
      await printTestPage(
        {
          companyName: settings.name || 'FARMACIA GENOSAN',
          address: settings.address,
          phone: settings.phone,
          rnc: settings.rnc,
          printerType: printerSettings.printerType as '58mm' | '80mm' | 'A4',
          fontSize: printerSettings.fontSize as 'small' | 'medium' | 'large',
          footerText: printerSettings.footerText,
        },
        printerSettings.printerName
      );
      setTestStatus('success');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const handleSave = () => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const statusBadge = () => {
    if (!isElectron) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
          <i className="ri-error-warning-line text-sm" />
          Sin bridge nativo — se abrirá diálogo
        </span>
      );
    }
    if (!printerSettings.printerName) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
          <i className="ri-error-warning-line text-sm" />
          Sin impresora configurada
        </span>
      );
    }
    if (!printerStatus) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
          <i className="ri-loader-2-line animate-spin text-sm" />
          Verificando...
        </span>
      );
    }
    if (printerStatus.connected) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
          <i className="ri-checkbox-circle-fill text-sm" />
          {printerStatus.status === 'lista' ? 'Conectada y lista' : `Estado: ${printerStatus.status}`}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
        <i className="ri-error-warning-line text-sm" />
        {printerStatus.status === 'desconectada' ? 'Impresora desconectada' : `Error: ${printerStatus.status}`}
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* Banner de modo actual */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border bg-${modeInfo.color}-50 border-${modeInfo.color}-200`}>
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className={`${modeInfo.icon} text-${modeInfo.color}-600 text-lg`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">
            Modo activo: <span className={`text-${modeInfo.color}-700`}>{modeInfo.label}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {modeInfo.desc}
          </p>
        </div>
      </div>

      {/* Diagnóstico del bridge de impresión */}
      {missingPreload ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-red-50 border-red-200">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-error-warning-line text-red-600 text-lg" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Falta el preload de Electron</p>
            <p className="text-xs text-red-600 mt-0.5">
              La app corre en Electron pero no se detectó <code>window.electronAPI</code>.
              Para imprimir sin diálogo, copiá el código de <strong>ELECTRON_SETUP.md</strong> en tu <code>preload.js</code> y <code>main.js</code>.
            </p>
          </div>
        </div>
      ) : bridgeStatus.ok ? (
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-checkbox-circle-line text-emerald-600 text-lg" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-700">{bridgeStatus.label}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{bridgeStatus.detail}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-amber-50 border-amber-200">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-error-warning-line text-amber-600 text-lg" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700">{bridgeStatus.label}</p>
            <p className="text-xs text-amber-600 mt-0.5">{bridgeStatus.detail}</p>
            {bridgeStatus.action && (
              <p className="text-xs text-amber-700 mt-1 font-medium">{bridgeStatus.action}</p>
            )}
          </div>
        </div>
      )}


      {/* Selector de impresora */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-printer-line text-emerald-600 text-lg" />
            </div>
            Impresora Predeterminada
          </h3>
          <div className="flex items-center gap-2">
            {printerStatus?.connected && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <i className="ri-wifi-line text-sm" />
                Conectada
              </span>
            )}
            {printerStatus && !printerStatus.connected && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                <i className="ri-wifi-off-line text-sm" />
                Desconectada
              </span>
            )}
          </div>
        </div>

        {/* Estado actual de la impresora seleccionada */}
        {printerSettings.printerName && (
          <div className={`flex items-center gap-4 p-4 rounded-xl border ${
            printerStatus?.connected
              ? 'bg-emerald-50 border-emerald-200'
              : printerStatus
              ? 'bg-rose-50 border-rose-200'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`w-12 h-12 flex items-center justify-center rounded-xl flex-shrink-0 ${
              printerStatus?.connected ? 'bg-emerald-100' : 'bg-rose-100'
            }`}>
              <i className={`ri-printer-fill text-2xl ${printerStatus?.connected ? 'text-emerald-600' : 'text-rose-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${printerStatus?.connected ? 'text-emerald-800' : 'text-rose-700'}`}>
                {printerSettings.printerName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {printerStatus?.connected
                  ? 'Impresora lista para imprimir tickets automáticamente'
                  : printerStatus
                  ? `Error: ${printerStatus.status}. Verificá que esté encendida y conectada.`
                  : 'Verificando estado de la impresora...'}
              </p>
            </div>
            <button
              onClick={handleRemovePrinter}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Quitar impresora"
            >
              <i className="ri-close-line text-lg" />
            </button>
          </div>
        )}

        {/* Dropdown de selección de impresora */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setShowPrinterDropdown(!showPrinterDropdown); if (!showPrinterDropdown) loadPrinters(); }}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-emerald-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <i className="ri-printer-line text-slate-400" />
              <span className="text-sm text-slate-700">
                {printerSettings.printerName || 'Seleccionar impresora del sistema...'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isScanning && <i className="ri-loader-2-line animate-spin text-slate-400" />}
              <i className={`ri-arrow-down-s-line text-slate-400 transition-transform ${showPrinterDropdown ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {showPrinterDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {printers.length === 0 && !isScanning && (
                <div className="p-4 text-center">
                  <p className="text-sm text-slate-500">No se encontraron impresoras</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {isElectron
                      ? 'Verificá que haya impresoras instaladas en Windows'
                      : 'El navegador no puede acceder a las impresoras del sistema'}
                  </p>
                </div>
              )}
              {printers.map((printer) => (
                <button
                  key={printer.name}
                  onClick={() => handleSelectPrinter(printer.name)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left transition-colors cursor-pointer border-b border-slate-100 last:border-0 ${
                    printerSettings.printerName === printer.name ? 'bg-emerald-50' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    printer.isDefault ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    <i className={`ri-printer-fill ${printer.isDefault ? 'text-emerald-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{printer.name}</p>
                    <p className="text-xs text-slate-400">
                      {printer.isDefault && <span className="text-emerald-600 font-medium">Predeterminada · </span>}
                      {printer.description || 'Impresora del sistema'}
                    </p>
                  </div>
                  {printerSettings.printerName === printer.name && (
                    <i className="ri-check-line text-emerald-600 text-lg" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Botón reescanear */}
        <button
          onClick={loadPrinters}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isScanning ? (
            <><i className="ri-loader-2-line animate-spin" /> Buscando impresoras...</>
          ) : (
            <><i className="ri-refresh-line" /> Escanear impresoras del sistema</>
          )}
        </button>
      </div>

      {/* Configuración de papel y opciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuración General */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-5">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-settings-3-line text-emerald-600 text-lg" />
            </div>
            Configuración General
          </h3>

          {/* Tipo de papel */}
          <div>
            <label className="text-sm font-medium text-slate-600 mb-2 block">
              Tipo / Tamaño de Papel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['58mm', '80mm', 'A4'] as PrinterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => updatePrinterSettings({ printerType: type })}
                  className={`py-3 px-2 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    printerSettings.printerType === type
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-base font-bold">{type}</div>
                    <div className="text-xs opacity-70">
                      {type === '58mm' ? 'Térmica pequeña' : type === '80mm' ? 'Térmica estándar' : 'Hoja carta'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Copias */}
          <div>
            <label className="text-sm font-medium text-slate-600 mb-2 block">
              Número de Copias
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updatePrinterSettings({ copies: Math.max(1, printerSettings.copies - 1) })}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer font-bold text-lg"
              >
                -
              </button>
              <span className="w-12 text-center font-bold text-xl text-slate-800">
                {printerSettings.copies}
              </span>
              <button
                onClick={() => updatePrinterSettings({ copies: Math.min(5, printerSettings.copies + 1) })}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer font-bold text-lg"
              >
                +
              </button>
              <span className="text-sm text-slate-500">copia(s) por factura</span>
            </div>
          </div>

          {/* Tamaño de fuente */}
          <div>
            <label className="text-sm font-medium text-slate-600 mb-2 block">
              Tamaño de Fuente
            </label>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => updatePrinterSettings({ fontSize: size })}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    printerSettings.fontSize === size
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {size === 'small' ? 'Pequeño' : size === 'medium' ? 'Mediano' : 'Grande'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Opciones de impresión */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-5">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-file-list-3-line text-emerald-600 text-lg" />
            </div>
            Opciones de Impresión
          </h3>

          <div className="space-y-3">
            {[
              { key: 'autoPrint' as const, label: 'Habilitar impresión automática', desc: 'Permite que el sistema envíe a la impresora' },
              { key: 'printLogo' as const, label: 'Imprimir nombre/logo de la empresa', desc: 'Encabezado con datos de la farmacia' },
              { key: 'printFooter' as const, label: 'Imprimir mensaje de pie de página', desc: 'Texto personalizable al final del recibo' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => updatePrinterSettings({ [key]: !printerSettings[key] })}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    printerSettings[key]
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    printerSettings[key] ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            ))}
          </div>

          {printerSettings.printFooter && (
            <div>
              <label className="text-sm font-medium text-slate-600 mb-1 block">
                Texto del pie de página
              </label>
              <textarea
                value={printerSettings.footerText}
                onChange={(e) => updatePrinterSettings({ footerText: e.target.value })}
                rows={2}
                maxLength={120}
                className="w-full p-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm resize-none focus:outline-none focus:border-emerald-400"
                placeholder="Ej: Gracias por su compra. ¡Vuelva pronto!"
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{printerSettings.footerText.length}/120</p>
            </div>
          )}
        </div>
      </div>

      {/* Vista previa */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-eye-line text-emerald-600 text-lg" />
          </div>
          Vista Previa del Recibo
        </h3>
        <div className="flex justify-center">
          <div
            className="bg-white border border-dashed border-slate-300 rounded p-4 font-mono text-black"
            style={{
              width: printerSettings.printerType === '58mm' ? '200px' : printerSettings.printerType === '80mm' ? '280px' : '400px',
              fontSize: printerSettings.fontSize === 'small' ? '9px' : printerSettings.fontSize === 'large' ? '13px' : '11px',
            }}
          >
            {printerSettings.printLogo && (
              <div className="text-center font-bold text-sm mb-1">{settings.name}</div>
            )}
            <div className="text-center">{settings.address || 'Dirección de la farmacia'}</div>
            <div className="text-center">Tel: {settings.phone || '000-000-0000'}</div>
            <div className="text-center">RNC: {settings.rnc || '000-00000-0'}</div>
            <div className="border-t border-dashed border-slate-400 my-1" />
            <div className="text-center font-bold">FACTURA B02-00000001</div>
            <div className="text-center">{new Date().toLocaleDateString('es-DO')} {new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="border-t border-dashed border-slate-400 my-1" />
            <div className="flex justify-between"><span>Amoxicilina 500mg x2</span><span>RD$180</span></div>
            <div className="flex justify-between"><span>Ibuprofeno 400mg x1</span><span>RD$95</span></div>
            <div className="border-t border-dashed border-slate-400 my-1" />
            <div className="flex justify-between font-bold"><span>TOTAL:</span><span>RD$275.00</span></div>
            <div className="flex justify-between"><span>Efectivo:</span><span>RD$300.00</span></div>
            <div className="flex justify-between"><span>Cambio:</span><span>RD$25.00</span></div>
            {printerSettings.printFooter && (
              <>
                <div className="border-t border-dashed border-slate-400 my-1" />
                <div className="text-center">{printerSettings.footerText}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Acciones finales */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleTestPrint}
          disabled={testStatus === 'printing' || !printerSettings.printerName}
          className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          {testStatus === 'printing' ? (
            <><i className="ri-loader-4-line animate-spin" /> Enviando a impresora...</>
          ) : testStatus === 'success' ? (
            <><i className="ri-checkbox-circle-line text-emerald-500" /> Página de prueba enviada</>
          ) : testStatus === 'error' ? (
            <><i className="ri-error-warning-line text-red-500" /> Error — revisa la impresora</>
          ) : (
            <><i className="ri-printer-line" /> Imprimir página de prueba</>
          )}
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          {saveStatus === 'saved' ? (
            <><i className="ri-checkbox-circle-line" /> Configuración guardada</>
          ) : (
            <><i className="ri-save-line" /> Guardar configuración</>
          )}
        </button>
      </div>
    </div>
  );
}