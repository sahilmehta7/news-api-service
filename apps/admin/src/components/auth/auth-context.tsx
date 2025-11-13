"use client";

import * as React from "react";

import {
  ADMIN_API_KEY_COOKIE,
  ADMIN_API_KEY_COOKIE_MAX_AGE_SECONDS
} from "@/lib/auth/constants";

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

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const cookieValue = readCookie(ADMIN_API_KEY_COOKIE);
  if (!cookieValue) {
    return null;
  }

  localStorage.setItem(STORAGE_KEY, cookieValue);
  return cookieValue;
}

export function setStoredApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
  setCookie(key);
  dispatchAuthEvent(key);
}

export function clearStoredApiKey() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  clearCookie();
  dispatchAuthEvent(null);
}

function dispatchAuthEvent(apiKey: string | null) {
  if (typeof window === "undefined") return;
  const event = new CustomEvent(AUTH_EVENT, { detail: { apiKey } });
  window.dispatchEvent(event);
}

function setCookie(value: string) {
  const maxAge = ADMIN_API_KEY_COOKIE_MAX_AGE_SECONDS;
  document.cookie = `${ADMIN_API_KEY_COOKIE}=${encodeURIComponent(
    value
  )}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearCookie() {
  document.cookie = `${ADMIN_API_KEY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

