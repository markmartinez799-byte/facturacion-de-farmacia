import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, MapPin, Phone, Clock, AlertCircle, CheckCircle2, Package, Truck, ShieldCheck, RefreshCw, X } from 'lucide-react';
import { buscarPorCedula } from '@/services/plasticosSegurosService';
import type { ConsultaSeguroResultado } from '@/types';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateLarga(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}

function formatHora(hora?: string): string {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function calcularDiasRestantes(fechaVencimiento?: string): number | null {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(fechaVencimiento);
  vencimiento.setHours(0, 0, 0, 0);
  const diffMs = vencimiento.getTime() - hoy.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

type EstadoSeguroReal = 'vencido' | 'proximo_vencer' | 'vigente';

function calcularEstadoSeguroReal(fechaVencimiento?: string): EstadoSeguroReal {
  const dias = calcularDiasRestantes(fechaVencimiento);
  if (dias === null) return 'vigente';
  if (dias <= 0) return 'vencido';
  if (dias <= 30) return 'proximo_vencer';
  return 'vigente';
}

type EstadoVisual = 'entregado' | 'disponible' | 'en_proceso' | 'vencido';

function getEstadoPlasticoInfo(result: ConsultaSeguroResultado): {
  color: string; textColor: string; bgColor: string; borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string; estado: EstadoVisual; mensaje: string;
  emoji: string;
} {
  const estadoSeguroReal = calcularEstadoSeguroReal(result.fechaVencimientoSeguro);

  if (result.fechaEntrega) {
    return {
      color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200',
      icon: CheckCircle2, label: 'Plástico Entregado', estado: 'entregado',
      mensaje: 'Su plástico ya fue retirado de la farmacia.',
      emoji: '🟢',
    };
  }
  if (estadoSeguroReal === 'vencido') {
    return {
      color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200',
      icon: AlertCircle, label: 'Seguro Vencido', estado: 'vencido',
      mensaje: 'Su seguro ya venció. Debe realizar una renovación.',
      emoji: '🔴',
    };
  }
  if (result.plasticoRecibido) {
    return {
      color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200',
      icon: Package, label: 'Disponible para Retirar', estado: 'disponible',
      mensaje: 'Su plástico ya se encuentra disponible.',
      emoji: '🟡',
    };
  }
  return {
    color: 'bg-sky-500', textColor: 'text-sky-700', bgColor: 'bg-sky-50', borderColor: 'border-sky-200',
    icon: Truck, label: 'En Proceso', estado: 'en_proceso',
    mensaje: 'Todavía no hemos recibido su plástico. Le recomendamos consultar nuevamente en los próximos días.',
    emoji: '🔵',
  };
}

function getEstadoSeguroInfo(result: ConsultaSeguroResultado) {
  const estadoSeguroReal = calcularEstadoSeguroReal(result.fechaVencimientoSeguro);
  if (estadoSeguroReal === 'vencido') {
    return { color: 'bg-red-500', text: 'Vencido', bg: 'bg-red-50', textColor: 'text-red-700' };
  }
  if (estadoSeguroReal === 'proximo_vencer') {
    return { color: 'bg-amber-500', text: 'Próximo a Vencer', bg: 'bg-amber-50', textColor: 'text-amber-700' };
  }
  return { color: 'bg-emerald-500', text: 'Vigente', bg: 'bg-emerald-50', textColor: 'text-emerald-700' };
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export default function ConsultaSeguroPage() {
  const [cedula, setCedula] = useState('');
  const [resultado, setResultado] = useState<ConsultaSeguroResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (hasSearched && resultado !== null) {
      setTimeout(() => setShowResult(true), 100);
    }
  }, [hasSearched, resultado]);

  const handleSearch = async () => {
    const trimmed = cedula.trim();
    if (!trimmed) {
      setError('Por favor ingrese su número de cédula.');
      return;
    }

    setLoading(true);
    setError(null);
    setShowResult(false);
    setHasSearched(false);

    try {
      const res = await buscarPorCedula(trimmed);
      setResultado(res);
      setHasSearched(true);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    } catch {
      setError('Ocurrió un error al consultar. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleClear = () => {
    setCedula('');
    setResultado(null);
    setHasSearched(false);
    setShowResult(false);
    setError(null);
    inputRef.current?.focus();
  };

  const whatsappNumber = '18095551001';

  return (
    <div className="min-h-screen bg-background-50 flex flex-col">
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <header className="w-full bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiPjxwYXRoIGQ9Ik0zNiAxOGgtNnYtNmgtMjR2MzZoMTJ2Nmg4di02aDEwbC0xMC0xMHYtMTBoMTB2LTEweiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative max-w-4xl mx-auto px-4 py-12 md:py-20 text-center">
          <div className="mb-6">
            <img
              src="https://storage.readdy-site.link/project_files/61af992a-e06f-4abd-88c8-ec17ee19dfca/28008b87-7746-4f5b-b115-a239cbb570ec_compressed_Farmacia-GN.webp"
              alt="Farmacia GENOSAN"
              className="h-20 md:h-24 mx-auto"
            />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 tracking-tight">
            Consulta el estado de tu seguro
          </h1>
          <p className="text-emerald-100 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Ingresa tu número de cédula para verificar si tu plástico ya está disponible,
            conocer la fecha de vencimiento de tu seguro y la sucursal donde puedes retirarlo.
          </p>
        </div>
      </header>

      {/* ─── SEARCH BAR ────────────────────────────────────────────────── */}
      <div className="relative max-w-xl mx-auto px-4 -mt-8 z-10 w-full">
        <div className="bg-white rounded-2xl shadow-lg border border-background-200/70 p-5 md:p-6">
          <label htmlFor="cedula-input" className="block text-xs font-semibold text-foreground-600 uppercase tracking-wide mb-2">
            Número de Cédula
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                id="cedula-input"
                type="text"
                value={cedula}
                onChange={(e) => { setCedula(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="001-1234567-8"
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-background-200/70 bg-background-50 text-foreground-950 text-sm md:text-base placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all disabled:opacity-50"
              />
              {cedula && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-background-200/70 text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !cedula.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-sm hover:shadow-md disabled:shadow-none"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Consultar</span>
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ─── RESULTS ────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 animate-pulse">
            <div className="w-12 h-12 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin mb-4" />
            <p className="text-foreground-500 text-sm">Consultando su seguro...</p>
          </div>
        )}

        {/* Not found */}
        {hasSearched && resultado && !resultado.encontrado && (
          <div className={`transition-all duration-500 ${showResult ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="bg-white rounded-2xl shadow-md border border-background-200/70 p-8 md:p-10 text-center">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-amber-50 flex items-center justify-center">
                <Search className="w-7 h-7 text-amber-500" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-foreground-950 mb-2">
                No encontramos ningún seguro asociado
              </h2>
              <p className="text-foreground-500 text-sm mb-6">
                al número de cédula ingresado.
              </p>
              <div className="bg-background-50 rounded-xl p-4 md:p-5 text-left space-y-3 mb-6 max-w-md mx-auto">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-background-200/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs text-foreground-500 font-semibold">1</span>
                  </div>
                  <p className="text-sm text-foreground-600">Verifique que el número de cédula esté correctamente escrito.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-background-200/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs text-foreground-500 font-semibold">2</span>
                  </div>
                  <p className="text-sm text-foreground-600">Si realizó una renovación recientemente, espere el tiempo indicado por la aseguradora.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-background-200/70 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs text-foreground-500 font-semibold">3</span>
                  </div>
                  <p className="text-sm text-foreground-600">Si necesita ayuda, comuníquese con nosotros.</p>
                </div>
              </div>
              <a
                href={`https://wa.me/${whatsappNumber}?text=Hola,%20necesito%20ayuda%20con%20la%20consulta%20de%20mi%20seguro`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <i className="ri-whatsapp-line text-lg"></i>
                Contactar la farmacia
              </a>
            </div>
          </div>
        )}

        {/* Found */}
        {hasSearched && resultado && resultado.encontrado && (
          <div ref={resultRef} className={`transition-all duration-500 ${showResult ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            {(() => {
              const plasticoInfo = getEstadoPlasticoInfo(resultado);
              const seguroInfo = getEstadoSeguroInfo(resultado);
              const diasRestantesReal = calcularDiasRestantes(resultado.fechaVencimientoSeguro);
              const estadoSeguroReal = calcularEstadoSeguroReal(resultado.fechaVencimientoSeguro);
              const IconComponent = plasticoInfo.icon;
              const isExpired = estadoSeguroReal === 'vencido';
              const isEntregado = plasticoInfo.estado === 'entregado';
              const isDisponible = plasticoInfo.estado === 'disponible';
              const isEnProceso = plasticoInfo.estado === 'en_proceso';

              return (
                <>
                  {/* ─── ESTADO DEL PLÁSTICO ──────────────────────────────── */}
                  <div className={`${plasticoInfo.bgColor} ${plasticoInfo.borderColor} border rounded-2xl p-5 md:p-6 mb-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full ${plasticoInfo.color} flex items-center justify-center`}>
                        <IconComponent className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${plasticoInfo.color} text-white`}>
                          {plasticoInfo.label}
                        </span>
                      </div>
                    </div>

                    <p className={`text-sm ${plasticoInfo.textColor} font-medium mb-1`}>
                      {plasticoInfo.mensaje}
                    </p>

                    {/* Badge ENTREGADO grande */}
                    {isEntregado && (
                      <div className="mt-4 flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl text-base shadow-md">
                          <CheckCircle2 className="w-5 h-5" />
                          ENTREGADO
                        </span>
                      </div>
                    )}

                    {/* Botón Renovar Seguro para vencidos */}
                    {isExpired && (
                      <a
                        href={`https://wa.me/${whatsappNumber}?text=Hola,%20quisiera%20renovar%20mi%20seguro.%20Mi%20placa%20es%20${resultado.placa || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-all cursor-pointer shadow-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Renovar Seguro
                      </a>
                    )}
                  </div>

                  {/* ─── DETALLE DEL CLIENTE Y SEGURO ──────────────────────── */}
                  <div className="bg-white rounded-2xl shadow-md border border-background-200/70 overflow-hidden">
                    <div className="p-5 md:p-6 border-b border-background-200/70 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-foreground-950">{resultado.nombreCliente}</h2>
                        <p className="text-xs text-foreground-500">Ref: {resultado.numeroReferencia || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${seguroInfo.bg} ${seguroInfo.textColor}`}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {seguroInfo.text}
                        </span>
                        {resultado.numeroPolizaParcial && (
                          <span className="text-xs text-foreground-400 bg-background-50 px-2.5 py-1.5 rounded-full font-mono">
                            {resultado.numeroPolizaParcial}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 md:p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <InfoField label="Vehículo" value={`${resultado.tipoVehiculo ? resultado.tipoVehiculo.charAt(0).toUpperCase() + resultado.tipoVehiculo.slice(1) : '—'}`} />
                        <InfoField label="Marca" value={resultado.marcaVehiculo || '—'} />
                        <InfoField label="Modelo" value={resultado.modelo || '—'} />
                        <InfoField label="Año" value={resultado.ano || '—'} />
                        <InfoField label="Placa" value={resultado.placa || '—'} mono />
                        <InfoField label="Aseguradora" value={resultado.aseguradora || '—'} />
                        <InfoField label="Fecha Emisión" value={formatDate(resultado.fechaEmisionSeguro)} />
                        <InfoField label="Fecha Vencimiento" value={formatDate(resultado.fechaVencimientoSeguro)} highlight />
                      </div>

                      {diasRestantesReal !== null && (
                        <div className="mt-4 flex items-center gap-2">
                          <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                            diasRestantesReal <= 0
                              ? 'bg-red-100 text-red-700'
                              : diasRestantesReal <= 30
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {diasRestantesReal <= 0
                              ? 'Vencido'
                              : `${diasRestantesReal} día${diasRestantesReal === 1 ? '' : 's'} restante${diasRestantesReal === 1 ? '' : 's'}`}
                          </div>
                          {diasRestantesReal > 0 && diasRestantesReal <= 30 && (
                            <span className="text-[11px] text-amber-600 font-medium">
                              ¡Renueve pronto!
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ─── DETALLE DE ENTREGA (si fue entregado) ──────────────── */}
                  {isEntregado && (
                    <div className="bg-white rounded-2xl shadow-md border border-background-200/70 mt-4 overflow-hidden">
                      <div className="p-5 md:p-6">
                        <h3 className="text-sm font-bold text-foreground-950 mb-4 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Detalle de la Entrega
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] text-foreground-400 uppercase tracking-wide font-medium">Fecha de entrega</p>
                            <p className="text-sm font-bold text-foreground-950">{formatDateLarga(resultado.fechaEntrega)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-foreground-400 uppercase tracking-wide font-medium">Hora</p>
                            <p className="text-sm font-bold text-foreground-950">{formatHora(resultado.horaEntrega) || '—'}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-[11px] text-foreground-400 uppercase tracking-wide font-medium">Sucursal</p>
                            <div className="flex items-start gap-2 mt-1">
                              <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-foreground-950">{resultado.sucursalNombre || '—'}</p>
                                {resultado.sucursalDireccion && <p className="text-xs text-foreground-500">{resultado.sucursalDireccion}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── SUCURSAL (si está disponible para retirar) ─────────── */}
                  {isDisponible && resultado.sucursalNombre && (
                    <div className="bg-white rounded-2xl shadow-md border border-background-200/70 mt-4 overflow-hidden">
                      <div className="p-5 md:p-6">
                        <h3 className="text-sm font-bold text-foreground-950 mb-4 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-600" />
                          Lugar de Retiro
                        </h3>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <MapPin className="w-4 h-4 text-foreground-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-foreground-950">{resultado.sucursalNombre}</p>
                              <p className="text-xs text-foreground-500">{resultado.sucursalDireccion}</p>
                            </div>
                          </div>
                          {resultado.sucursalTelefono && (
                            <div className="flex items-center gap-3">
                              <Phone className="w-4 h-4 text-foreground-400 flex-shrink-0" />
                              <p className="text-sm text-foreground-700">{resultado.sucursalTelefono}</p>
                            </div>
                          )}
                          {resultado.sucursalHorario && (
                            <div className="flex items-start gap-3">
                              <Clock className="w-4 h-4 text-foreground-400 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground-600">{resultado.sucursalHorario}</p>
                            </div>
                          )}
                        </div>
                        {resultado.sucursalDireccion && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resultado.sucursalDireccion)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-background-50 hover:bg-background-100 border border-background-200/70 text-foreground-700 font-medium rounded-xl text-sm transition-all cursor-pointer"
                          >
                            <MapPin className="w-4 h-4" />
                            Ver ubicación
                          </a>
                        )}
                        {resultado.fechaRecibido && (
                          <div className="mt-4 pt-3 border-t border-background-200/70">
                            <p className="text-xs text-foreground-500">
                              <strong>Llegó el:</strong> {formatDateLarga(resultado.fechaRecibido)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─── SUCURSAL TAMBIÉN PARA ENTREGADO ────────────────────── */}
                  {isEntregado && resultado.sucursalNombre && (
                    <div className="bg-white rounded-2xl shadow-md border border-background-200/70 mt-4 overflow-hidden">
                      <div className="p-5 md:p-6">
                        <h3 className="text-sm font-bold text-foreground-950 mb-4 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-600" />
                          Sucursal de Retiro
                        </h3>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <MapPin className="w-4 h-4 text-foreground-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-foreground-950">{resultado.sucursalNombre}</p>
                              <p className="text-xs text-foreground-500">{resultado.sucursalDireccion}</p>
                            </div>
                          </div>
                          {resultado.sucursalTelefono && (
                            <div className="flex items-center gap-3">
                              <Phone className="w-4 h-4 text-foreground-400 flex-shrink-0" />
                              <p className="text-sm text-foreground-700">{resultado.sucursalTelefono}</p>
                            </div>
                          )}
                          {resultado.sucursalHorario && (
                            <div className="flex items-start gap-3">
                              <Clock className="w-4 h-4 text-foreground-400 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground-600">{resultado.sucursalHorario}</p>
                            </div>
                          )}
                        </div>
                        {resultado.sucursalDireccion && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resultado.sucursalDireccion)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-background-50 hover:bg-background-100 border border-background-200/70 text-foreground-700 font-medium rounded-xl text-sm transition-all cursor-pointer"
                          >
                            <MapPin className="w-4 h-4" />
                            Ver ubicación
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─── EN PROCESO ────────────────────────────────────────── */}
                  {isEnProceso && (
                    <div className="bg-white rounded-2xl shadow-md border border-background-200/70 mt-4 overflow-hidden">
                      <div className="p-5 md:p-6 text-center">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-sky-50 flex items-center justify-center">
                          <Clock className="w-7 h-7 text-sky-500" />
                        </div>
                        <p className="text-sm text-foreground-600">
                          Su plástico será notificado tan pronto esté disponible.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </main>

      {/* ─── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="w-full bg-background-100 border-t border-background-200/70 py-6 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs text-foreground-400">
            Farmacia GENOSAN &copy; {new Date().getFullYear()} — Todos los derechos reservados.
          </p>
          <p className="text-xs text-foreground-400 mt-1">
            Para consultas o asistencia, comuníquese al <strong className="text-foreground-600">8493915920</strong> o por{' '}
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">WhatsApp</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── SUB-COMPONENTS ────────────────────────────────────────────────────────

function InfoField({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-foreground-400 mb-1 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-block' : 'text-foreground-950'} ${mono ? 'font-mono tracking-wide' : ''}`}>
        {value}
      </p>
    </div>
  );
}