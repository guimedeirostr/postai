"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Sparkles, Save, Loader2, Play, ChevronDown,
  Palette, History, ChevronRight, ChevronLeft, Zap, Lock, FolderOpen, Cpu,
} from "lucide-react";
import { LocksetPreview } from "@/components/lockset/LocksetPreview";
import { AssetsTab } from "@/components/canvas/AssetsTab";
import { FLAGS } from "@/lib/flags";
import { compilerStrings } from "@/lib/i18n/pt-br";
import { cn } from "@/lib/utils";

import GlowEdge from "@/components/canvas/edges/GlowEdge";
import BriefingNode    from "@/components/canvas/nodes/v3/BriefingNode";
import PlanNode        from "@/components/canvas/nodes/v3/PlanNode";
import PromptNode      from "@/components/canvas/nodes/v3/PromptNode";
import CopyNodeV3      from "@/components/canvas/nodes/v3/CopyNodeV3";
import ReferenceNode   from "@/components/canvas/nodes/v3/ReferenceNode";
import ImageNode       from "@/components/canvas/nodes/v3/ImageNode";
import CriticNode      from "@/components/canvas/nodes/v3/CriticNode";
import OutputNode      from "@/components/canvas/nodes/v3/OutputNode";
import ClientMemoryNode from "@/components/canvas/nodes/v3/ClientMemoryNode";
import { ClientPicker } from "@/components/canvas/ClientPicker";
import { useCanvasStore, type CanvasPhases } from "@/lib/canvas/store";
import { PHASE_INFO } from "@/lib/canvas/phases";
import type { PhaseId } from "@/types";

// ── Node / edge type registries ───────────────────────────────────────────────
const nodeTypes = {
  briefing:     BriefingNode,
  plan:         PlanNode,
  prompt:       PromptNode,
  image:        ImageNode,
  copy:         CopyNodeV3,
  reference:    ReferenceNode,
  critic:       CriticNode,
  output:       OutputNode,
  clientMemory: ClientMemoryNode,
};

const edgeTypes = {
  glow: GlowEdge,
};

// ── Default starter layout ────────────────────────────────────────────────────
const DEFAULT_NODES: Node[] = [
  { id: "briefing-1", type: "briefing",     position: { x: 60,   y: 200 }, data: { objetivo: "", formato: "feed" } },
  { id: "memory-1",   type: "clientMemory", position: { x: 60,   y: 420 }, data: {} },
  { id: "plan-1",     type: "plan",         position: { x: 440,  y: 160 }, data: {} },
  { id: "prompt-1",   type: "prompt",       position: { x: 840,  y: 80  }, data: { slideN: 1 } },
  { id: "copy-1",     type: "copy",         position: { x: 840,  y: 340 }, data: {} },
  { id: "image-1",    type: "image",        position: { x: 1200, y: 80  }, data: {} },
  { id: "critic-1",   type: "critic",       position: { x: 1560, y: 220 }, data: {} },
  { id: "output-1",   type: "output",       position: { x: 1880, y: 220 }, data: {} },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1", source: "briefing-1",  target: "plan-1",    type: "glow", animated: true },
  { id: "e2", source: "memory-1",    target: "plan-1",    type: "glow", animated: false },
  { id: "e3", source: "plan-1",      target: "prompt-1",  type: "glow", animated: true },
  { id: "e4", source: "plan-1",      target: "copy-1",    type: "glow", animated: true },
  { id: "e5", source: "prompt-1",    target: "image-1",   type: "glow", animated: false },
  { id: "e6", source: "copy-1",      target: "critic-1",  type: "glow", animated: false },
  { id: "e7", source: "critic-1",    target: "output-1",  type: "glow", animated: false },
  { id: "e8", source: "image-1",     target: "critic-1",  type: "glow", animated: false },
];

// ── Checkpoint options ────────────────────────────────────────────────────────
const CHECKPOINT_OPTIONS: { value: PhaseId; label: string }[] = [
  { value: "plano",   label: "Pausar no Plano" },
  { value: "prompt",  label: "Pausar no Prompt (recomendado)" },
  { value: "critico", label: "Pausar no Crítico" },
  { value: "output",  label: "Pausar no Output" },
];

