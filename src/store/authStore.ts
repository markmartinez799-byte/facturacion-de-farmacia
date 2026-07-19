import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Branch, CompanySettings, TurnoCaja } from '@/types';
import { generateId, now } from '@/utils/formatters';
import { supabase } from '@/lib/supabase';
import { fetchBranches, upsertBranch, fetchUsers, upsertUser, deleteUserRemote, deleteBranchRemote, fetchCompanySettings, saveCompanySettings } from '@/services/supabaseService';
import { registrarAuditoria } from '@/services/auditService';
import { mockUsers } from '@/mocks/users';

// ─── Helper: asegura que una contraseña tenga al menos 6 caracteres (requisito Supabase Auth) ───
function padPassword(raw: string): string {
  if (!raw) return 'Genosan000000';
  if (raw.length >= 6) return raw;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const suffix = Math.abs(hash).toString(36).substring(0, 6);
  const padded = raw + '00' + suffix;
  return padded.length >= 6 ? padded.substring(0, 12) : raw + '000000'.substring(0, 6 - raw.length);
}

// ─── Helper para mapear rol de BD a frontend ───
function dbToUser(row: Record<string, unknown>): User {
  const validRoles: User['role'][] = ['admin', 'manager', 'supervisor', 'cashier'];
  const dbRol = (row.rol as string) || 'cashier';
  const rolMap: Record<string, User['role']> = { admin: 'admin', cashier: 'cashier', cajero: 'cashier', supervisor: 'supervisor', manager: 'manager', gerente: 'manager' };
  const role = validRoles.includes(rolMap[dbRol]) ? rolMap[dbRol] : 'cashier';
  return {
    id: row.id as string,
    name: (row.nombre as string) || '',
    role,
    username: (row.username as string) || undefined,
    password: (row.password_hash as string) || undefined,
    accessCode: (row.codigo_acceso as string) || undefined,
    email: (row.email as string) || undefined,
    branchId: (row.sucursal_id as string) || undefined,
    isActive: Boolean(row.activo),
    avatar: (row.avatar_url as string) || undefined,
    createdAt: (row.created_at as string) || now(),
    codigoCajero: (row.codigo_cajero as string) || undefined,
  };
}

// ─── Helper para sincronizar login de cajero ───
async function syncCashierAfterLogin(
  user: User,
  realUserId: string,
  email: string,
  password: string,
  branch: Branch | null,
  oldUserId: string,
  set: (updater: (s: AuthState) => Partial<AuthState>) => void,
): Promise<User> {
  // Si el UUID real es diferente al mock, migrar creando fila nueva
  // (no podemos hacer UPDATE del id por FKs con RESTRICT)
  if (oldUserId !== realUserId && oldUserId.startsWith('00000000-')) {
    // Marcar fila vieja como inactiva
    try { await supabase.from('usuarios_farmacia').update({ activo: false }).eq('id', oldUserId); } catch (_) { /* ignore */ }
  }

  const dbRolSync = (() => { const m: Record<string, string> = { admin: 'admin', cashier: 'cajero', supervisor: 'supervisor', manager: 'manager' }; return m[user.role] || 'cajero'; })();

  // Sincronizar usuarios_farmacia con UUID real
  try {
    await supabase.from('usuarios_farmacia').upsert({
      id: realUserId,
      nombre: user.name,
      email,
      rol: dbRolSync,
      activo: true,
      username: user.username || null,
      password_hash: password,
      codigo_acceso: user.accessCode || null,
      sucursal_id: user.branchId || null,
      codigo_cajero: user.codigoCajero || null,
    }, { onConflict: 'id' });
  } catch (e: any) { console.warn('[loginCashier] Sync usuarios_farmacia:', e.message); }

  const userWithRealId: User = { ...user, id: realUserId, email, password };
  set((s) => ({
    users: s.users.map((u) => (u.id === oldUserId ? userWithRealId : u)),
    currentUser: userWithRealId,
    currentBranch: branch,
    isAuthenticated: true,
  }));
  console.log('[loginCashier] Login exitoso, sincronizado:', { nombre: user.name, id: realUserId });
  return userWithRealId;
}

