"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format as formatDateFns } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, XCircle,
  Brain, Palette, Zap, Eye, ScanSearch, ImageIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { GeneratedPost } from "@/types";

// ── Fases do pipeline ─────────────────────────────────────────────────────────
const PHASES = [
  { key: "strategy",      label: "Estratégia",     icon: Brain,      description: "IA analisa o perfil da marca e define pilar, público e hook." },
  { key: "copy",          label: "Copy",            icon: ScanSearch, description: "Headline, legenda, hashtags e visual_prompt gerados." },
  { key: "art_direction", label: "Arte",            icon: Palette,    description: "Art Director eleva o prompt para nível editorial profissional." },
  { key: "generating",    label: "Geração",         icon: Zap,        description: "Modelo de imagem processa o prompt (Flux / Imagen / Freepik)." },
  { key: "composing",     label: "Composição",      icon: Layers,     description: "Logo, headline e identidade visual aplicados sobre a imagem." },
  { key: "ready",         label: "Pronto",          icon: Eye,        description: "Post finalizado e disponível para aprovação." },
] as const;

type PhaseKey = typeof PHASES[number]["key"];

const STATUS_ORDER: Record<string, number> = {
  pending: 0, strategy: 1, copy: 2, art_direction: 3,
  generating: 4, composing: 5, ready: 6, approved: 7, rejected: 7, failed: 99,
};

function phaseState(phaseKey: PhaseKey, postStatus: string): "done" | "active" | "pending" | "failed" {
  if (postStatus === "failed") return phaseKey === "ready" ? "failed" : STATUS_ORDER[postStatus] > STATUS_ORDER[phaseKey] ? "done" : "pending";
  const postOrder  = STATUS_ORDER[postStatus] ?? 0;
  const phaseOrder = STATUS_ORDER[phaseKey]   ?? 0;
  if (postOrder > phaseOrder) return "done";
  if (postOrder === phaseOrder) return "active";
  return "pending";
}

function Layers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PostTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = React.use(params);
  const router         = useRouter();

  const [post,    setPost]    = useState<GeneratedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function loadPost() {
    try {
      const res  = await fetch(`/api/posts/${postId}`);
      if (!res.ok) { setError("Post não encontrado"); setLoading(false); return; }
      const data = await res.json();
      setPost(data.post ?? data);
    } catch {
      setError("Erro ao carregar post");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPost();
    // Poll enquanto gerando
    const interval = setInterval(async () => {
      const res = await fetch(`/api/posts/${postId}`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      const p = data.post ?? data as GeneratedPost;
      setPost(p);
      if (["ready", "approved", "rejected", "failed"].includes(p.status)) clearInterval(interval);
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  function formatDate(ts: GeneratedPost["created_at"]) {
    if (!ts) return "";
    try {
      const d = (ts as unknown as { toDate?: () => Date }).toDate?.() ?? new Date((ts as unknown as number) * 1000);
      return formatDateFns(d, "dd MMM yyyy · HH:mm", { locale: ptBR });
    } catch { return ""; }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-full py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  if (error || !post) return (
    <div className="p-8">
      <p className="text-red-500">{error ?? "Post não encontrado"}</p>
      <Link href="/posts" className="text-sm text-violet-600 mt-2 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Posts
      </Link>
    </div>
  );

  const isFailed = post.status === "failed";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <Link href="/posts" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Posts Gerados
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-snug">{post.headline ?? "Post"}</h1>
            <div className="flex items-center flex-wrap gap-2 mt-1">
              <span className="text-sm text-slate-400">{post.client_name} · {formatDate(post.created_at)}</span>
              {post.client_id && (
                <>
                  <span className="text-slate-200">·</span>
                  <a href={`/clients/${post.client_id}/brand`} className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Brand Kit
                  </a>
                  <a href={`/clients/${post.client_id}/memory`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    <Brain className="w-3 h-3" /> Memória
                  </a>
                </>
              )}
            </div>
          </div>
          {(post.composed_url ?? post.image_url) && (
            <div className="w-16 h-16 rounded-xl overflow-hidden border flex-none">
              <img src={(post.composed_url ?? post.image_url)!} alt="" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {isFailed && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Geração falhou
            </p>
            {(post as GeneratedPost & { failureReason?: string }).failureReason && (
              <p className="text-xs text-red-600 mt-1">
                {(post as GeneratedPost & { failureReason?: string }).failureReason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timeline de fases */}
      <div className="space-y-1">
        {PHASES.map((phase, idx) => {
          const state = phaseState(phase.key, post.status);
          const Icon  = phase.icon;

          return (
            <div key={phase.key} className="flex gap-4">
              {/* Linha conectora */}
              <div className="flex flex-col items-center">
                <div className={[
                  "w-8 h-8 rounded-full flex items-center justify-center flex-none transition-colors",
                  state === "done"    ? "bg-green-100 text-green-600" :
                  state === "active"  ? "bg-violet-100 text-violet-600 ring-2 ring-violet-300" :
                  state === "failed"  ? "bg-red-100 text-red-500" :
                  "bg-slate-100 text-slate-300",
                ].join(" ")}>
                  {state === "done"   ? <CheckCircle2 className="w-4 h-4" /> :
                   state === "active" ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   state === "failed" ? <XCircle className="w-4 h-4" /> :
                   <Icon className="w-4 h-4" />}
                </div>
                {idx < PHASES.length - 1 && (
                  <div className={[
                    "w-0.5 h-8 my-1 transition-colors",
                    state === "done" ? "bg-green-200" : "bg-slate-100",
                  ].join(" ")} />
                )}
              </div>

              {/* Conteúdo */}
              <div className={["pb-6 flex-1", idx === PHASES.length - 1 ? "pb-0" : ""].join(" ")}>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={[
                    "text-sm font-semibold",
                    state === "done"    ? "text-slate-700" :
                    state === "active"  ? "text-violet-700" :
                    state === "failed"  ? "text-red-600" :
                    "text-slate-300",
                  ].join(" ")}>{phase.label}</p>
                  {state === "active" && <Badge className="text-xs bg-violet-100 text-violet-700 border-0">Em andamento</Badge>}
                  {state === "done"   && <Badge className="text-xs bg-green-100 text-green-700 border-0">Concluído</Badge>}
                </div>
                <p className={["text-xs", state === "pending" ? "text-slate-300" : "text-slate-500"].join(" ")}>
                  {phase.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ações */}
      <div className="mt-8 flex flex-wrap gap-3">
        {["ready", "approved"].includes(post.status) && (
          <button
            onClick={() => router.push("/posts")}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            Ver post completo
          </button>
        )}
        <Link
          href={`/posts/${postId}/review`}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-xl transition-colors"
        >
          Revisão de Slides
        </Link>
        <Link
          href={`/posts/${postId}/compiler`}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-xl transition-colors"
        >
          Prompt Compiler
        </Link>
      </div>
    </div>
  );
}
