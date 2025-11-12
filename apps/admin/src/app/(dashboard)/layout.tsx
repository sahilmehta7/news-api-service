import { AuthGuard } from "@/components/auth/auth-guard";
import { AdminShell } from "@/components/layout/admin-shell";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}

