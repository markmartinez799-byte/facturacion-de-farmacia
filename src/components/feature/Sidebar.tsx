import { useRef, useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Settings, CreditCard, Truck, ShoppingBag, AlertTriangle, Heart, ScanLine, RotateCcw, Users, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePOSStore } from '@/store/posStore';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles: ('admin' | 'cashier' | 'supervisor' | 'manager')[];
}

const navItems: NavItem[] = [
  { path: '/panel', label: 'Panel', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor'] },
  { path: '/pago', label: 'Facturar', icon: <CreditCard className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor', 'cashier'] },
  { path: '/productos', label: 'ING de Productos', icon: <Package className="w-5 h-5" />, roles: ['admin', 'manager'] },
  { path: '/cajeros', label: 'Cajeros', icon: <Users className="w-5 h-5" />, roles: ['admin', 'manager'] },
  { path: '/proveedores', label: 'Proveedores', icon: <Truck className="w-5 h-5" />, roles: ['admin', 'manager'] },
  { path: '/compras', label: 'Compras', icon: <ShoppingBag className="w-5 h-5" />, roles: ['admin', 'manager'] },
  { path: '/vencimientos', label: 'Vencimientos', icon: <AlertTriangle className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor'] },
  { path: '/lista-interes', label: 'Lista de Interés', icon: <Heart className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor', 'cashier'] },
  { path: '/buscar-factura', label: 'Buscar Factura', icon: <ScanLine className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor', 'cashier'] },
  { path: '/reembolsos', label: 'Reembolsos', icon: <RotateCcw className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor'] },
  { path: '/plasticos-seguros', label: 'Plásticos Seguros', icon: <Shield className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor', 'cashier'] },
  { path: '/reportes', label: 'Reportes', icon: <BarChart3 className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor'] },
  { path: '/configuracion', label: 'Configuración', icon: <Settings className="w-5 h-5" />, roles: ['admin', 'manager', 'supervisor', 'cashier'] },
];

const AUTO_HIDE_DELAY = 6000; // 6 seconds

export function Sidebar() {
  const { currentUser } = useAuthStore();
  const { products } = usePOSStore();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(true);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const edgeZoneRef = useRef<HTMLDivElement>(null);

  const filteredItems = navItems.filter((item) =>
    currentUser ? item.roles.includes(currentUser.role) : false
  );

  const expiringCount = products.filter((p) => {
    if (!p.expiryDate || !p.isActive) return false;
    const expiry = new Date(p.expiryDate);
    if (isNaN(expiry.getTime())) return false;
    const today = new Date();
    const diff = expiry.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 30;
  }).length;

  const clearAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const startAutoHide = useCallback(() => {
    clearAutoHide();
    autoHideTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, AUTO_HIDE_DELAY);
  }, [clearAutoHide]);

  const openSidebar = useCallback(() => {
    setIsOpen(true);
    startAutoHide();
  }, [startAutoHide]);

  const closeSidebar = useCallback(() => {
    clearAutoHide();
    setIsOpen(false);
  }, [clearAutoHide]);

  const toggleSidebar = useCallback(() => {
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }, [isOpen, openSidebar, closeSidebar]);

  // Start auto-hide timer on mount
  useEffect(() => {
    startAutoHide();
    return () => clearAutoHide();
  }, [startAutoHide, clearAutoHide]);

  // Reset auto-hide timer on mouse activity inside sidebar
  const handleSidebarMouseEnter = useCallback(() => {
    clearAutoHide();
  }, [clearAutoHide]);

  const handleSidebarMouseLeave = useCallback(() => {
    if (isOpen) {
      startAutoHide();
    }
  }, [isOpen, startAutoHide]);

  // Open on edge hover when closed
  const handleEdgeMouseEnter = useCallback(() => {
    if (!isOpen) {
      openSidebar();
    }
  }, [isOpen, openSidebar]);

  if (!currentUser) return null;

  return (
    <>
      {/* Edge hover zone — visible only when sidebar is closed */}
      {!isOpen && (
        <div
          ref={edgeZoneRef}
          onMouseEnter={handleEdgeMouseEnter}
          className="fixed left-0 top-0 bottom-0 w-3 z-40 cursor-pointer"
          style={{ marginTop: '56px' }}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={`
          relative flex-shrink-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700
          flex flex-col transition-all duration-300 ease-in-out overflow-hidden
          h-[calc(100vh-56px)]
          ${isOpen ? 'w-64' : 'w-0'}
        `}
        style={{ minHeight: 0 }}
      >
        {/* Inner content — always rendered but clipped by width */}
        <div className="w-64 flex flex-col h-full">
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
            {filteredItems.map((item) => {
              const isActive = location.pathname === item.path;
              const showBadge = item.path === '/vencimientos' && expiringCount > 0;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => startAutoHide()}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white min-w-[20px] text-center">
                      {expiringCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1 whitespace-nowrap">Sistema</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">GENOSAN v1.0</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-nowrap">Cumple DGII</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Toggle button — floats on the edge of the sidebar */}
      <button
        onClick={toggleSidebar}
        title={isOpen ? 'Ocultar panel' : 'Mostrar panel'}
        className={`
          fixed top-1/2 -translate-y-1/2 z-50
          w-5 h-10 flex items-center justify-center
          bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          rounded-r-lg cursor-pointer
          transition-all duration-300 ease-in-out
          hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-300
          shadow-sm
        `}
        style={{ left: isOpen ? '256px' : '0px' }}
      >
        <i
          className={`ri-arrow-left-s-line text-slate-500 dark:text-slate-400 text-sm transition-transform duration-300 ${
            isOpen ? '' : 'rotate-180'
          }`}
        ></i>
      </button>
    </>
  );
}
