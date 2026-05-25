import { Outlet, Navigate } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import PharmacyChat from './PharmacyChat';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';

export function Layout() {
  const { isAuthenticated, currentUser } = useAuthStore();
  const { isDarkMode } = useAppStore();

  if (!isAuthenticated) {
    return <Navigate to="/acceso" replace />;
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          {currentUser && currentUser.role !== 'cashier' && <Sidebar />}
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <PharmacyChat />
    </div>
  );
}