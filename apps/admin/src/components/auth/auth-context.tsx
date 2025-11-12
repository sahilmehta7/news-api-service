"use client";

import * as React from "react";

const STORAGE_KEY = "news-admin-api-key";
const AUTH_EVENT = "news-admin-auth-update";

type AuthState = {
  apiKey: string | null;
  isAuthenticated: boolean;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  signIn: (apiKey: string) => void;
  signOut: () => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
    }
    setLoading(false);

    function handleCustomEvent(event: Event) {
      const authEvent = event as CustomEvent<{ apiKey: string | null }>;
      setApiKey(authEvent.detail.apiKey);
    }

    window.addEventListener(AUTH_EVENT, handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener(AUTH_EVENT, handleCustomEvent as EventListener);
    };
  }, []);

  const signIn = React.useCallback((key: string) => {
    setStoredApiKey(key);
    setApiKey(key);
  }, []);

  const signOut = React.useCallback(() => {
    clearStoredApiKey();
    setApiKey(null);
  }, []);

  const value: AuthContextValue = {
    apiKey,
    isAuthenticated: Boolean(apiKey),
    loading,
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
  dispatchAuthEvent(key);
}

export function clearStoredApiKey() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  dispatchAuthEvent(null);
}

function dispatchAuthEvent(apiKey: string | null) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent(AUTH_EVENT, { detail: { apiKey } });
  window.dispatchEvent(event);
}

