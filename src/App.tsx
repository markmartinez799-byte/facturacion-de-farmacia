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

function AppContent() {
  const { isDarkMode } = useAppStore();
  const { isAuthenticated } = useAuthStore();
  const { loadFromSupabase } = usePOSStore();

  // Activate auto-backup scheduler
  useAutoBackup();

  // Always load fresh branches from Supabase on app start
  // This ensures branch IDs match stock_farmacia records
  useEffect(() => {
    fetchBranches().then((remoteBranches) => {
      if (remoteBranches.length > 0) {
        useAuthStore.setState((s) => {
          // Update branches list
          const updatedBranches = remoteBranches;
          // If currentBranch exists, find the matching one by name to keep correct ID
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
    // Always reload from Supabase when authenticated to ensure fresh stock data
    // This prevents stale localStorage cache from showing "no identificados"
    if (isAuthenticated) {
      loadFromSupabase();
    }
  }, [isAuthenticated, loadFromSupabase]);

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
