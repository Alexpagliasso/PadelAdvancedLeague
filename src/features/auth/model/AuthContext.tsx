/* eslint-disable react-refresh/only-export-components */

import type { Session, User } from '@supabase/supabase-js';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getCurrentSession,
  getProfileByAuthUserId,
  isAdminRole,
  loginWithEmailPassword,
  logoutCurrentUser,
  type AuthProfile
} from '@/features/auth/api/authApi';
import { supabase } from '@/lib/supabase/client';
import type { ProfileRole } from '@/lib/supabase/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  role: ProfileRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthProfile | null>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected authentication error.';
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyAuthState = useCallback((next: { session: Session | null; user: User | null; profile: AuthProfile | null }) => {
    setSession(next.session);
    setUser(next.user);
    setProfile(next.profile);
    setStatus(next.session && next.user ? 'authenticated' : 'unauthenticated');
  }, []);

  const refreshSession = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const nextSession = await getCurrentSession();
      applyAuthState(nextSession);
    } catch (nextError) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setStatus('unauthenticated');
      setError(getErrorMessage(nextError));
    }
  }, [applyAuthState]);

  const login = useCallback(
    async (email: string, password: string) => {
      setStatus('loading');
      setError(null);

      try {
        const nextSession = await loginWithEmailPassword(email, password);
        applyAuthState(nextSession);
        return nextSession.profile;
      } catch (nextError) {
        setStatus('unauthenticated');
        setError(getErrorMessage(nextError));
        throw nextError;
      }
    },
    [applyAuthState]
  );

  const logout = useCallback(async () => {
    setError(null);

    try {
      await logoutCurrentUser();
      applyAuthState({ session: null, user: null, profile: null });
    } catch (nextError) {
      setError(getErrorMessage(nextError));
      throw nextError;
    }
  }, [applyAuthState]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    void refreshSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession?.user) {
        applyAuthState({ session: null, user: null, profile: null });
        return;
      }

      void getProfileByAuthUserId(nextSession.user.id)
        .then((nextProfile) => {
          applyAuthState({
            session: nextSession,
            user: nextSession.user,
            profile: nextProfile
          });
        })
        .catch((nextError: unknown) => {
          setError(getErrorMessage(nextError));
          applyAuthState({
            session: nextSession,
            user: nextSession.user,
            profile: null
          });
        });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applyAuthState, refreshSession]);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? null;

    return {
      status,
      session,
      user,
      profile,
      role,
      isAuthenticated: status === 'authenticated',
      isAdmin: isAdminRole(role),
      error,
      refreshSession,
      login,
      logout,
      clearError
    };
  }, [clearError, error, login, logout, profile, refreshSession, session, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
