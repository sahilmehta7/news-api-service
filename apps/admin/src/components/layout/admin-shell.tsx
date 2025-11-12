"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/auth-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV_LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/feeds", label: "Feeds" },
  { href: "/articles", label: "Articles" },
  { href: "/metrics", label: "Metrics" },
  { href: "/logs", label: "Fetch Logs" },
  { href: "/settings", label: "Settings" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MobileNav pathname={pathname} />
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                Admin
              </span>
              <span className="text-lg font-semibold">News Platform</span>
            </Link>
            <nav className="hidden items-center gap-4 text-sm font-medium lg:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    pathname === link.href
                      ? "text-primary underline underline-offset-4"
                      : "text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              className="hidden md:inline-flex"
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
      <footer className="border-t bg-card">
        <div className="container flex h-14 items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} News Admin</span>
          <span>Ingestion &amp; Enrichment Dashboard</span>
        </div>
      </footer>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col gap-6">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "font-semibold text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

