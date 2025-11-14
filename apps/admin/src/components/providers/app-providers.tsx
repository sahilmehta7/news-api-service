"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AuthProvider } from "@/components/auth/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

interface AppProvidersProps {
  children: React.ReactNode;
}

function ClientOnlyProviders({ children }: AppProvidersProps) {
  // During SSR/prerendering, render children directly to avoid React invariant 31 errors
  // Check if we're in a browser environment
  const isClient = typeof window !== "undefined";
  
  if (!isClient) {
    // During SSR, render children directly without providers using React.Fragment
    return <React.Fragment>{children}</React.Fragment>;
  }

  // Once in browser, render full provider stack
  return (
    <ThemeProvider>
      <NuqsAdapter>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  return <ClientOnlyProviders>{children}</ClientOnlyProviders>;
}

