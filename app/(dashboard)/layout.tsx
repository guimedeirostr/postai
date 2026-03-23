import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const uid         = headerStore.get("x-user-uid");

  // Fallback defensivo — middleware já deveria ter barrado, mas por segurança
  if (!uid) redirect("/login");

  const email = headerStore.get("x-user-email") ?? "";
  const name  = headerStore.get("x-user-name")  ?? "Agência";

  return (
    <div className="flex h-screen bg-slate-50">
      <DashboardSidebar userEmail={email} userName={name} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
