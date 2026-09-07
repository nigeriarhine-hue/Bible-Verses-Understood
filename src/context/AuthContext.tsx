import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { authRedirectUrl } from '../lib/urls';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** False when this deployment has no Supabase project — accounts are hidden. */
  accountsAvailable: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const client = supabase;
    if (!client) throw new Error('Accounts are not available in this deployment.');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
        emailRedirectTo: authRedirectUrl('/auth/callback'),
      },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
    trackEvent('account_signup', { method: 'email' });
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = supabase;
    if (!client) throw new Error('Accounts are not available in this deployment.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const client = supabase;
    if (!client) throw new Error('Accounts are not available in this deployment.');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl('/auth/callback') },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const client = supabase;
    if (!client) throw new Error('Accounts are not available in this deployment.');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl('/auth/reset'),
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = supabase;
    if (!client) throw new Error('Accounts are not available in this deployment.');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      accountsAvailable: isSupabaseConfigured,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [session, loading, signUp, signIn, signInWithGoogle, signOut, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Turns Supabase's wording into something a reader can act on. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (lower.includes('already registered') || lower.includes('user already')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (lower.includes('password should be at least')) {
    return 'Please choose a password of at least six characters.';
  }
  if (lower.includes('email rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts just now. Please wait a minute and try again.';
  }
  if (lower.includes('provider is not enabled')) {
    return 'Google sign-in has not been enabled for this deployment yet.';
  }
  return message;
}
