import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

async function getUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get("postai_session")?.value;
  if (!session) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(session, false);
    return decoded;
  } catch (err) {
    console.error("[layout] verifySessionCookie falhou:", err);
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen bg-slate-50">
      <DashboardSidebar userEmail={user.email ?? ""} userName={user.name ?? "Agência"} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