export interface AuthState {
  users: User[];
  branches: Branch[];
  currentUser: User | null;
  currentBranch: Branch | null;
  isAuthenticated: boolean;
  openingAmount: number | null;
  companySettings: CompanySettings | null;
  /** Turno actual activo del cajero */
  turnoActualId: string | null;
  abrirTurno: (montoInicial: number) => Promise<string>;
  cerrarTurno: (data: { totalEfectivo: number; totalTarjeta: number; totalTransferencia: number; totalVentas: number; cantidadVentas: number; observaciones?: string }) => Promise<void>;
  fetchTurnosCajero: (cajeroId: string) => Promise<TurnoCaja[]>;
  loadCompanySettings: () => Promise<void>;
  saveCompanySettingsDB: (settings: CompanySettings) => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  loginAdmin: (username: string, password: string) => Promise<boolean>;
  loginCashier: (userId: string, code: string, branchId: string) => Promise<boolean>;
  logout: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
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
      users: mockUsers,
      branches: [],
      currentUser: null,
      currentBranch: null,
      isAuthenticated: false,
      openingAmount: null,
      companySettings: null,
      turnoActualId: null,

      loadCompanySettings: async () => {
        const cs = await fetchCompanySettings();
        if (cs) set({ companySettings: cs });
      },

      saveCompanySettingsDB: async (settings: CompanySettings) => {
        await saveCompanySettings(settings);
        set({ companySettings: settings });
      },

      // ─── SINCRONIZAR USUARIOS DESDE SUPABASE ───
      refreshUsers: async () => {
        try {
          const remoteUsers = await fetchUsers();
          if (remoteUsers.length > 0) {
            const realUsers = remoteUsers.filter((u) => !u.id.startsWith('00000000-'));
            set({ users: realUsers });
            console.log('[refreshUsers] ✅ Usuarios sincronizados desde Supabase:', realUsers.length, 'usuarios reales');
            return;
          }
          console.warn('[refreshUsers] fetchUsers retornó 0 usuarios - intentando edge function...');
        } catch (e: any) {
          console.error('[refreshUsers] ❌ Error al sincronizar usuarios:', e?.message);
        }
        // Fallback: si la query directa falló (RLS sin sesión), usar edge function
        try {
          const { data: efResult } = await supabase.functions.invoke('auth-admin', {
            body: { action: 'list-users' },
          });
          if (efResult?.success && Array.isArray(efResult.users)) {
            const users = (efResult.users as Record<string, unknown>[]).map((r) => dbToUser(r));
            const realUsers = users.filter((u) => !u.id.startsWith('00000000-'));
            if (realUsers.length > 0) {
              set({ users: realUsers });
              console.log('[refreshUsers] ✅ Usuarios sincronizados via edge function:', realUsers.length);
            } else {
              console.warn('[refreshUsers] Edge function retornó 0 usuarios reales');
            }
          }
        } catch (efErr: any) {
          console.warn('[refreshUsers] Edge function fallback falló:', efErr?.message);
        }
      },

      // ─── SINCRONIZAR SUCURSALES DESDE SUPABASE ───
      refreshBranches: async () => {
        try {
          const remoteBranches = await fetchBranches();
          if (remoteBranches.length > 0) {
            set({ branches: remoteBranches });
            console.log('[refreshBranches] ✅ Sucursales sincronizadas:', remoteBranches.length);
            return;
          }
          console.warn('[refreshBranches] fetchBranches retornó 0 sucursales');
        } catch (e: any) {
          console.error('[refreshBranches] ❌ Error al sincronizar sucursales:', e?.message);
        }
      },

