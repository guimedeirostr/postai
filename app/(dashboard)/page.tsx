"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Sparkles, Users, ImageIcon, TrendingUp, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CreatePostModal from "@/components/dashboard/CreatePostModal";

const STAT_CONFIG = [
  { key: "clients"  as const, label: "Clientes",        icon: Users,      color: "text-violet-600", bg: "bg-violet-50" },
  { key: "posts"    as const, label: "Posts Gerados",   icon: ImageIcon,  color: "text-blue-600",   bg: "bg-blue-50"   },
  { key: "approved" as const, label: "Posts Aprovados", icon: TrendingUp, color: "text-green-600",  bg: "bg-green-50"  },
];

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [counts, setCounts] = useState({ clients: 0, posts: 0, approved: 0 });

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCounts({ clients: d.clients, posts: d.posts, approved: d.approved }); })
      .catch(() => null);
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Bem-vindo ao PostAI — seu designer de posts com IA</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Criar Post
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {STAT_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
          <Card key={key} className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{counts[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm border-dashed border-2 border-violet-200 bg-violet-50/30">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-violet-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Comece criando um post</h2>
          <p className="text-slate-500 text-sm max-w-sm mb-5">
            O Diretor Criativo IA planeja, monta o canvas e direciona a geração de cada slide.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Post com IA
          </button>
        </CardContent>
      </Card>

      <CreatePostModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