// ── Side panel tabs ───────────────────────────────────────────────────────────
type SideTab = "agent" | "brand" | "history" | "locks" | "assets";

function SidePanel({ tab, setTab, clientId, flowId, phases }: {
  tab: SideTab;
  setTab: (t: SideTab) => void;
  clientId: string | null;
  flowId: string;
  phases: CanvasPhases;
}) {
  const statusDot: Record<string, string> = {
    idle: "bg-slate-600",
    queued: "bg-blue-500 animate-pulse",
    running: "bg-violet-500 animate-pulse",
    done: "bg-emerald-500",
    stale: "bg-amber-500",
    error: "bg-red-500",
    skipped: "bg-slate-700",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-pi-border">
        {([
          { id: "agent",   label: "Agente",    icon: <Zap className="w-3.5 h-3.5" /> },
          { id: "brand",   label: "Brand Kit",  icon: <Palette className="w-3.5 h-3.5" /> },
          ...(FLAGS.LOCKSET_ENABLED ? [{ id: "locks" as SideTab, label: "Locks", icon: <Lock className="w-3.5 h-3.5" /> }] : []),
          ...(FLAGS.ASSETS_ENABLED ? [{ id: "assets" as SideTab, label: "Assets", icon: <FolderOpen className="w-3.5 h-3.5" /> }] : []),
          { id: "history", label: "Histórico",  icon: <History className="w-3.5 h-3.5" /> },
        ] as { id: SideTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "text-pi-accent border-b-2 border-pi-accent -mb-px"
                : "text-pi-text-muted hover:text-pi-text",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === "agent" && (
          <div className="space-y-3">
            <p className="text-xs text-pi-text-muted">
              O Diretor executa fase a fase. Cada aprovação ensina o modelo.
            </p>

            {/* Phase progress checklist */}
            <div className="bg-pi-surface-muted/60 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-pi-text mb-1">Fases</p>
              {PHASE_INFO.map(({ id, label }) => {
                const st = phases[id]?.status ?? 'idle';
                return (
                  <div key={id} className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full flex-none", statusDot[st])} />
                    <span className="text-xs text-pi-text-muted flex-1">{label}</span>
                    <span className="text-[10px] text-pi-text-muted/60 capitalize">{st}</span>
                  </div>
                );
              })}
            </div>

            {/* Keyboard shortcuts */}
            <div className="bg-pi-surface-muted/60 rounded-xl p-3">
              <p className="text-xs font-medium text-pi-text mb-1.5">Atalhos</p>
              <div className="space-y-1">
                {[
                  { key: "R",       desc: "Rodar nó selecionado" },
                  { key: "Shift+R", desc: "Regenerar nó selecionado" },
                  { key: "Enter",   desc: "Aprovar nó selecionado" },
                  { key: "G",       desc: "Executar (modo selecionado)" },
                  { key: "Shift+G", desc: "Run All silencioso" },
                  { key: "S",       desc: "Salvar" },
                  { key: "Esc",     desc: "Cancelar run" },
                ].map(({ key, desc }) => (
                  <div key={key} className="flex justify-between text-xs gap-2">
                    <kbd className="bg-pi-surface text-pi-text rounded px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>
                    <span className="text-pi-text-muted text-right">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "brand" && (
          <div className="space-y-3">
            <p className="text-xs text-pi-text-muted">Brand Kit do cliente selecionado.</p>
            {clientId ? (
              <a
                href={`/clients/${clientId}/brand`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-pi-surface-muted/60 hover:bg-pi-surface-muted rounded-xl p-3 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Palette className="w-4 h-4 text-pi-accent" />
                  <span className="text-xs text-pi-text">↗ Abrir Brand Kit completo</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-pi-text-muted" />
              </a>
            ) : (
              <p className="text-xs text-pi-text-muted/60 text-center py-4">Nenhum cliente associado</p>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            <p className="text-xs text-pi-text-muted">Versões salvas automaticamente.</p>
            <div className="text-xs text-pi-text-muted/60 text-center py-6">
              Histórico disponível em breve
            </div>
          </div>
        )}

        {tab === "locks" && FLAGS.LOCKSET_ENABLED && (
          clientId ? (
            <LocksetPreview clientId={clientId} />
          ) : (
            <p className="text-xs text-pi-text-muted/60 text-center py-4">
              Selecione um cliente para ver os locks
            </p>
          )
        )}

        {tab === "assets" && FLAGS.ASSETS_ENABLED && (
          clientId ? (
            <AssetsTab clientId={clientId} />
          ) : (
            <p className="text-xs text-pi-text-muted/60 text-center py-4">
              Selecione um cliente para ver os assets
            </p>
          )
        )}
      </div>
    </div>
  );
}

// ── Execution dropdown ────────────────────────────────────────────────────────
function ExecuteDropdown({ clientId, onRunAll, onCheckpoint, onStep }: {
  clientId: string | null;
  onRunAll: () => void;
  onCheckpoint: (at: PhaseId) => void;
  onStep: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { mode, setMode, checkpointAt, setCheckpointAt } = useCanvasStore();

  return (
    <div className="relative">
      <div className="flex">
        {/* Main execute button */}
        <button
          onClick={() => {
            if (mode === "run-all") onRunAll();
            else if (mode === "checkpoint") onCheckpoint(checkpointAt ?? "prompt");
            else onStep();
          }}
          disabled={!clientId}
          className="flex items-center gap-1.5 bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/40 rounded-l-xl px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400/60 transition-colors shadow-lg disabled:opacity-40"
          title="Pressione G"
        >
          <Play className="w-3.5 h-3.5" />
          ▶ Executar
        </button>
        {/* Chevron to open dropdown */}
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center px-2 bg-emerald-500/10 backdrop-blur-sm border border-l-0 border-emerald-500/40 rounded-r-xl text-emerald-400 hover:bg-emerald-500/20 transition-colors shadow-lg"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-pi-surface border border-pi-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-1">
            <button
              onClick={() => { onStep(); setOpen(false); setMode("step"); }}
              className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-pi-surface-muted transition-colors text-left"
            >
              <Play className="w-3.5 h-3.5 text-pi-text-muted mt-0.5 flex-none" />
              <div>
                <p className="text-xs font-medium text-pi-text">Rodar próxima fase</p>
                <p className="text-[10px] text-pi-text-muted">Modo step — revisão entre cada fase</p>
              </div>
            </button>

            <div className="border-t border-pi-border my-1" />

            {CHECKPOINT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setCheckpointAt(opt.value); setMode("checkpoint"); onCheckpoint(opt.value); setOpen(false); }}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-pi-surface-muted transition-colors text-left",
                  mode === "checkpoint" && checkpointAt === opt.value && "bg-pi-surface-muted",
                )}
              >
                <span className="text-pi-text-muted text-xs mt-0.5 flex-none">⏸</span>
                <div>
                  <p className="text-xs font-medium text-pi-text">{opt.label}</p>
                  {opt.value === "prompt" && <p className="text-[10px] text-pi-text-muted">Recomendado — revise antes de gastar créditos</p>}
                </div>
              </button>
            ))}

            <div className="border-t border-pi-border my-1" />

            <button
              onClick={() => { onRunAll(); setOpen(false); setMode("run-all"); }}
              className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-pi-surface-muted transition-colors text-left"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-none" />
              <div>
                <p className="text-xs font-medium text-amber-300">Rodar tudo sem parar</p>
                <p className="text-[10px] text-pi-text-muted">Expert — sem pausas, sem aprovações</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Canvas inner component (needs ReactFlow context) ─────────────────────────
function CanvasInner({ flowId }: { flowId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [saving, setSaving] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<SideTab>("agent");
  const [loaded, setLoaded] = useState(false);
  const [checkpointToast, setCheckpointToast] = useState<string | null>(null);
  const [noClientToast, setNoClientToast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { phases, clientId: storeClientId, setClientId: setStoreClientId, setStatus, reset } = useCanvasStore();

  // URL sync: read ?clientId on mount; if absent show onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlClientId = params.get("clientId");
    if (urlClientId) {
      setStoreClientId(urlClientId);
    } else {
      setShowOnboarding(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dismiss onboarding once client is selected
  useEffect(() => {
    if (storeClientId) setShowOnboarding(false);
  }, [storeClientId]);

  const clientId = storeClientId ?? null;

  // Load flow from API
  useEffect(() => {
    if (!flowId) return;
    fetch(`/api/canvas/${flowId}`)
      .then(r => r.json())
      .then(({ flow }) => {
        if (flow?.nodes?.length) {
          setNodes(flow.nodes);
          setEdges(flow.edges ?? []);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [flowId, setNodes, setEdges]);

  // Autosave with 1s debounce
  const autosave = useCallback(() => {
    if (!loaded || !clientId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/canvas/${flowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, nodes, edges }),
        });
      } finally {
        setSaving(false);
      }
    }, 1000);
  }, [loaded, clientId, flowId, nodes, edges]);

  useEffect(() => {
    autosave();
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [autosave]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges(eds => addEdge({ ...connection, type: "glow", animated: true }, eds)),
    [setEdges],
  );

  // Get briefing from nodes
  function getBriefing() {
    const bn = nodes.find(n => n.type === "briefing");
    const d = (bn?.data ?? {}) as { clientId?: string; objetivo?: string; formato?: string };
    return {
      clientId: clientId ?? d.clientId ?? "",
      objetivo: d.objetivo ?? "",
      formato: d.formato ?? "feed",
    };
  }

  function requireClient(): boolean {
    if (!clientId) {
      setNoClientToast(true);
      setTimeout(() => setNoClientToast(false), 4000);
      document.getElementById("client-picker-trigger")?.focus();
      return false;
    }
    return true;
  }

  // Run with SSE
  async function startRun(mode: "step" | "checkpoint" | "run-all", checkpointAt?: PhaseId) {
    if (!requireClient()) return;
    const briefing = getBriefing();

    const res = await fetch("/api/canvas/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, mode, checkpointAt, briefing }),
    });

    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "phase_start") setStatus(event.phaseId as PhaseId, "running");
          if (event.type === "phase_done") setStatus(event.phaseId as PhaseId, "done");
          if (event.type === "phase_error") setStatus(event.phaseId as PhaseId, "error");
          if (event.type === "checkpoint_reached") {
            setCheckpointToast(`Pausei no ${event.phaseId}. Revise e aprove para continuar.`);
            setTimeout(() => setCheckpointToast(null), 5000);
          }
        } catch { /* ignore malformed SSE lines */ }
      }
    }
  }

  // Map node type → PhaseId for keyboard shortcuts
  const NODE_TYPE_TO_PHASE: Record<string, PhaseId> = {
    briefing:     "briefing",
    plan:         "plano",
    prompt:       "prompt",
    image:        "image",
    copy:         "copy",
    critic:       "critico",
    output:       "output",
    clientMemory: "memoria",
  };

  function getSelectedPhaseId(): PhaseId | null {
    const sel = nodes.find(n => n.selected);
    if (!sel?.type) return null;
    return NODE_TYPE_TO_PHASE[sel.type] ?? null;
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") reset();
      if (e.key === "s" || e.key === "S") autosave();

      // R — run selected node
      if ((e.key === "r" || e.key === "R") && !e.shiftKey) {
        const phaseId = getSelectedPhaseId();
        if (phaseId) window.dispatchEvent(new CustomEvent('canvas:run-phase', { detail: { phaseId } }));
      }
      // Shift+R — regenerate selected node
      if (e.key === "R" && e.shiftKey) {
        const phaseId = getSelectedPhaseId();
        if (phaseId) window.dispatchEvent(new CustomEvent('canvas:run-phase', { detail: { phaseId, triggeredBy: 'regenerate' } }));
      }

      if ((e.key === "g" || e.key === "G") && !e.shiftKey) {
        const { mode, checkpointAt } = useCanvasStore.getState();
        startRun(mode, checkpointAt);
      }
      if (e.key === "G" && e.shiftKey) {
        startRun("run-all");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, clientId, nodes]);

  return (
    <div className="flex h-full w-full bg-pi-bg">
      {/* Onboarding overlay */}
      {showOnboarding && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm bg-pi-bg/60"
          onClick={() => setShowOnboarding(false)}
        >
          <div onClick={e => e.stopPropagation()}>
            <ClientPicker variant="onboarding" onChange={() => setShowOnboarding(false)} />
          </div>
        </div>
      )}

      {/* React Flow canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "glow", animated: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          panOnScroll
          selectionOnDrag
          className="bg-pi-bg"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--pi-border)"
          />

          <Controls
            className="!bg-pi-surface !border-pi-border/60 !rounded-xl !overflow-hidden !shadow-lg"
            showInteractive={false}
          />

          <MiniMap
            nodeColor={n =>
              n.type === "briefing"     ? "#60a5fa" :
              n.type === "plan"         ? "#a78bfa" :
              n.type === "prompt"       ? "#f59e0b" :
              n.type === "image"        ? "#f472b6" :
              n.type === "copy"         ? "#34d399" :
              n.type === "reference"    ? "#f472b6" :
              n.type === "critic"       ? "#fb923c" :
              n.type === "output"       ? "#22d3ee" :
              n.type === "clientMemory" ? "#818cf8" :
              "#475569"
            }
            className="!bg-slate-900/90 !border-slate-700/60 !rounded-xl !shadow-lg"
            maskColor="rgba(2,6,23,0.6)"
          />

          {/* Top-left branding + client picker */}
          <Panel position="top-left">
            <div className="flex items-center gap-3 bg-pi-surface/90 backdrop-blur-sm border border-pi-border/60 rounded-2xl px-4 py-2.5 shadow-lg">
              <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">Canvas V3</p>
                <p className="text-xs text-slate-500">
                  {saving ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Salvando…
                    </span>
                  ) : "Autosave ativo"}
                </p>
              </div>
              <div className="w-px h-8 bg-slate-700/60" />
              <ClientPicker variant="header" />
              {FLAGS.COMPILER_ENABLED && (
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300">
                  <Cpu className="w-3 h-3" />
                  {compilerStrings.compilerBadge}
                </span>
              )}
            </div>
          </Panel>

          {/* Checkpoint toast */}
          {checkpointToast && (
            <Panel position="top-center">
              <div className="bg-amber-900/90 border border-amber-500/50 text-amber-100 text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm">
                ⏸ {checkpointToast}
              </div>
            </Panel>
          )}

          {/* No-client toast */}
          {noClientToast && (
            <Panel position="top-center">
              <div className="bg-red-900/90 border border-red-500/50 text-red-100 text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-sm">
                Escolha o cliente antes de executar o pipeline
              </div>
            </Panel>
          )}

          {/* Top-right action buttons */}
          <Panel position="top-right">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSideOpen(v => !v)}
                className="flex items-center gap-1.5 bg-pi-surface/90 backdrop-blur-sm border border-pi-border/60 rounded-xl px-3 py-2 text-xs font-medium text-pi-text-muted hover:text-pi-text hover:border-pi-border transition-colors shadow-lg"
              >
                {sideOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                Painel
              </button>

              <button
                onClick={() => autosave()}
                className="flex items-center gap-1.5 bg-pi-surface/90 backdrop-blur-sm border border-pink-500/30 rounded-xl px-3 py-2 text-xs font-medium text-pink-400 hover:border-pink-400/60 hover:text-pink-300 transition-colors shadow-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar
              </button>

              <ExecuteDropdown
                clientId={clientId}
                onStep={() => startRun("step")}
                onCheckpoint={(at) => startRun("checkpoint", at)}
                onRunAll={() => startRun("run-all")}
              />
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Side panel */}
      {sideOpen && (
        <div className="w-64 flex-none bg-pi-surface/95 border-l border-pi-border backdrop-blur-sm">
          <SidePanel
            tab={sideTab}
            setTab={setSideTab}
            clientId={clientId}
            flowId={flowId}
            phases={phases}
          />
        </div>
      )}
    </div>
  );
}

// ── Page wrapper ─────────────────────────────────────────────────────────────
export default function CanvasFlowPage() {
  const params = useParams();
  const flowId = Array.isArray(params.flowId) ? params.flowId[0] : (params.flowId as string);

  return (
    <ReactFlowProvider>
      <div className="h-screen w-full overflow-hidden">
        <CanvasInner flowId={flowId} />
      </div>
    </ReactFlowProvider>
  );
}
