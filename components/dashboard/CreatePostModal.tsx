"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  segment?: string;
}

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = "form" | "planning" | "instantiating";

const FORMATO_LABELS: Record<string, string> = {
  feed:          "Feed (imagem única)",
  carousel:      "Carrossel",
  story:         "Stories",
  "reels-cover": "Capa de Reels",
};

export default function CreatePostModal({ open, onClose }: CreatePostModalProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [clients,    setClients]    = useState<Client[]>([]);
  const [clientId,   setClientId]   = useState("");
  const [objetivo,   setObjetivo]   = useState("");
  const [formato,    setFormato]    = useState("feed");
  const [step,       setStep]       = useState<Step>("form");
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then(r => r.json())
      .then(d => setClients(d.clients ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) { setStep("form"); setError(null); }
  }, [open]);

  async function handleCreate() {
    if (!clientId || !objetivo.trim()) return;
    setError(null);

    const selectedClient = clients.find(c => c.id === clientId);
    const clientName     = selectedClient?.name;

    try {
      // Step 1 — plan
      setStep("planning");
      const planRes = await fetch("/api/director/plan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId, objetivo, formato, clientName }),
      });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error ?? "Erro ao gerar plano");

      // Step 2 — instantiate canvas
      setStep("instantiating");
      const instRes = await fetch("/api/director/instantiate-canvas", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: planData.plan, clientId, flowTitle: objetivo }),
      });
      const instData = await instRes.json();
      if (!instRes.ok) throw new Error(instData.error ?? "Erro ao criar canvas");

      onClose();
      startTransition(() => router.push(`/canvas/${instData.flowId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setStep("form");
    }
  }

  if (!open) return null;

  const isLoading = step !== "form";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-200">Criar Post com IA</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="px-6 py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm font-medium text-slate-300">
              {step === "planning"      ? "Diretor criativo planejando…" : "Montando canvas…"}
            </p>
            <p className="text-xs text-slate-500">
              {step === "planning"
                ? "Consultando Brand Kit + histórico do cliente"
                : "Posicionando nodes e criando edges"}
            </p>
          </div>
        )}

        {/* Form */}
        {!isLoading && (
          <div className="px-6 py-5 space-y-4">
            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Cliente</label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-600/50 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-400/50 appearance-none"
              >
                <option value="">Selecionar cliente…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Objetivo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Objetivo do post</label>
              <textarea
                value={objetivo}
                onChange={e => setObjetivo(e.target.value)}
                placeholder="Ex: Vender café da manhã de segunda-feira para famílias"
                rows={3}
                className="w-full bg-slate-800/60 border border-slate-600/50 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-400/50 resize-none"
              />
            </div>

            {/* Formato */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Formato</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FORMATO_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFormato(value)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-medium border transition-colors text-left",
                      formato === value
                        ? "bg-violet-500/20 border-violet-400/50 text-violet-300"
                        : "bg-slate-800/60 border-slate-600/50 text-slate-400 hover:border-slate-500",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}

        {/* Footer */}
        {!isLoading && (
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!clientId || !objetivo.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Criar Post
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
