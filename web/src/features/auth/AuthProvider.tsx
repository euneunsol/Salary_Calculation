import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { authErrorMessage, withAuthTimeout } from './authError';
import type { AppRole, Profile, Store, StoreMember } from '../../types/database.types';

export interface Membership extends StoreMember {
  store: Pick<Store, 'id' | 'name' | 'week_start_day' | 'open_time' | 'close_time'>;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** 내가 사장님인 매장들 */
  ownedStores: Store[];
  /** 내가 매니저/알바로 소속된 매장들 */
  memberships: Membership[];
  /** 화면 라우팅에 쓰는 대표 역할 */
  role: AppRole | null;
  loading: boolean;
  initializationError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    void withAuthTimeout(supabase.auth.getSession())
      .then(({ data, error }) => {
        if (!active || receivedAuthEvent) return;
        if (error) throw error;
        setSession(data.session);
        setInitializationError(null);
      })
      .catch((error: unknown) => {
        if (!active || receivedAuthEvent) return;
        setSession(null);
        setInitializationError(authErrorMessage(error));
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      receivedAuthEvent = true;
      setSession(next);
      setInitializing(false);
      setInitializationError(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const storesQuery = useQuery({
    queryKey: ['my-stores', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('owner_id', userId!);
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });

  const membershipsQuery = useQuery({
    queryKey: ['my-memberships', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_members')
        .select('*, store:stores(id, name, week_start_day, open_time, close_time)')
        .eq('user_id', userId!)
        .eq('status', 'ACTIVE');
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const ownedStores = storesQuery.data ?? [];
    const memberships = membershipsQuery.data ?? [];

    // 대표 역할: 소유 매장이 있으면 OWNER, 매니저 소속이 있으면 MANAGER, 그 외 EMPLOYEE
    let role: AppRole | null = null;
    if (session && (ownedStores.length > 0 || memberships.length > 0)) {
      if (ownedStores.length > 0) role = 'OWNER';
      else if (memberships.some((m) => m.role === 'MANAGER')) role = 'MANAGER';
      else role = 'EMPLOYEE';
    }

    return {
      session,
      profile: profileQuery.data ?? null,
      ownedStores,
      memberships,
      role,
      initializationError,
      loading:
        initializing ||
        (!!userId &&
          (profileQuery.isLoading || storesQuery.isLoading || membershipsQuery.isLoading)),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [
    session,
    userId,
    initializing,
    initializationError,
    profileQuery.data,
    profileQuery.isLoading,
    storesQuery.data,
    storesQuery.isLoading,
    membershipsQuery.data,
    membershipsQuery.isLoading,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