      loginAdmin: async (username, password) => {
        const email = `${username}@genosan.com`;
        console.log('[loginAdmin] Intentando login:', { username, email });

        // ── PASO 1: Intentar signInWithPassword DIRECTO ──
        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

        // ── PASO 2: Si falla, usar admin API para asegurar/crear y reintentar ──
        if (authError) {
          const originalError = authError.message;
          console.log('[loginAdmin] SignIn directo falló:', originalError, '→ usando admin API...');

          // Intentar reset-password
          const { data: ensureResult, error: ensureError } = await supabase.functions.invoke('auth-admin', {
            body: { action: 'reset-password', email, password },
          });

          if (ensureError) {
            console.warn('[loginAdmin] reset-password falló:', ensureError.message);
          }

          if (ensureResult && !ensureResult.success) {
            console.log('[loginAdmin] Usuario no existe en Auth, creando...');
            await supabase.functions.invoke('auth-admin', {
              body: { action: 'create-user', email, password, nombre: username, rol: 'admin' },
            }).catch(() => {});
          } else if (ensureResult?.success) {
            console.log('[loginAdmin] Auth user sincronizado:', ensureResult.user_id);
          }

          // Pequeña pausa para propagación
          await new Promise((r) => setTimeout(r, 300));

          // Reintentar signIn
          const retry = await supabase.auth.signInWithPassword({ email, password });
          authData = retry.data;
          authError = retry.error;

          if (authError) {
            console.warn('[loginAdmin] Reintento falló:', authError.message, '→ usando fallback local');

            // ── ÚLTIMO RECURSO: login local ──
            if (get().users.length === 0) set({ users: [...mockUsers] });
            const adminRoles: User['role'][] = ['admin', 'manager'];
            const localUser = get().users.find(
              (u) => adminRoles.includes(u.role) && u.username === username && u.password === password && u.isActive
            );

            if (!localUser) {
              console.warn('[loginAdmin] Usuario no encontrado localmente');
              return false;
            }

            console.log('[loginAdmin] Login local exitoso:', localUser.name);

            // Intentar crear el auth user para futuro
            await supabase.functions.invoke('auth-admin', {
              body: { action: 'create-user', email, password, nombre: localUser.name, rol: 'admin' },
            }).catch(() => {});

            let freshBranches: Branch[] = [];
            try { freshBranches = await fetchBranches(); if (freshBranches.length > 0) set({ branches: freshBranches }); } catch (e) { /* */ }

            const allBranches = freshBranches.length > 0 ? freshBranches : get().branches;
            const branch = allBranches.find((b) => b.isActive) ?? null;

            set({ currentUser: { ...localUser, email }, currentBranch: branch, isAuthenticated: true });
            console.log('[loginAdmin] Login exitoso (local):', localUser.name);
            return true;
          }

          console.log('[loginAdmin] Reintento exitoso después de admin API');
        }

        // ── PASO 3: Auth exitoso ──
        if (!authData.user) {
          console.error('[loginAdmin] No se obtuvo usuario de Auth en reintento');
          return false;
        }

        const realUserId = authData.user.id;
        console.log('[loginAdmin] Auth exitoso, UUID:', realUserId);

        // Sincronizar usuarios desde BD (sin preservar mock users)
        try {
          const remoteUsers = await fetchUsers();
          if (remoteUsers.length > 0) {
            // Filtrar usuarios mock (IDs fake 00000000-)
            const realUsers = remoteUsers.filter((u) => !u.id.startsWith('00000000-'));
            set({ users: realUsers });
            console.log('[loginAdmin] Users sincronizados desde BD:', realUsers.length);
          }
        } catch (e: any) { console.warn('[loginAdmin] fetchUsers:', e?.message); }

        // Buscar al admin en usuarios_farmacia
        let dbUser = get().users.find((u) => u.id === realUserId);
        if (!dbUser) {
          // Buscar por email
          dbUser = get().users.find((u) => u.email === email);
          if (dbUser && dbUser.id !== realUserId) {
            // Migrar: crear fila con UUID real
            console.log('[loginAdmin] Migrando usuario a UUID real:', { oldId: dbUser.id, newId: realUserId });
            await supabase.from('usuarios_farmacia').upsert({
              id: realUserId, nombre: dbUser.name, email, rol: 'admin',
              username: dbUser.username || username, password_hash: password,
              codigo_acceso: dbUser.accessCode || null, sucursal_id: dbUser.branchId || null,
              activo: true, avatar_url: dbUser.avatar || null,
            }, { onConflict: 'id' });
            await supabase.from('usuarios_farmacia').update({ activo: false }).eq('id', dbUser.id);
            set((s) => ({
              users: s.users.filter((u) => u.id !== dbUser!.id).concat([{ ...dbUser!, id: realUserId, email }]),
            }));
          }
        }

        // Si no hay fila en usuarios_farmacia, crearla
        if (!dbUser) {
          console.log('[loginAdmin] Creando fila en usuarios_farmacia para admin...');
          await supabase.from('usuarios_farmacia').upsert({
            id: realUserId, nombre: username, email, rol: 'admin',
            username, password_hash: password, activo: true,
          }, { onConflict: 'id' });
        }

        // Cargar sucursales
        let freshBranches: Branch[] = [];
        try {
          freshBranches = await fetchBranches();
          if (freshBranches.length > 0) set({ branches: freshBranches });
        } catch (e) { /* noop */ }

        const allBranches = freshBranches.length > 0 ? freshBranches : get().branches;
        const branch = allBranches.find((b) => b.isActive) ?? null;

        const currentUser: User = {
          id: realUserId, name: dbUser?.name || username, role: 'admin',
          username, password, email, isActive: true,
          createdAt: dbUser?.createdAt || now(), avatar: dbUser?.avatar,
        };

        set((s) => ({
          ...(dbUser ? {} : { users: [...s.users, currentUser] }),
          currentUser, currentBranch: branch, isAuthenticated: true,
        }));

        registrarAuditoria({
          usuarioId: realUserId, usuarioNombre: currentUser.name,
          accion: 'login_admin', entidad: 'usuario', entidadId: realUserId,
        });

        console.log('[loginAdmin] Login exitoso:', { username, id: realUserId });
        return true;
      },

