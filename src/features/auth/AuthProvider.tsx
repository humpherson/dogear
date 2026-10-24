import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { message } from '../../lib/validation';
export type AuthState = {
  session: Session | null;
  loading: boolean;
  recovery: boolean;
  error: string | null;
};
export const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  recovery: false,
  error: null,
});
export function useAuth() {
  return useContext(AuthContext);
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
    recovery: sessionStorage.getItem('dogear-recovery') === 'true',
    error: null,
  });
  useEffect(() => {
    let active = true;
    let eventReceived = false;
    let previousUser: string | undefined;
    const {
      data: { subscription },
    } = db().auth.onAuthStateChange((event, session) => {
      eventReceived = true;
      if (previousUser !== session?.user.id) {
        client.clear();
        previousUser = session?.user.id;
      }
      if (event === 'PASSWORD_RECOVERY')
        sessionStorage.setItem('dogear-recovery', 'true');
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED')
        sessionStorage.removeItem('dogear-recovery');
      if (active)
        setState({
          session,
          loading: false,
          recovery: sessionStorage.getItem('dogear-recovery') === 'true',
          error: null,
        });
    });
    void db()
      .auth.getSession()
      .then(({ data, error }) => {
        if (active && !eventReceived)
          setState((s) => ({
            ...s,
            session: data.session,
            loading: false,
            error: error ? message(error) : null,
          }));
      })
      .catch((error) => {
        if (active)
          setState((s) => ({ ...s, loading: false, error: message(error) }));
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
