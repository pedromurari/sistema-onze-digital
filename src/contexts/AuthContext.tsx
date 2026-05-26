import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AccessPermissions, getDefaultPermissions, normalizePermissionsRow, permissionsToRow } from '@/lib/access-control';

export type UserRole = 'admin' | 'vendedor' | 'professora';

export interface Profile {
  id: string;
  nome: string;
  email: string;
  cor: string;
  avatar?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  tipo: UserRole;
  cor: string;
  avatar?: string;
  ativo: boolean;
  criadoEm: string;
  permissions: AccessPermissions;
}

interface AuthContextType {
  user: AppUser | null;
  users: AppUser[];
  loading: boolean;
  login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  addUser: (userData: { nome: string; email: string; senha: string; tipo: UserRole; cor: string }) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  updateUser: (id: string, data: Partial<{ nome: string; cor: string; ativo: boolean; tipo: UserRole }>) => Promise<{ success: boolean; error?: string }>;
  updateUserPermissions: (id: string, permissions: AccessPermissions) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  getActiveVendedores: () => AppUser[];
  getUserById: (id: string) => AppUser | undefined;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── sessionStorage cache para lista de usuários (TTL 10 min) ─────────────────
const USERS_CACHE_KEY = 'auth_users_v1';
const USERS_CACHE_TTL = 10 * 60 * 1000;

function readUsersCache(): AppUser[] | null {
  try {
    const raw = sessionStorage.getItem(USERS_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > USERS_CACHE_TTL) { sessionStorage.removeItem(USERS_CACHE_KEY); return null; }
    return data as AppUser[];
  } catch { return null; }
}

function writeUsersCache(users: AppUser[]) {
  try { sessionStorage.setItem(USERS_CACHE_KEY, JSON.stringify({ data: users, ts: Date.now() })); } catch { /* quota */ }
}

function clearUsersCache() {
  try { sessionStorage.removeItem(USERS_CACHE_KEY); } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<AppUser | null>(null);
  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 3 queries em paralelo para o usuário atual
  const getCurrentUser = async (authUser: User): Promise<AppUser | null> => {
    try {
      const [
        { data: profile,       error: profileError     },
        { data: roleData,      error: roleError        },
        { data: permissionsRow, error: permissionsError },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', authUser.id).maybeSingle(),
        (supabase as any).from('user_access_permissions').select('*').eq('user_id', authUser.id).maybeSingle(),
      ]);

      if (profileError) { console.error('Error fetching profile:', profileError); return null; }
      if (!profile) return null;
      if (!profile.ativo) { await supabase.auth.signOut(); return null; }
      if (roleError) console.error('Error fetching role:', roleError);
      if (permissionsError && permissionsError.code !== '42P01') console.error('Error fetching permissions:', permissionsError);

      return {
        id:          profile.id,
        nome:        profile.nome,
        email:       profile.email,
        tipo:        (roleData?.role as UserRole) || 'vendedor',
        cor:         profile.cor,
        avatar:      profile.avatar ?? undefined,
        ativo:       profile.ativo,
        criadoEm:    profile.created_at,
        permissions: normalizePermissionsRow(permissionsRow, roleData?.role),
      };
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      return null;
    }
  };

