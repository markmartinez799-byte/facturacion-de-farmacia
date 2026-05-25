import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Branch, CompanySettings } from '@/types';
import { generateId, now } from '@/utils/formatters';
import { supabase } from '@/lib/supabase';
import { fetchBranches, upsertBranch, fetchUsers, upsertUser, deleteUserRemote, deleteBranchRemote, fetchCompanySettings, saveCompanySettings } from '@/services/supabaseService';

export interface AuthState {
  users: User[];
  branches: Branch[];
  currentUser: User | null;
  currentBranch: Branch | null;
  isAuthenticated: boolean;
  openingAmount: number | null;
  companySettings: CompanySettings | null;
  loadCompanySettings: () => Promise<void>;
  saveCompanySettingsDB: (settings: CompanySettings) => Promise<void>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  loginCashier: (userId: string, code: string, branchId: string) => Promise<boolean>;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  updateUserAvatar: (id: string, avatar: string) => void;
  updateUserAvatarRemote: (id: string, avatarUrl: string) => Promise<void>;
  changeAdminPassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  addBranch: (branch: Omit<Branch, 'id' | 'createdAt'>) => Promise<void>;
  updateBranch: (id: string, updates: Partial<Branch>) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;
  setOpeningAmount: (amount: number) => void;
  /** Verifica si el rol actual tiene al menos un permiso. */
  hasRole: (minRole: User['role']) => boolean;
  /** Lista de roles válidos para crear nuevos usuarios. */
  availableRoles: { value: User['role']; label: string }[];
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: [],
      branches: [],
      currentUser: null,
      currentBranch: null,
      isAuthenticated: false,
      openingAmount: null,
      companySettings: null,

      loadCompanySettings: async () => {
        const cs = await fetchCompanySettings();
        if (cs) set({ companySettings: cs });
      },

      saveCompanySettingsDB: async (settings: CompanySettings) => {
        await saveCompanySettings(settings);
        set({ companySettings: settings });
      },

