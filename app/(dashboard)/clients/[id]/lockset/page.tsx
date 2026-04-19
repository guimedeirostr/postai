"use client";

import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Loader2 } from "lucide-react";
import { LocksetEditor } from "@/components/lockset/LocksetEditor";
import { FLAGS } from "@/lib/flags";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { BrandProfile } from "@/types";

export default function LocksetPage() {
  const { id } = useParams<{ id: string }>();
  const [client,  setClient]  = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!FLAGS.LOCKSET_ENABLED) return;
    fetch(`/api/clients/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setClient(data?.client ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (!FLAGS.LOCKSET_ENABLED) return notFound();

  if (loading) return (
    <div className="flex justify-center items-center h-full py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  if (!client) return (
    <div className="p-8">
      <p className="text-red-500">Cliente não encontrado</p>
      <Link href="/clients" className="text-sm text-violet-600 mt-2 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Clientes
      </Link>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao cliente
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
          <Lock className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {PT_BR.lockset.title} — {client.name}
          </h1>
        </div>
      </div>

      <LocksetEditor clientId={id} clientName={client.name} />
    </div>
  );
}
