"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/auth-context";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

type NavLink = {
  label: string;
  href: string;
  children?: Array<{ label: string; href: string }>;
};

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Overview" },
  {
    href: "/feeds",
    label: "Feeds",
    children: [
      { href: "/feeds", label: "All feeds" },
      { href: "/feeds/import", label: "Bulk import" }
    ]
  },
  { href: "/sources", label: "Sources" },
  { href: "/articles", label: "Articles" },
  { href: "/search", label: "Search" },
  { href: "/stories", label: "Stories" },
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
                <DesktopNavItem key={link.href} link={link} pathname={pathname} />
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

function DesktopNavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const isActive = link.children
    ? pathname.startsWith(link.href)
    : pathname === link.href;

  if (link.children) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-sm transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              isActive ? "text-primary underline underline-offset-4" : "text-muted-foreground"
            )}
          >
            {link.label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {link.children.map((child) => (
            <DropdownMenuItem key={child.href} asChild>
              <Link
                href={child.href}
                className={cn(
                  "w-full",
                  pathname === child.href ? "font-semibold text-primary" : "text-muted-foreground"
                )}
              >
                {child.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Link
      href={link.href}
      className={
        isActive
          ? "text-primary underline underline-offset-4"
          : "text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {link.label}
    </Link>
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
        <nav className="flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <MobileNavItem key={link.href} link={link} pathname={pathname} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const isActive = link.children
    ? link.children.some((child) => pathname.startsWith(child.href))
    : pathname === link.href;

  if (link.children) {
    return (
      <div className="flex flex-col gap-2">
        <span className={isActive ? "font-semibold text-primary" : "text-muted-foreground"}>
          {link.label}
        </span>
        <div className="ml-4 flex flex-col gap-2">
          {link.children.map((child) => {
            const childActive = pathname === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={
                  childActive
                    ? "text-sm font-semibold text-foreground"
                    : "text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={link.href}
      className={
        isActive
          ? "font-semibold text-primary"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      {link.label}
    </Link>
  );
}

