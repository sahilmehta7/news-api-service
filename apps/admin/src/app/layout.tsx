import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { AppProviders } from "@/components/providers/app-providers";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "News Admin",
  description: "Admin console for managing feeds, articles, and ingestion."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppProviders>
            {children}
            <Toaster richColors position="top-right" />
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}

