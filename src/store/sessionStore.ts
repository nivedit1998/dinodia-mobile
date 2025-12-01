// src/store/sessionStore.ts
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '../api/auth';
import type { HaConnection } from '../models/haConnection';
import { loadJson, saveJson, removeKey } from '../utils/storage';

type Session = {
  user: AuthUser | null;
  haConnection: HaConnection | null;
};

type SessionContextValue = {
  session: Session;
  loading: boolean;
  setSession: (s: Session) => Promise<void>;
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const SESSION_KEY = 'dinodia_session';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session>({
    user: null,
    haConnection: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const stored = await loadJson<Session>(SESSION_KEY);
      if (stored) {
        setSessionState(stored);
      }
      setLoading(false);
    })();
  }, []);

  const setSession = async (s: Session) => {
    setSessionState(s);
    await saveJson(SESSION_KEY, s);
  };

  const clearSession = async () => {
    setSessionState({ user: null, haConnection: null });
    await removeKey(SESSION_KEY);
  };

  return (
    <SessionContext.Provider value={{ session, loading, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