      loginAdmin: async (username, password) => {
        // Always load fresh branches and users from Supabase to avoid stale IDs
        let freshBranches: Branch[] = [];
        try {
          const [remoteUsers, remoteBranches] = await Promise.all([fetchUsers(), fetchBranches()]);
          freshBranches = remoteBranches;
          if (remoteUsers.length > 0) set({ users: remoteUsers });
          if (remoteBranches.length > 0) set({ branches: remoteBranches });
        } catch { /* continue */ }

        // Admin login: permite admin y manager
        const adminRoles: User['role'][] = ['admin', 'manager'];
        const mockUser = get().users.find(
          (u) => adminRoles.includes(u.role) && u.username === username && u.password === password && u.isActive
        );
        if (!mockUser) return false;

        // Try Supabase Auth with email
        const email = `${username}@genosan.com`;
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        let realUserId = mockUser.id;

        if (!authError && authData.user) {
          realUserId = authData.user.id;
          await supabase.from('usuarios_farmacia').upsert({
            id: realUserId,
            nombre: mockUser.name,
            email,
            rol: mockUser.role,
            activo: true,
          }, { onConflict: 'id' });
        } else {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
          });
          if (!signUpError && signUpData.user) {
            realUserId = signUpData.user.id;
            await supabase.from('usuarios_farmacia').upsert({
              id: realUserId,
              nombre: mockUser.name,
              email,
              rol: mockUser.role,
              activo: true,
            }, { onConflict: 'id' });
          }
        }

        const userWithRealId: User = { ...mockUser, id: realUserId };
        const branchList = freshBranches.length > 0 ? freshBranches : get().branches;
        const branch = branchList.find((b) => b.isActive) ?? null;
        set({ currentUser: userWithRealId, currentBranch: branch, isAuthenticated: true });
        return true;
      },

      loginCashier: async (userId, code, branchId) => {
        // Cashier login: permite cashier y supervisor (supervisor puede cobrar también)
        const cashierRoles: User['role'][] = ['cashier', 'supervisor'];
        const user = get().users.find((u) => u.id === userId && cashierRoles.includes(u.role) && u.accessCode === code && u.isActive);
        const branch = get().branches.find((b) => b.id === branchId && b.isActive) ?? null;
        if (user && branch) {
          try {
            await upsertUser(user);
          } catch (syncErr) {
            console.warn('[auth] Error sincronizando cajero con Supabase:', syncErr);
          }
          set({ currentUser: user, currentBranch: branch, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
        supabase.auth.signOut().catch(() => {});
        try {
          localStorage.removeItem('genosan-pos');
        } catch (_) { /* ignore */ }
        set({ currentUser: null, currentBranch: null, isAuthenticated: false, openingAmount: null });
      },

      updateUserAvatarRemote: async (id: string, avatarUrl: string) => {
        await supabase.from('usuarios_farmacia').update({ avatar_url: avatarUrl }).eq('id', id);
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, avatar: avatarUrl } : u)) }));
        const { currentUser } = get();
        if (currentUser?.id === id) {
          set({ currentUser: { ...currentUser, avatar: avatarUrl } });
        }
      },

      changeAdminPassword: async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
        const { currentUser } = get();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
          return { success: false, error: 'Solo el administrador o gerente puede cambiar la contraseña' };
        }
        const email = `${currentUser.username}@genosan.com`;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (signInError) {
          return { success: false, error: 'Contraseña actual incorrecta' };
        }
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          return { success: false, error: updateError.message };
        }
        set((s) => ({
          users: s.users.map((u) => (u.id === currentUser.id ? { ...u, password: newPassword } : u)),
        }));
        return { success: true };
      },

      setOpeningAmount: (amount) => set({ openingAmount: amount }),

      hasRole: (minRole) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        const hierarchy: Record<User['role'], number> = {
          admin: 4,
          manager: 3,
          supervisor: 2,
          cashier: 1,
        };
        return hierarchy[currentUser.role] >= hierarchy[minRole];
      },

      availableRoles: [
        { value: 'admin', label: 'Administrador' },
        { value: 'manager', label: 'Gerente' },
        { value: 'supervisor', label: 'Supervisor' },
        { value: 'cashier', label: 'Cajero' },
      ],

      addUser: async (userData) => {
        // Validar que el rol sea uno de los permitidos
        const validRoles: User['role'][] = ['admin', 'manager', 'supervisor', 'cashier'];
        const role = validRoles.includes(userData.role) ? userData.role : 'cashier';
        const newUser: User = { ...userData, role, id: generateId(), createdAt: now() };
        set((s) => ({ users: [...s.users, newUser] }));
        await upsertUser(newUser).catch(() => {});
      },
      updateUser: async (id, updates) => {
        // Si se actualiza el rol, sanitizar
        if (updates.role) {
          const validRoles: User['role'][] = ['admin', 'manager', 'supervisor', 'cashier'];
          if (!validRoles.includes(updates.role)) {
            updates.role = 'cashier';
          }
        }
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)) }));
        const updated = get().users.find((u) => u.id === id);
        if (updated) await upsertUser(updated).catch(() => {});
      },
      deleteUser: async (id) => {
        set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
        await deleteUserRemote(id).catch(() => {});
      },
      updateUserAvatar: (id, avatar) =>
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, avatar } : u)) })),
      addBranch: async (branchData) => {
        const newBranch: Branch = { ...branchData, id: generateId(), createdAt: now() };
        set((s) => ({ branches: [...s.branches, newBranch] }));
        await upsertBranch(newBranch).catch(() => {});
      },
      updateBranch: async (id, updates) => {
        set((s) => ({ branches: s.branches.map((b) => (b.id === id ? { ...b, ...updates } : b)) }));
        const updated = get().branches.find((b) => b.id === id);
        if (updated) await upsertBranch(updated).catch(() => {});
      },
      deleteBranch: async (id) => {
        set((s) => ({ branches: s.branches.filter((b) => b.id !== id) }));
        await deleteBranchRemote(id).catch(() => {});
      },
    }),
    {
      name: 'genosan-auth',
      partialize: (state) => ({
        users: state.users,
        branches: state.branches,
        currentUser: state.currentUser,
        currentBranch: state.currentBranch,
        isAuthenticated: state.isAuthenticated,
        openingAmount: state.openingAmount,
        // companySettings intentionally excluded — always loaded from DB
      }),
    }
  )
);
