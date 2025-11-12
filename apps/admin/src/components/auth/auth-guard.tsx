"use client";

import { useRouter, usePathname } from "next/navigation";
import * as React from "react";

import { useAuth } from "./auth-context";

const PUBLIC_ROUTES = ["/login"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!isAuthenticated && !isPublic) {
      router.replace("/login");
    }
    if (isAuthenticated && pathname === "/login") {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

