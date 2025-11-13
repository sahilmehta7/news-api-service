"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { AuthProvider } from "@/components/auth/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
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

