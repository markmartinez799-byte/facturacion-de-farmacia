import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// BarcodeDetector is available in Chrome/Edge with built-in shape detection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const BarcodeDetector: any;

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'init' | 'requesting' | 'scanning' | 'found' | 'error'>('init');
  const [message, setMessage] = useState('Haz clic en "Iniciar cámara" para escanear');
  const [lastCode, setLastCode] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<unknown>(null);

  const supportedFormats = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39',
    'code_93', 'codabar', 'itf', 'ean_13', 'ean_8', 'qr_code',
  ];

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      setStatus('error');
      setMessage('Tu navegador no soporta escaneo nativo de códigos. Usa Chrome o Edge en computadora o celular.');
      return;
    }
    try {
      setStatus('requesting');
      setMessage('Solicitando acceso a la cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new BarcodeDetector({ formats: supportedFormats });
      setStatus('scanning');
      setMessage('Enfoca el código de barras dentro del recuadro rojo');
      detectLoop();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
    }
  };

  const detectLoop = async () => {
    if (!videoRef.current || !detectorRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = await (detectorRef.current as any).detect(videoRef.current);
      if (results && results.length > 0) {
        const raw = results[0].rawValue as string;
        if (raw && raw !== lastCode) {
          setLastCode(raw);
          setStatus('found');
          setMessage(`Código detectado: ${raw}`);
          // Beep
          try {
            const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.1;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } catch {
            // ignore audio errors
          }
          // Stop after a brief moment so user sees it
          setTimeout(() => {
            stopCamera();
            onScan(raw);
          }, 600);
          return;
        }
      }
    } catch {
      // ignore detection errors, keep looping
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-white text-sm">Escáner de Código de Barras</h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="text-slate-400 hover:text-slate-600 cursor-pointer w-8 h-8 flex items-center justify-center">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {status !== 'scanning' && status !== 'found' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white p-6">
                <i className="ri-barcode-line text-4xl mb-3 opacity-50"></i>
                <p className="text-sm text-center">{message}</p>
                {status === 'error' && (
                  <p className="text-xs text-slate-300 mt-2 text-center">Puedes ingresar el código manualmente en el buscador de productos.</p>
                )}
              </div>
            )}
            {/* Scan frame overlay */}
            {status === 'scanning' && (
              <>
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 bg-black/30"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-40 border-2 border-red-500 rounded-lg">
                    {/* Corner markers */}
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-red-500"></div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-red-500"></div>
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-red-500"></div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-red-500"></div>
                    {/* Laser line animation */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500/70 animate-[scanLine_2s_ease-in-out_infinite]"></div>
                  </div>
                </div>
                <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs font-medium bg-black/40 py-1">
                  {message}
                </p>
              </>
            )}
            {status === 'found' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-900/80 text-white">
                <i className="ri-checkbox-circle-fill text-4xl mb-2"></i>
                <p className="text-sm font-semibold">¡Código detectado!</p>
                <p className="text-lg font-mono mt-1">{lastCode}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {status === 'init' || status === 'error' ? (
              <button
                onClick={startCamera}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 cursor-pointer flex items-center justify-center gap-2"
              >
                <i className="ri-camera-line"></i> Iniciar cámara
              </button>
            ) : (
              <button
                onClick={() => { stopCamera(); setStatus('init'); setMessage('Haz clic en "Iniciar cámara" para escanear'); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <i className="ri-stop-circle-line"></i> Detener
              </button>
            )}
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            Soporta EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Codabar, ITF y QR.
          </p>
        </div>
      </div>
    </div>
  );
}