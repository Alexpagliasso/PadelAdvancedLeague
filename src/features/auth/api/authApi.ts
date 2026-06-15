import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import type { Database, ProfileRole } from '@/lib/supabase/types';

export type AuthProfile = Database['public']['Tables']['profiles']['Row'];

export type AuthSession = {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
};

export async function getCurrentSession(): Promise<AuthSession> {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    return { session: null, user: null, profile: null };
  }

  const profile = await getProfileByAuthUserId(session.user.id);

  return {
    session,
    user: session.user,
    profile
  };
}

export async function getProfileByAuthUserId(authUserId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loginWithEmailPassword(email: string, password: string): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  const profile = await getProfileByAuthUserId(data.user.id);

  return {
    session: data.session,
    user: data.user,
    profile
  };
}

export async function logoutCurrentUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function isAdminRole(role: ProfileRole | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}
