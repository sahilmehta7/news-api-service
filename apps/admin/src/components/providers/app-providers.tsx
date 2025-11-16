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
  // Truncate extremely large string logs (e.g., raw HTML/CSS) in the browser console
  React.useEffect(() => {
    const originalLog = console.log;
    const originalDebug = console.debug;
    const MAX_LEN = 4000;

    function sanitizeArgs(args: unknown[]) {
      return args.map((arg) => {
        if (typeof arg === "string" && arg.length > MAX_LEN) {
          // Heuristic: if it looks like minified CSS/HTML, drop it entirely to reduce noise.
          const looksLikeStylesheet =
            arg.includes("{") &&
            arg.includes("}") &&
            (arg.includes("@media") || arg.includes(".container") || arg.includes("body"));
          if (looksLikeStylesheet) {
            return "[omitted large stylesheet response]";
          }
          // Otherwise, truncate to a reasonable preview.
          return `${arg.slice(0, MAX_LEN)}… [truncated ${arg.length - MAX_LEN} chars]`;
        }
        return arg;
      });
    }

    // eslint-disable-next-line no-console
    console.log = (...args: unknown[]) => {
      originalLog.apply(console, sanitizeArgs(args));
    };
    // eslint-disable-next-line no-console
    console.debug = (...args: unknown[]) => {
      originalDebug.apply(console, sanitizeArgs(args));
    };

    return () => {
      // Restore originals on unmount
      // eslint-disable-next-line no-console
      console.log = originalLog;
      // eslint-disable-next-line no-console
      console.debug = originalDebug;
    };
  }, []);

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

