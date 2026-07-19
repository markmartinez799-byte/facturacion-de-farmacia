import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useAppStore } from "./store/appStore";
import { useAuthStore } from "./store/authStore";
import { usePOSStore } from "./store/posStore";
import { useEffect } from "react";
import { fetchBranches } from "./services/supabaseService";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { subscribeToProductChanges } from "@/services/realtimeSync";

function AppContent() {
  const { isDarkMode } = useAppStore();
  const { isAuthenticated } = useAuthStore();
  const { loadFromSupabase } = usePOSStore();

  // Activate auto-backup scheduler
  useAutoBackup();

  // Always load fresh branches from Supabase on app start
  useEffect(() => {
    fetchBranches().then((remoteBranches) => {
      if (remoteBranches.length > 0) {
        useAuthStore.setState((s) => {
          const updatedBranches = remoteBranches;
          let updatedCurrentBranch = s.currentBranch;
          if (s.currentBranch) {
            const matched = remoteBranches.find(
              (b) => b.id === s.currentBranch!.id || b.name === s.currentBranch!.name
            );
            if (matched) updatedCurrentBranch = matched;
          }
          return { branches: updatedBranches, currentBranch: updatedCurrentBranch };
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadFromSupabase();
    }
  }, [isAuthenticated, loadFromSupabase]);

  // ── Realtime sync: keep products fresh across all clients ──
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = subscribeToProductChanges();
    return () => unsubscribe();
  }, [isAuthenticated]);

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <AppRoutes />
    </div>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter basename={__BASE_PATH__}>
        <AppContent />
      </BrowserRouter>
    </I18nextProvider>
  );
}

export default App;
