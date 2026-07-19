import { useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import PharmacyChat from './PharmacyChat';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';

// Feature flag: set to true to show the AI assistant
const ENABLE_AI_ASSISTANT = false;

export function Layout() {
  const { isAuthenticated, currentUser } = useAuthStore();
  const { isDarkMode } = useAppStore();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  if (!isAuthenticated) {
    return <Navigate to="/acceso" replace />;
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300 h-full">
        <TopBar />
        <div className="flex flex-1 overflow-hidden h-full">
          {currentUser && currentUser.role !== 'cashier' && <Sidebar />}
          <main ref={mainRef} id="main-scroll" className="flex-1 overflow-auto p-4 lg:p-6 min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
      {ENABLE_AI_ASSISTANT && <PharmacyChat />}
    </div>
  );
}