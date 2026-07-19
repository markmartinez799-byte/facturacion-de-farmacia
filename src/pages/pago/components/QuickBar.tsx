interface QuickBarProps {
  onNewSale: () => void;
  onFocusSearch: () => void;
  onOpenClient: () => void;
  onOpenInsurance: () => void;
  onOpenStock: () => void;
  onSaveTicket: () => void;
  onOpenExpiring: () => void;
  onOpenDiscount: () => void;
  onCheckout: () => void;
  onOpenReembolsos: () => void;
  onOpenConsultaPlasticos: () => void;
  savedTicketsCount: number;
  expiringCount: number;
}

const SHORTCUTS = [
  { key: 'F1', label: 'Nueva venta', color: 'text-slate-500 dark:text-slate-400' },
  { key: 'F3', label: 'Cliente', color: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'F4', label: 'Seguro', color: 'text-teal-600 dark:text-teal-400' },
  { key: 'F5', label: 'Sucursal', color: 'text-slate-500 dark:text-slate-400' },
  { key: 'F6', label: 'Ticket', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'F7', label: 'Vencer', color: 'text-rose-600 dark:text-rose-400' },
  { key: 'F8', label: 'Descuento', color: 'text-orange-500 dark:text-orange-400' },
  { key: 'F9', label: 'Pagar', color: 'text-emerald-700 dark:text-emerald-300 font-bold' },
  { key: 'F10', label: 'Reembolsos', color: 'text-amber-700 dark:text-amber-300 font-semibold' },
];

export default function QuickBar({
  onNewSale,
  onFocusSearch,
  onOpenClient,
  onOpenInsurance,
  onOpenStock,
  onSaveTicket,
  onOpenExpiring,
  onOpenDiscount,
  onCheckout,
  onOpenReembolsos,
  onOpenConsultaPlasticos,
  savedTicketsCount,
  expiringCount,
}: QuickBarProps) {
  const handlers = [
    onNewSale,
    onOpenClient,
    onOpenInsurance,
    onOpenStock,
    onSaveTicket,
    onOpenExpiring,
    onOpenDiscount,
    onCheckout,
    onOpenReembolsos,
  ];

  const badges: Record<number, number> = {
    4: savedTicketsCount,
    5: expiringCount,
  };

  return (
    <div className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 flex items-center gap-1 overflow-x-auto">
      {SHORTCUTS.map((s, i) => (
        <button
          key={s.key}
          onClick={handlers[i]}
          className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer group ${s.color}`}
          title={s.key === 'F10' ? 'F10 – Reembolsos y Devoluciones (Requiere PIN de Administrador)' : s.label}
        >
          <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
            {s.key}
          </span>
          <span className={`text-xs ${s.color}`}>
            {s.label}
            {s.key === 'F10' && <span className="text-[10px] text-amber-400 dark:text-amber-500 ml-0.5">(Admin)</span>}
          </span>
          {s.key === 'F10' && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none" title="Requiere autorización de administrador">
              <i className="ri-shield-check-line"></i>
            </span>
          )}
          {badges[i] > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
              {badges[i] > 9 ? '9+' : badges[i]}
            </span>
          )}
        </button>
      ))}
      {/* Botón adicional: Consultar Plástico de Seguro (sin shortcut key) */}
      <button
        onClick={onOpenConsultaPlasticos}
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer group text-sky-600 dark:text-sky-400"
        title="Consultar estado de plástico de seguro"
      >
        <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded group-hover:bg-sky-100 dark:group-hover:bg-sky-900/40 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors">
          <i className="ri-shield-check-line text-[10px]"></i>
        </span>
        <span className="text-xs">Plásticos</span>
      </button>
    </div>
  );
}