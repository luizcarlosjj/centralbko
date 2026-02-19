import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/tickets';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const fetchingRef = useRef(false);
  const lastFetchedUserId = useRef<string | null>(null);

  // Step 1: Listen for auth state changes — only set session/user, no async work
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setSessionResolved(true);
      if (!session?.user) {
        setProfile(null);
        setRole(null);
        lastFetchedUserId.current = null;
        setProfileResolved(true);
      } else if (session.user.id !== lastFetchedUserId.current) {
        // Only reset profileResolved for a NEW user
        setProfileResolved(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setSessionResolved(true);
      if (!session?.user) {
        setProfile(null);
        setRole(null);
        setProfileResolved(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Step 2: When user changes, fetch profile and role separately
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRole(null);
      lastFetchedUserId.current = null;
      setProfileResolved(true);
      return;
    }

    // Skip if already fetched for this user
    if (lastFetchedUserId.current === user.id) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
    ]).then(([profileRes, roleRes]) => {
      if (profileRes.data) setProfile(profileRes.data);
      if (roleRes.data) setRole(roleRes.data.role as AppRole);
      lastFetchedUserId.current = user.id;
      setProfileResolved(true);
      fetchingRef.current = false;
    }).catch(() => {
      setProfileResolved(true);
      fetchingRef.current = false;
    });
  }, [user?.id]);

  // Step 3: Loading is only false when both session and profile are resolved
  useEffect(() => {
    if (sessionResolved && profileResolved) {
      setLoading(false);
    }
  }, [sessionResolved, profileResolved]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    setProfile(null);
    setRole(null);
    setUser(null);
    setSession(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