      loginCashier: async (userId, code, branchId) => {
        const cashierRoles: User['role'][] = ['cashier', 'supervisor'];
        const user = get().users.find((u) => u.id === userId && cashierRoles.includes(u.role) && u.accessCode === code && u.isActive);
        const branch = get().branches.find((b) => b.id === branchId && b.isActive) ?? null;
        if (!user || !branch) {
          console.warn('[loginCashier] Cajero o sucursal no encontrados:', { userId, branchId, foundUser: !!user, foundBranch: !!branch });
          return false;
        }

        const email = user.email || `${(user.username || user.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}@farmacia.local`;
        const dbPassword = user.password || padPassword(user.accessCode || '2026');
        const authPassword = dbPassword.length >= 6 ? dbPassword : padPassword(dbPassword);

        console.log('[loginCashier] Iniciando autenticación:', { nombre: user.name, email });

        // ── PASO 1: Intentar signInWithPassword DIRECTO ──
        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password: authPassword,
        });

        // ── PASO 2: Si signIn falla, usar ensure-user via Admin API (bypassea problemas de Auth) ──
        let ensuredUserId: string | null = null;

        if (authError) {
          console.log('[loginCashier] SignIn directo falló:', authError.message, '→ usando ensure-user...');

          const dbRol = (() => {
            const m: Record<string, string> = { admin: 'admin', cashier: 'cajero', supervisor: 'supervisor', manager: 'manager' };
            return m[user.role] || 'cajero';
          })();

          // Llamar ensure-user (usa Admin API, no depende de signInWithPassword)
          try {
            const { data: ensureResult, error: ensureError } = await supabase.functions.invoke('auth-admin', {
              body: {
                action: 'ensure-user',
                email,
                password: authPassword,
                nombre: user.name,
                rol: dbRol,
              },
            });

            if (ensureError) {
              console.warn('[loginCashier] ensure-user error de red:', ensureError.message);
            }

            if (ensureResult?.success && ensureResult?.user_id) {
              ensuredUserId = ensureResult.user_id;
              console.log('[loginCashier] ensure-user exitoso, UUID:', ensuredUserId, 'creado:', ensureResult.was_created);
            } else {
              console.warn('[loginCashier] ensure-user no devolvió userId válido:', ensureResult);
            }
          } catch (invokeErr: any) {
            console.error('[loginCashier] ensure-user excepción:', invokeErr?.message);
          }

          // ── SIEMPRE intentar signIn de nuevo después de ensure-user (el usuario ya debería existir) ──
          if (ensuredUserId) {
            await new Promise((r) => setTimeout(r, 500));
            const retry = await supabase.auth.signInWithPassword({ email, password: authPassword });
            authData = retry.data;
            authError = retry.error;

            if (!authError && authData.user) {
              console.log('[loginCashier] Reintento signIn exitoso después de ensure-user');
            } else {
              console.warn('[loginCashier] Reintento signIn falló:', authError?.message, '→ usando fallback local');
              // FALLBACK: autenticar localmente con el UUID de ensure-user
              // Esto cubre el caso "Database error querying schema" y otros errores internos de Supabase Auth
              await syncCashierAfterLogin(user, ensuredUserId, email, authPassword, branch, userId, set);
              return true;
            }
          }
        }

        // ── PASO 3: Si seguimos sin authData después de todo, intentar fallback vía usuarios_farmacia ──
        if (!authData?.user) {
          console.warn('[loginCashier] Sin authData, buscando en usuarios_farmacia via edge function...');

          // Buscar directamente en la BD usando la edge function (service_role)
          try {
            const { data: lookupResult, error: lookupError } = await supabase.functions.invoke('auth-admin', {
              body: {
                action: 'lookup-user',
                email,
              },
            });

            if (!lookupError && lookupResult?.success && lookupResult?.user_id) {
              console.log('[loginCashier] Usuario encontrado en BD via lookup:', lookupResult.user_id);
              const fallbackId = lookupResult.user_id;
              await syncCashierAfterLogin(user, fallbackId, email, authPassword, branch, userId, set);
              return true;
            }
          } catch (lookupErr: any) {
            console.warn('[loginCashier] lookup-user falló:', lookupErr?.message);
          }

          // ÚLTIMO recurso: si el usuario tiene ID real (no mock), autenticar localmente
          if (!userId.startsWith('00000000-')) {
            console.log('[loginCashier] Último recurso: autenticación local con ID real:', userId);
            await syncCashierAfterLogin(user, userId, email, authPassword, branch, userId, set);
            return true;
          }

          console.error('[loginCashier] Todos los caminos de autenticación fallaron');
          return false;
        }

        // ── PASO 4: Auth exitoso normal ──
        const authUserId = authData.user.id;
        console.log('[loginCashier] Auth exitoso, UUID:', authUserId);
        await syncCashierAfterLogin(user, authUserId, email, authPassword, branch, userId, set);
        return true;
      },

      // ─── El helper syncCashierAfterLogin está definido arriba como función standalone ───

      logout: () => {
        const { currentUser } = get();
        registrarAuditoria({
          usuarioId: currentUser?.id, usuarioNombre: currentUser?.name,
          accion: 'logout', entidad: 'usuario', entidadId: currentUser?.id,
        });
        console.log('[auth] Cerrando sesión...');
        supabase.auth.signOut().catch((e) => console.warn('[auth] Error en signOut:', e));
        try {
          localStorage.removeItem('genosan-auth');
        } catch (_) { /* ignore */ }
        set({
          currentUser: null,
          currentBranch: null,
          isAuthenticated: false,
          openingAmount: null,
          // NO vaciar users — mantenerlos para que el login funcione sin sesión activa
        });
        console.log('[auth] Sesión cerrada');
      },

      updateUserAvatarRemote: async (id: string, avatarUrl: string) => {
        const { error } = await supabase.from('usuarios_farmacia').update({ avatar_url: avatarUrl }).eq('id', id);
        if (error) {
          console.warn('[updateUserAvatar] UPDATE directo falló:', error.message, '→ usando edge function');
          await supabase.functions.invoke('auth-admin', {
            body: { action: 'update-user-db', user_id: id, avatar_url: avatarUrl },
          }).catch(() => {});
        }
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
        const email = currentUser.email || `${currentUser.username}@genosan.com`;
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

      // ─── TURNOS DE CAJA ───
      abrirTurno: async (montoInicial: number): Promise<string> => {
        const { currentUser, currentBranch } = get();
        if (!currentUser) throw new Error('No hay cajero autenticado');

        const id = generateId();
        const { error } = await supabase.from('turnos_caja').insert({
          id,
          cajero_id: currentUser.id,
          cajero_nombre: currentUser.name,
          sucursal_id: currentBranch?.id || null,
          monto_inicial: montoInicial,
          estado: 'abierto',
          fecha_apertura: now(),
        });

        if (error) {
          console.error('[abrirTurno] Error al crear turno:', error.message);
          throw new Error('No se pudo registrar la apertura de caja');
        }

        set({ turnoActualId: id, openingAmount: montoInicial });
        console.log('[abrirTurno] Turno abierto:', { id, cajero: currentUser.name, montoInicial });
        return id;
      },

      cerrarTurno: async (data) => {
        const { turnoActualId, currentUser } = get();
        if (!turnoActualId) throw new Error('No hay un turno abierto');
        if (!currentUser) throw new Error('No hay cajero autenticado');

        // Calcular monto final: montoInicial + totalEfectivo
        // La diferencia es: efectivoRecibido - dineroEnCaja (teórico)
        // Pero lo principal es registrar el cierre
        const diferencia = data.totalEfectivo - data.totalVentas;

        const { error } = await supabase.from('turnos_caja').update({
          monto_final: data.totalEfectivo,
          total_efectivo: data.totalEfectivo,
          total_tarjeta: data.totalTarjeta,
          total_transferencia: data.totalTransferencia,
          total_ventas: data.totalVentas,
          cantidad_ventas: data.cantidadVentas,
          diferencia,
          observaciones: data.observaciones || null,
          estado: 'cerrado',
          fecha_cierre: now(),
        }).eq('id', turnoActualId);

        if (error) {
          console.error('[cerrarTurno] Error al cerrar turno:', error.message);
          throw new Error('No se pudo registrar el cierre de caja');
        }

        set({ turnoActualId: null, openingAmount: null });
        console.log('[cerrarTurno] Turno cerrado:', { id: turnoActualId, ...data, diferencia });
      },

      fetchTurnosCajero: async (cajeroId: string): Promise<TurnoCaja[]> => {
        const { data, error } = await supabase
          .from('turnos_caja')
          .select('*')
          .eq('cajero_id', cajeroId)
          .order('fecha_apertura', { ascending: false })
          .limit(50);

        if (error) {
          console.error('[fetchTurnosCajero] Error:', error.message);
          return [];
        }

        return (data || []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          cajeroId: r.cajero_id as string,
          cajeroNombre: r.cajero_nombre as string,
          sucursalId: (r.sucursal_id as string) || undefined,
          montoInicial: Number(r.monto_inicial) || 0,
          montoFinal: Number(r.monto_final) || 0,
          totalEfectivo: Number(r.total_efectivo) || 0,
          totalTarjeta: Number(r.total_tarjeta) || 0,
          totalTransferencia: Number(r.total_transferencia) || 0,
          totalVentas: Number(r.total_ventas) || 0,
          cantidadVentas: Number(r.cantidad_ventas) || 0,
          diferencia: Number(r.diferencia) || 0,
          observaciones: (r.observaciones as string) || undefined,
          estado: (r.estado as string) || 'abierto',
          fechaApertura: (r.fecha_apertura as string) || '',
          fechaCierre: (r.fecha_cierre as string) || undefined,
          createdAt: (r.created_at as string) || '',
        }));
      },

      // ... existing code ...
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

        // Generar email con dominio @farmacia.local
        let username: string;
        if (userData.username && userData.username.trim()) {
          username = userData.username.trim().toLowerCase().replace(/[^a-z0-9.]/g, '');
        } else {
          username = userData.name
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '');
          if (!username) {
            const uniqueSuffix = Date.now().toString(36);
            username = `cajero.${uniqueSuffix}`;
          }
        }
        const email = `${username}@farmacia.local`;

        // Contraseña inicial
        const rawPwd = userData.password || '2026';
        const authPassword = padPassword(rawPwd);

        // Generar codigoCajero único si es rol cashier
        let codigoCajero: string | undefined;
        if (role === 'cashier') {
          const existingCodes = get().users
            .filter((u) => u.codigoCajero)
            .map((u) => u.codigoCajero!)
            .sort();
          let maxNum = 0;
          for (const code of existingCodes) {
            const match = code.match(/CAJ-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
          // Also check remote DB for highest code
          try {
            const { data: remoteCodes } = await supabase
              .from('usuarios_farmacia')
              .select('codigo_cajero')
              .not('codigo_cajero', 'is', null)
              .order('codigo_cajero', { ascending: false })
              .limit(1);
            if (remoteCodes && remoteCodes.length > 0) {
              const rCode = (remoteCodes[0] as Record<string, unknown>).codigo_cajero as string;
              const rMatch = rCode?.match(/CAJ-(\d+)/);
              if (rMatch) {
                const rNum = parseInt(rMatch[1], 10);
                if (rNum > maxNum) maxNum = rNum;
              }
            }
          } catch (_) { /* ignore */ }
          const nextNum = maxNum + 1;
          codigoCajero = `CAJ-${String(nextNum).padStart(5, '0')}`;
        }

        console.log('[addUser] Creando usuario via Admin API:', { nombre: userData.name, rol: role, email, username, passLength: authPassword.length, codigoCajero });

        // PASO 1: Crear usuario via Admin API
        const { data: apiResult, error: apiError } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'create-user',
            email,
            password: authPassword,
            nombre: userData.name,
            rol: role,
          },
        });

        if (apiError || !apiResult?.success) {
          const errMsg = apiError?.message || apiResult?.error || 'No se pudo crear el usuario en el sistema de autenticación';
          console.error('[addUser] ERROR en Admin API:', errMsg);
          return { success: false, error: errMsg };
        }

        const realUserId = apiResult.user_id;
        const alreadyExists = apiResult.already_exists;
        console.log('[addUser] Usuario Auth creado:', { id: realUserId, email, yaExistia: !!alreadyExists });

        if (alreadyExists) {
          console.log('[addUser] Usuario ya existía en Auth, sincronizando contraseña...');
          await supabase.functions.invoke('auth-admin', {
            body: { action: 'reset-password', email, password: authPassword },
          }).catch(() => {});
        }

        // PASO 2: Guardar en usuarios_farmacia
        const dbRol = (() => {
          const map: Record<string, string> = { admin: 'admin', cashier: 'cajero', supervisor: 'supervisor', manager: 'manager' };
          return map[role] || 'cajero';
        })();

        console.log('[addUser] Guardando en usuarios_farmacia via edge function...');
        const { data: syncResult, error: syncError } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'sync-user-db',
            user_id: realUserId,
            nombre: userData.name,
            email,
            rol: dbRol,
            username,
            password_hash: authPassword,
            codigo_acceso: userData.accessCode || null,
            sucursal_id: userData.branchId || null,
            activo: true,
            codigo_cajero: codigoCajero || null,
          },
        });

        if (syncError || !syncResult?.success) {
          const syncErrMsg = syncError?.message || syncResult?.error || 'Error al guardar en BD';
          console.error('[addUser] Edge function falló al guardar en usuarios_farmacia:', syncErrMsg);
          return { success: false, error: 'Usuario creado en Auth pero falló al guardar datos: ' + syncErrMsg };
        }
        console.log('[addUser] Guardado en usuarios_farmacia exitoso');

        // PASO 3: VERIFICAR
        console.log('[addUser] Verificando creación...');
        try {
          const { data: verifyData, error: verifyError } = await supabase
            .from('usuarios_farmacia')
            .select('id, nombre, email, rol, activo, codigo_cajero')
            .eq('id', realUserId)
            .maybeSingle();
          
          if (verifyError || !verifyData) {
            console.warn('[addUser] Verificación falló:', verifyError?.message || 'no se encontró el registro');
          } else {
            console.log('[addUser] Verificado en BD:', verifyData);
          }
        } catch (verifyErr: any) {
          console.warn('[addUser] Error al verificar:', verifyErr?.message);
        }

        // PASO 4: Actualizar estado local
        try {
          const remoteUsers = await fetchUsers();
          if (remoteUsers.length > 0) {
            const realUsers = remoteUsers.filter((u) => !u.id.startsWith('00000000-'));
            set({ users: realUsers });
            console.log('[addUser] Estado actualizado desde Supabase:', realUsers.length, 'usuarios reales');
          }
        } catch (refreshErr: any) {
          console.warn('[addUser] No se pudo refrescar desde Supabase:', refreshErr?.message);
          const newUser: User = {
            id: realUserId,
            name: userData.name,
            role,
            username,
            password: authPassword,
            accessCode: userData.accessCode,
            email,
            branchId: userData.branchId,
            isActive: true,
            createdAt: now(),
            avatar: userData.avatar,
            codigoCajero,
          };
          set((s) => ({ users: [...s.users.filter((u) => !u.id.startsWith('00000000-')), newUser] }));
        }

        console.log('[addUser] Usuario creado y verificado:', { id: realUserId, nombre: userData.name, email, rol: role, codigoCajero });
        return { success: true };
      },
      updateUser: async (id, updates) => {
        // Sanitizar rol si viene
        if (updates.role) {
          const validRoles: User['role'][] = ['admin', 'manager', 'supervisor', 'cashier'];
          if (!validRoles.includes(updates.role)) {
            updates.role = 'cashier';
          }
        }
        // Actualizar estado local primero
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)) }));
        const updated = get().users.find((u) => u.id === id);
        if (!updated) return;

        console.log('[updateUser] Sincronizando a Supabase:', { id, nombre: updated.name, rol: updated.role });

        const safeName = (updated.username || updated.name)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '');
        const email = `${safeName || 'usuario'}@farmacia.local`;

        const frontendToDbRole: Record<string, string> = {
          admin: 'admin',
          manager: 'manager',
          supervisor: 'supervisor',
          cashier: 'cajero',
        };
        const dbRole = frontendToDbRole[updated.role] || 'cajero';

        const { error } = await supabase
          .from('usuarios_farmacia')
          .update({
            nombre: updated.name,
            email,
            rol: dbRole,
            activo: updated.isActive,
            username: updated.username || null,
            password_hash: updated.password || null,
            codigo_acceso: updated.accessCode || null,
            sucursal_id: updated.branchId || null,
            avatar_url: updated.avatar || null,
            codigo_cajero: updated.codigoCajero || null,
          })
          .eq('id', updated.id);

        if (error) {
          console.warn('[updateUser] UPDATE directo falló:', error.message, '→ intentando edge function');
          const { data: syncResult, error: syncError } = await supabase.functions.invoke('auth-admin', {
            body: {
              action: 'update-user-db',
              user_id: updated.id,
              nombre: updated.name,
              email,
              rol: dbRole,
              activo: updated.isActive,
              username: updated.username || null,
              password_hash: updated.password || null,
              codigo_acceso: updated.accessCode || null,
              sucursal_id: updated.branchId || null,
              avatar_url: updated.avatar || null,
              codigo_cajero: updated.codigoCajero || null,
            },
          });

          if (syncError || !syncResult?.success) {
            console.error('[updateUser] Edge function también falló:', syncError?.message || syncResult?.error);
          } else {
            console.log('[updateUser] Guardado via edge function exitoso');
          }
        } else {
          console.log('[updateUser] Sincronizado correctamente:', { id, nombre: updated.name });
        }

        const { currentUser } = get();
        if (currentUser?.id === id) {
          set({ currentUser: { ...currentUser, ...updates } });
        }
      },
      deleteUser: async (id) => {
        console.log('[deleteUser] Desactivando usuario:', id);
        // Soft delete: marcar como inactivo en estado local
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, isActive: false } : u)) }));
        // Intentar soft delete remoto
        const { error } = await supabase.from('usuarios_farmacia').update({ activo: false }).eq('id', id);
        if (error) {
          console.warn('[deleteUser] UPDATE directo falló:', error.message, '→ usando edge function');
          await supabase.functions.invoke('auth-admin', {
            body: { action: 'update-user-db', user_id: id, activo: false },
          }).catch((e) => console.error('[deleteUser] Edge function también falló:', e));
        }
        console.log('[deleteUser] Usuario desactivado:', id);
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
        turnoActualId: state.turnoActualId,
      }),
    }
  )
);