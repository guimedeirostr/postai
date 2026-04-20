"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DARK_ROUTES } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, Users, ImageIcon, Settings,
  Sparkles, LogOut, Loader2, GalleryHorizontal, Workflow, Layers, Palette, Lock, FolderOpen,
} from "lucide-react";
import { FLAGS } from "@/lib/flags";
import { useState } from "react";

const navItems = [
  { href: "/",             label: "Dashboard",     icon: LayoutDashboard },
  { href: "/clients",      label: "Clientes",      icon: Users },
  { href: "/brand-kits",   label: "Brand Kits",    icon: Palette },
  ...(FLAGS.LOCKSET_ENABLED ? [{ href: "/locksets", label: "Brand Locksets", icon: Lock }] : []),
  ...(FLAGS.ASSETS_ENABLED  ? [{ href: "/assets",   label: "Assets",         icon: FolderOpen }] : []),
  { href: "/posts",        label: "Posts Gerados", icon: ImageIcon },
  { href: "/variants",     label: "Variantes",     icon: Layers },
  { href: "/carousels",    label: "Carrosseis",    icon: GalleryHorizontal },
  { href: "/canvas/new",   label: "Canvas IA",     icon: Workflow },
  { href: "/settings",     label: "Configurações", icon: Settings },
] as { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];

interface Props {
  userEmail: string;
  userName:  string;
}

export function DashboardSidebar({ userEmail, userName }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [loading, setLoading] = useState(false);
  const nextIsDark = DARK_ROUTES.some(rx => rx.test(pathname));

  async function handleSignOut() {
    setLoading(true);
    await signOut();
    router.push("/login");
  }

  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className={cn(
      "w-60 bg-white border-r border-slate-100 flex flex-col h-full shadow-sm transition-shadow",
      nextIsDark && "shadow-lg shadow-slate-900/10",
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-slate-900 text-lg">PostAI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              (pathname === href || (href === "/canvas/new" && pathname.startsWith("/canvas/")))
                ? "bg-violet-50 text-violet-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Icon className={cn("w-4 h-4", (pathname === href || (href === "/canvas/new" && pathname.startsWith("/canvas/"))) ? "text-violet-600" : "text-slate-400")} />
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={loading}
          className="w-full justify-start text-slate-500 hover:text-red-600 hover:bg-red-50"
        >
          {loading
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <LogOut  className="w-4 h-4 mr-2" />}
          Sair
        </Button>
      </div>
    </aside>
  );
}
