"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Palette, Brain, Sparkles, Loader2, ArrowRight, Image, Lock, FolderOpen } from "lucide-react";
import { FLAGS } from "@/lib/flags";
import type { BrandProfile } from "@/types";

interface DnaInfo {
  confidence_score?: number;
  exists: boolean;
}

export default function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = React.use(params);

  const [client,  setClient]  = useState<BrandProfile | null>(null);
  const [dna,     setDna]     = useState<DnaInfo | null>(null);
  const [memCount, setMemCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [clientRes, dnaRes, memRes] = await Promise.all([
        fetch(`/api/clients/${clientId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/clients/${clientId}/context`).then(r => r.json()).catch(() => null),
        fetch(`/api/clients/${clientId}/memory`).then(r => r.json()).catch(() => null),
      ]);
      if (clientRes?.client) setClient(clientRes.client);
      if (dnaRes) setDna({ exists: !!dnaRes.dnaVisual, confidence_score: dnaRes.dnaVisual?.confidence_score });
      if (memRes?.memory) {
        const m = memRes.memory;
        setMemCount((m.toneExamples?.length ?? 0) + (m.rejectedPatterns?.length ?? 0));
      } else {
        setMemCount(0);
      }
      setLoading(false);
    }
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Cliente não encontrado.</p>
        <Link href="/clients" className="text-violet-600 hover:underline text-sm mt-2 inline-block">← Voltar</Link>
      </div>
    );
  }

  const identityCards = [
    {
      href: `/clients/${clientId}/brand`,
      icon: <Palette className="w-6 h-6 text-violet-500" />,
      bg: "bg-violet-50",
      title: "Brand Kit",
      subtitle: "Paleta, fonts, tom de voz",
    },
    {
      href: `/clients/${clientId}/memory`,
      icon: <Brain className="w-6 h-6 text-indigo-500" />,
      bg: "bg-indigo-50",
      title: "Memória",
      subtitle: memCount !== null ? `${memCount} exemplos aprendidos` : "Carregando…",
    },
    {
      href: `/clients/${clientId}/brand`,
      icon: <Sparkles className="w-6 h-6 text-amber-500" />,
      bg: "bg-amber-50",
      title: "DNA Visual",
      subtitle: dna?.exists
        ? `${dna.confidence_score ?? 0}% mapeado`
        : "Não processado",
    },
    ...(FLAGS.LOCKSET_ENABLED ? [{
      href: `/clients/${clientId}/lockset`,
      icon: <Lock className="w-6 h-6 text-slate-500" />,
      bg: "bg-slate-50",
      title: "Brand Lockset",
      subtitle: "Travas de marca para o Diretor IA",
    }] : []),
    ...(FLAGS.ASSETS_ENABLED ? [{
      href: `/clients/${clientId}/assets`,
      icon: <FolderOpen className="w-6 h-6 text-teal-500" />,
      bg: "bg-teal-50",
      title: "Assets",
      subtitle: "Logos, produtos e fundos",
    }] : []),
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Back */}
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Clientes
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {client.logo_url ? (
          <img src={client.logo_url} alt={client.name} className="w-16 h-16 rounded-2xl object-cover border" />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold"
            style={{ backgroundColor: client.primary_color }}
          >
            {client.name[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          <p className="text-slate-400 text-sm">{client.segment}</p>
          {client.instagram_handle && (
            <p className="text-xs text-slate-400 mt-0.5">{client.instagram_handle}</p>
          )}
        </div>
      </div>

      {/* Identity cards */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Identidade da marca</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {identityCards.map(card => (
          <Link
            key={card.href + card.title}
            href={card.href}
            className="group flex flex-col gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{card.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.subtitle}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors mt-auto" />
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Ações rápidas</h2>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/canvas/new?clientId=${clientId}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Abrir no Canvas V3
        </Link>
        <Link
          href={`/clients/${clientId}/moodboard`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium transition-colors"
        >
          <Image className="w-4 h-4" /> Moodboard
        </Link>
      </div>
    </div>
  );
}
