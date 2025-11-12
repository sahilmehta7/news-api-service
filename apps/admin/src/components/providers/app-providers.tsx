"use client";

import * as React from "react";

import { AuthProvider } from "@/components/auth/auth-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

