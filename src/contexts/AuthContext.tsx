import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

function buildAppUsers(
  profiles: Profile[],
  roles: { user_id: string; role: string }[],
  permRows: { user_id: string }[],
): AppUser[] {
  return profiles.map((profile) => {
    const userRole = roles.find(r => r.user_id === profile.id);
    const permRow  = permRows.find(p => p.user_id === profile.id);
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
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<AppUser | null>(null);
  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 3 parallel queries → builds users list + returns current user
  const loadAll = useCallback(async (authUserId: string): Promise<AppUser | null> => {
    try {
      const [
        { data: profiles, error: profilesErr },
        { data: roles,    error: rolesErr    },
        { data: permRows, error: permErr     },
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        (supabase as any).from('user_access_permissions').select('*'),
      ]);

      if (profilesErr) console.error('Error fetching profiles:', profilesErr);
      if (rolesErr)    console.error('Error fetching roles:', rolesErr);
      if (permErr && permErr.code !== '42P01') console.error('Error fetching permissions:', permErr);

      const allUsers = buildAppUsers(profiles || [], roles || [], permRows || []);
      setUsers(allUsers);

      const current = allUsers.find(u => u.id === authUserId) ?? null;
      if (current && !current.ativo) {
        await supabase.auth.signOut();
        return null;
      }
      return current;
    } catch (e) {
      console.error('Error in loadAll:', e);
      return null;
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const [
        { data: profiles },
        { data: roles    },
        { data: permRows },
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        (supabase as any).from('user_access_permissions').select('*'),
      ]);
      setUsers(buildAppUsers(profiles || [], roles || [], permRows || []));
    } catch (e) {
      console.error('Error in refreshUsers:', e);
    }
  }, []);

  useEffect(() => {
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        if (session?.user) {
          // Defer com setTimeout para evitar deadlock interno do Supabase SDK
          setTimeout(async () => {
            if (!initialised) {
              const appUser = await loadAll(session.user.id);
              setUser(appUser);
              setLoading(false);
              initialised = true;
            } else if (event === 'SIGNED_IN') {
              const appUser = await loadAll(session.user.id);
              setUser(appUser);
            }
            // TOKEN_REFRESHED e outros: dados já carregados, não refazer queries
          }, 0);
        } else {
          setUser(null);
          setUsers([]);
          setLoading(false);
          initialised = true;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadAll]);

  const login = async (email: string, senha: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });

      if (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        const appUser = await loadAll(data.user.id);
        if (!appUser) {
          await supabase.auth.signOut();
          return { success: false, error: 'Usuário não encontrado ou inativo.' };
        }
        setUser(appUser);
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
  };

  const addUser = async (userData: { nome: string; email: string; senha: string; tipo: UserRole; cor: string }): Promise<{ success: boolean; error?: string; user?: AppUser }> => {
    try {
      const isFirstUser = users.length === 0;
      const userRole = isFirstUser ? 'admin' : userData.tipo;
      const email = userData.email.trim().toLowerCase();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Sessao expirada. Entre novamente e tente de novo.' };
      }

      const createResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome: userData.nome,
          email,
          password: userData.senha,
          tipo: userRole === 'admin' ? 'admin' : 'vendedor',
          cor: userData.cor,
        }),
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
        return {
          success: false,
          error: functionErrorMessage || `Erro ao criar usuario. Status ${createResponse.status}.`,
        };
      }

      const defaultPermissions = getDefaultPermissions(userRole);
      const { error: permissionsError } = await (supabase as any)
        .from('user_access_permissions')
        .upsert({
          user_id: createdUserId,
          ...permissionsToRow(defaultPermissions),
        }, { onConflict: 'user_id' });

      if (permissionsError && permissionsError.code !== '42P01') {
        console.error('Permissions creation error:', permissionsError);
        return { success: false, error: 'Erro ao definir permissões do usuário.' };
      }

      await refreshUsers();

      const newUser: AppUser = {
        id: createdUserId,
        nome: userData.nome,
        email,
        tipo: userRole,
        cor: userData.cor,
        ativo: true,
        criadoEm: new Date().toISOString(),
        permissions: defaultPermissions,
      };

      return { success: true, user: newUser };
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
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', id);

        if (profileError) {
          console.error('Profile update error:', profileError);
          return { success: false, error: profileError.message };
        }
      }

      if (data.tipo !== undefined) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: data.tipo })
          .eq('user_id', id);

        if (roleError) {
          console.error('Role update error:', roleError);
          return { success: false, error: roleError.message };
        }
      }

      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
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

      if (error) {
        console.error('Permissions update error:', error);
        return { success: false, error: error.message };
      }

      setUsers(prev => prev.map(u => u.id === id ? { ...u, permissions } : u));
      if (user?.id === id) setUser(prev => prev ? { ...prev, permissions } : prev);

      return { success: true };
    } catch (error) {
      console.error('UpdateUserPermissions exception:', error);
      return { success: false, error: 'Erro ao atualizar permissões do usuário.' };
    }
  };

  const deleteUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ativo: false })
        .eq('id', id);

      if (error) {
        console.error('Delete/deactivate error:', error);
        return { success: false, error: error.message };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: id }),
        }).catch(e => console.warn('admin-delete-user call failed:', e));
      }

      setUsers(prev => prev.map(u => u.id === id ? { ...u, ativo: false } : u));
      return { success: true };
    } catch (error) {
      console.error('DeleteUser exception:', error);
      return { success: false, error: 'Erro ao desativar usuário.' };
    }
  };

  const getActiveVendedores = (): AppUser[] =>
    users.filter(u => u.ativo && (u.tipo === 'vendedor' || u.tipo === 'admin'));

  const getUserById = (id: string): AppUser | undefined =>
    users.find(u => u.id === id);

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
