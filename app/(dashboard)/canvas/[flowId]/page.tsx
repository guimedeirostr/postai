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
  Sparkles, Save, Loader2, Play,
  LayoutTemplate, Palette, History,
  ChevronRight, ChevronLeft, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

import GlowEdge from "@/components/canvas/edges/GlowEdge";
import BriefingNode    from "@/components/canvas/nodes/v3/BriefingNode";
import PlanNode        from "@/components/canvas/nodes/v3/PlanNode";
import PromptNode      from "@/components/canvas/nodes/v3/PromptNode";
import CopyNodeV3      from "@/components/canvas/nodes/v3/CopyNodeV3";
import ReferenceNode   from "@/components/canvas/nodes/v3/ReferenceNode";
import CriticNode      from "@/components/canvas/nodes/v3/CriticNode";
import OutputNode      from "@/components/canvas/nodes/v3/OutputNode";
import ClientMemoryNode from "@/components/canvas/nodes/v3/ClientMemoryNode";

// ── Node / edge type registries ───────────────────────────────────────────────
const nodeTypes = {
  briefing:     BriefingNode,
  plan:         PlanNode,
  prompt:       PromptNode,
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
  { id: "briefing-1", type: "briefing",     position: { x: 60,  y: 200 }, data: { objetivo: "", formato: "feed" } },
  { id: "memory-1",   type: "clientMemory", position: { x: 60,  y: 420 }, data: {} },
  { id: "plan-1",     type: "plan",         position: { x: 440, y: 160 }, data: {} },
  { id: "prompt-1",   type: "prompt",       position: { x: 840, y: 80  }, data: { slideN: 1 } },
  { id: "copy-1",     type: "copy",         position: { x: 840, y: 320 }, data: {} },
  { id: "critic-1",   type: "critic",       position: { x: 1200, y: 200 }, data: {} },
  { id: "output-1",   type: "output",       position: { x: 1520, y: 200 }, data: {} },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1", source: "briefing-1",  target: "plan-1",    type: "glow", animated: true },
  { id: "e2", source: "memory-1",    target: "plan-1",    type: "glow", animated: false },
  { id: "e3", source: "plan-1",      target: "prompt-1",  type: "glow", animated: true },
  { id: "e4", source: "plan-1",      target: "copy-1",    type: "glow", animated: true },
  { id: "e5", source: "prompt-1",    target: "critic-1",  type: "glow", animated: false },
  { id: "e6", source: "copy-1",      target: "critic-1",  type: "glow", animated: false },
  { id: "e7", source: "critic-1",    target: "output-1",  type: "glow", animated: false },
];

// ── Side panel tabs ───────────────────────────────────────────────────────────
type SideTab = "agent" | "brand" | "history";

function SidePanel({ tab, setTab, clientId, flowId }: {
  tab: SideTab;
  setTab: (t: SideTab) => void;
  clientId: string | null;
  flowId: string;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-slate-800">
        {([
          { id: "agent",   label: "Agente",   icon: <Zap className="w-3.5 h-3.5" /> },
          { id: "brand",   label: "Brand Kit", icon: <Palette className="w-3.5 h-3.5" /> },
          { id: "history", label: "Histórico", icon: <History className="w-3.5 h-3.5" /> },
        ] as { id: SideTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "text-violet-400 border-b-2 border-violet-500 -mb-px"
                : "text-slate-500 hover:text-slate-400",
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
            <p className="text-xs text-slate-500">
              O Agente orquestra o pipeline. Clique em <strong className="text-slate-300">Gerar Todos</strong> para rodar todas as fases em sequência.
            </p>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">Fases</p>
              {[
                { phase: "Briefing",  color: "#60a5fa" },
                { phase: "Plano",     color: "#a78bfa" },
                { phase: "Prompt",    color: "#f59e0b" },
                { phase: "Copy",      color: "#34d399" },
                { phase: "Crítica",   color: "#fb923c" },
                { phase: "Output",    color: "#22d3ee" },
              ].map(({ phase, color }) => (
                <div key={phase} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-slate-400">{phase}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs font-medium text-slate-300 mb-1.5">Atalhos</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <kbd className="bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 font-mono">G</kbd>
                  <span className="text-slate-500">Gerar todos</span>
                </div>
                <div className="flex justify-between text-xs">
                  <kbd className="bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 font-mono">S</kbd>
                  <span className="text-slate-500">Salvar</span>
                </div>
                <div className="flex justify-between text-xs">
                  <kbd className="bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 font-mono">Space</kbd>
                  <span className="text-slate-500">Pan livre</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "brand" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Brand Kit do cliente selecionado.</p>
            {clientId ? (
              <a
                href={`/clients/${clientId}/brand`}
                className="flex items-center justify-between bg-slate-800/60 hover:bg-slate-700/60 rounded-xl p-3 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Palette className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-300">Abrir Brand Kit</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              </a>
            ) : (
              <p className="text-xs text-slate-600 text-center py-4">Nenhum cliente associado</p>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Versões salvas automaticamente.</p>
            <div className="text-xs text-slate-600 text-center py-6">
              Histórico disponível em breve
            </div>
          </div>
        )}
      </div>
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
  const [clientId, setClientId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive clientId from flowId format: "{clientId}_{flowId}"
  useEffect(() => {
    if (flowId && !flowId.startsWith("new-")) {
      const parts = flowId.split("_");
      if (parts.length > 1) setClientId(parts[0]);
    } else if (flowId?.startsWith("new-")) {
      setClientId(flowId.slice(4));
    }
  }, [flowId]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "g" || e.key === "G") {
        // TODO: trigger generate all
      }
      if (e.key === "s" || e.key === "S") {
        autosave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autosave]);

  return (
    <div className="flex h-full w-full bg-slate-950">
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
          className="bg-slate-950"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#1e293b"
          />

          <Controls
            className="!bg-slate-900 !border-slate-700/60 !rounded-xl !overflow-hidden !shadow-lg"
            showInteractive={false}
          />

          <MiniMap
            nodeColor={n =>
              n.type === "briefing"     ? "#60a5fa" :
              n.type === "plan"         ? "#a78bfa" :
              n.type === "prompt"       ? "#f59e0b" :
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

          {/* Top-left branding + save status */}
          <Panel position="top-left">
            <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 rounded-2xl px-4 py-2.5 shadow-lg">
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
            </div>
          </Panel>

          {/* Top-right action buttons */}
          <Panel position="top-right">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSideOpen(v => !v)}
                className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors shadow-lg"
              >
                {sideOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                Painel
              </button>

              <button
                onClick={() => autosave()}
                className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-sm border border-pink-500/30 rounded-xl px-3 py-2 text-xs font-medium text-pink-400 hover:border-pink-400/60 hover:text-pink-300 transition-colors shadow-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar
              </button>

              <button
                className="flex items-center gap-1.5 bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/40 rounded-xl px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400/60 transition-colors shadow-lg"
                title="Pressione G"
              >
                <Play className="w-3.5 h-3.5" />
                Gerar Todos
              </button>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Side panel */}
      {sideOpen && (
        <div className="w-64 flex-none bg-slate-900/95 border-l border-slate-800 backdrop-blur-sm">
          <SidePanel
            tab={sideTab}
            setTab={setSideTab}
            clientId={clientId}
            flowId={flowId}
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