  // 3 queries em paralelo — usa cache de sessionStorage quando disponível
  const fetchUsers = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = readUsersCache();
      if (cached) { setUsers(cached); return; }
    }
    try {
      const [
        { data: profiles, error: profilesError },
        { data: roles,    error: rolesError    },
        { data: permRows, error: permErr       },
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        (supabase as any).from('user_access_permissions').select('*'),
      ]);

      if (profilesError) { console.error('Error fetching profiles:', profilesError); return; }
      if (rolesError)    { console.error('Error fetching roles:', rolesError); return; }
      if (permErr && permErr.code !== '42P01') console.error('Error fetching permissions:', permErr);

      const appUsers: AppUser[] = (profiles || []).map((profile: Profile) => {
        const userRole = (roles    || []).find((r: { user_id: string; role: UserRole }) => r.user_id === profile.id);
        const permRow  = (permRows || []).find((p: { user_id: string }) => p.user_id === profile.id);
        return {
          id:          profile.id,
          nome:        profile.nome,
          email:       profile.email,
          tipo:        (userRole?.role as UserRole) || 'vendedor',
          cor:         profile.cor,
          avatar:      profile.avatar ?? undefined,
          ativo:       profile.ativo,
          criadoEm:    profile.created_at,
          permissions: normalizePermissionsRow(permRow, userRole?.role),
        };
      });

      setUsers(appUsers);
      writeUsersCache(appUsers);
    } catch (error) {
      console.error('Error in fetchUsers:', error);
    }
  };

  // Initialize auth — single path via onAuthStateChange com INITIAL_SESSION
  useEffect(() => {
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        if (session?.user) {
          // Defer com setTimeout para evitar deadlock interno do Supabase SDK
          setTimeout(async () => {
            const appUser = await getCurrentUser(session.user);
            setUser(appUser);
            if (!initialised) {
              await fetchUsers(); // usa cache se disponível — evita 3 queries no reload
              initialised = true;
            }
            setLoading(false);
          }, 0);
        } else {
          setUser(null);
          setUsers([]);
          clearUsersCache();
          setLoading(false);
          initialised = true;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, senha: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });

      if (error) { console.error('Login error:', error); return { success: false, error: error.message }; }

      if (data.user) {
        const appUser = await getCurrentUser(data.user);
        if (!appUser) {
          await supabase.auth.signOut();
          return { success: false, error: 'Usuário não encontrado ou inativo.' };
        }
        setUser(appUser);
        await fetchUsers(true); // força refresh após login
        return { success: true };
      }

      return { success: false, error: 'Erro desconhecido no login.' };
    } catch (error) {
      console.error('Login exception:', error);
      return { success: false, error: 'Erro ao fazer login.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUsers([]);
    clearUsersCache();
  };

  const addUser = async (userData: { nome: string; email: string; senha: string; tipo: UserRole; cor: string }): Promise<{ success: boolean; error?: string; user?: AppUser }> => {
    try {
      const isFirstUser = users.length === 0;
      const userRole    = isFirstUser ? 'admin' : userData.tipo;
      const email       = userData.email.trim().toLowerCase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) return { success: false, error: 'Sessao expirada. Entre novamente e tente de novo.' };

      const createResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome: userData.nome, email, password: userData.senha, tipo: userRole === 'admin' ? 'admin' : 'vendedor', cor: userData.cor }),
      });

      let createdData: any = null;
      let functionErrorMessage = '';
      try {
        createdData = await createResponse.clone().json();
        functionErrorMessage = createdData?.error || '';
      } catch {
        functionErrorMessage = await createResponse.clone().text();
      }

      const createdUserId = createdData?.user?.id;
      if (!createResponse.ok || !createdData?.success || !createdUserId) {
        console.error('Admin create user error:', createResponse.status, createdData || functionErrorMessage);
        return { success: false, error: functionErrorMessage || `Erro ao criar usuario. Status ${createResponse.status}.` };
      }

      const defaultPermissions = getDefaultPermissions(userRole);
      const { error: permissionsError } = await (supabase as any)
        .from('user_access_permissions')
        .upsert({ user_id: createdUserId, ...permissionsToRow(defaultPermissions) }, { onConflict: 'user_id' });

      if (permissionsError && permissionsError.code !== '42P01') {
        console.error('Permissions creation error:', permissionsError);
        return { success: false, error: 'Erro ao definir permissões do usuário.' };
      }

      await fetchUsers(true); // força refresh para incluir novo usuário

      return {
        success: true,
        user: { id: createdUserId, nome: userData.nome, email, tipo: userRole, cor: userData.cor, ativo: true, criadoEm: new Date().toISOString(), permissions: defaultPermissions },
      };
    } catch (error) {
      console.error('AddUser exception:', error);
      return { success: false, error: 'Erro ao adicionar usuário.' };
    }
  };

  const updateUser = async (id: string, data: Partial<{ nome: string; cor: string; ativo: boolean; tipo: UserRole }>): Promise<{ success: boolean; error?: string }> => {
    try {
      const profileUpdates: Partial<{ nome: string; cor: string; ativo: boolean }> = {};
      if (data.nome  !== undefined) profileUpdates.nome  = data.nome;
      if (data.cor   !== undefined) profileUpdates.cor   = data.cor;
      if (data.ativo !== undefined) profileUpdates.ativo = data.ativo;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase.from('profiles').update(profileUpdates).eq('id', id);
        if (profileError) { console.error('Profile update error:', profileError); return { success: false, error: profileError.message }; }
      }

      if (data.tipo !== undefined) {
        const { error: roleError } = await supabase.from('user_roles').update({ role: data.tipo }).eq('user_id', id);
        if (roleError) { console.error('Role update error:', roleError); return { success: false, error: roleError.message }; }
      }

      // Atualiza state e invalida cache
      const updatedUsers = users.map(u => u.id === id ? { ...u, ...data } : u);
      setUsers(updatedUsers);
      writeUsersCache(updatedUsers);
      if (user?.id === id) setUser(prev => prev ? { ...prev, ...data } : null);

      return { success: true };
    } catch (error) {
      console.error('UpdateUser exception:', error);
      return { success: false, error: 'Erro ao atualizar usuário.' };
    }
  };

  const updateUserPermissions = async (id: string, permissions: AccessPermissions): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await (supabase as any)
        .from('user_access_permissions')
        .upsert({ user_id: id, ...permissionsToRow(permissions) }, { onConflict: 'user_id' });

      if (error) { console.error('Permissions update error:', error); return { success: false, error: error.message }; }

      const updatedUsers = users.map(u => u.id === id ? { ...u, permissions } : u);
      setUsers(updatedUsers);
      writeUsersCache(updatedUsers);
      if (user?.id === id) setUser(prev => prev ? { ...prev, permissions } : prev);

      return { success: true };
    } catch (error) {
      console.error('UpdateUserPermissions exception:', error);
      return { success: false, error: 'Erro ao atualizar permissões do usuário.' };
    }
  };

  const deleteUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('profiles').update({ ativo: false }).eq('id', id);
      if (error) { console.error('Delete/deactivate error:', error); return { success: false, error: error.message }; }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: id }),
        }).catch(e => console.warn('admin-delete-user call failed:', e));
      }

      const updatedUsers = users.map(u => u.id === id ? { ...u, ativo: false } : u);
      setUsers(updatedUsers);
      writeUsersCache(updatedUsers);
      return { success: true };
    } catch (error) {
      console.error('DeleteUser exception:', error);
      return { success: false, error: 'Erro ao desativar usuário.' };
    }
  };

  const getActiveVendedores = (): AppUser[] =>
    users.filter(u => u.ativo && (u.tipo === 'vendedor' || u.tipo === 'admin'));

  const getUserById = (id: string): AppUser | undefined => users.find(u => u.id === id);

  const refreshUsers = async () => { await fetchUsers(true); };

  return (
    <AuthContext.Provider value={{
      user, users, loading,
      login, logout,
      addUser, updateUser, updateUserPermissions, deleteUser,
      getActiveVendedores, getUserById, refreshUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
