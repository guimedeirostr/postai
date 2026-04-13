"use client";

import React, { useCallback, useEffect } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ClientNode            from "@/components/canvas/nodes/ClientNode";
import StrategyNode          from "@/components/canvas/nodes/StrategyNode";
import CopyNode              from "@/components/canvas/nodes/CopyNode";
import CreativeDirectorNode  from "@/components/canvas/nodes/CreativeDirectorNode";
import CompositorNode        from "@/components/canvas/nodes/CompositorNode";
import PostFinalNode         from "@/components/canvas/nodes/PostFinalNode";
import { useCanvasStore } from "@/lib/canvas-store";
import { Sparkles, RotateCcw } from "lucide-react";

// ── Node type registry ────────────────────────────────────────────────────────
const nodeTypes = {
  client:     ClientNode,
  strategy:   StrategyNode,
  copy:       CopyNode,
  creative:   CreativeDirectorNode,
  compositor: CompositorNode,
  postfinal:  PostFinalNode,
} as const;

// ── Initial layout — L-shaped pipeline ───────────────────────────────────────
//
//  Row 1 (top):    Client(40,180) → Strategy(380,60) → Copy(700,60)
//                                                              ↓
//  Row 2 (bottom): PostFinal(1420,400) ← Compositor(1060,400) ← CreativeDirector(700,400)
//
const INITIAL_NODES: Node[] = [
  {
    id:       "client-1",
    type:     "client",
    position: { x: 40,   y: 180 },
    data:     { label: "Cliente" },
  },
  {
    id:       "strategy-1",
    type:     "strategy",
    position: { x: 380,  y: 60 },
    data:     { label: "Estratégia" },
  },
  {
    id:       "copy-1",
    type:     "copy",
    position: { x: 700,  y: 60 },
    data:     { label: "Copy" },
  },
  {
    id:       "creative-1",
    type:     "creative",
    position: { x: 700,  y: 400 },
    data:     { label: "Diretor Criativo" },
  },
  {
    id:       "compositor-1",
    type:     "compositor",
    position: { x: 1060, y: 400 },
    data:     { label: "Compositor" },
  },
  {
    id:       "postfinal-1",
    type:     "postfinal",
    position: { x: 1420, y: 400 },
    data:     { label: "Post Final" },
  },
];

const INITIAL_EDGES: Edge[] = [
  {
    id:           "e-client-strategy",
    source:       "client-1",
    sourceHandle: "out",
    target:       "strategy-1",
    targetHandle: "in",
    animated:     true,
    style:        { stroke: "#8b5cf6", strokeWidth: 2 },
  },
  {
    id:           "e-strategy-copy",
    source:       "strategy-1",
    sourceHandle: "out",
    target:       "copy-1",
    targetHandle: "in",
    animated:     true,
    style:        { stroke: "#8b5cf6", strokeWidth: 2 },
  },
  {
    id:           "e-copy-creative",
    source:       "copy-1",
    sourceHandle: "out",
    target:       "creative-1",
    targetHandle: "in",
    animated:     true,
    style:        { stroke: "#8b5cf6", strokeWidth: 2 },
  },
  {
    id:           "e-creative-compositor",
    source:       "creative-1",
    sourceHandle: "out",
    target:       "compositor-1",
    targetHandle: "in",
    animated:     true,
    style:        { stroke: "#8b5cf6", strokeWidth: 2 },
  },
  {
    id:           "e-compositor-postfinal",
    source:       "compositor-1",
    sourceHandle: "out",
    target:       "postfinal-1",
    targetHandle: "in",
    animated:     true,
    style:        { stroke: "#8b5cf6", strokeWidth: 2 },
  },
];

// ── Dynamic edge color based on pipeline status ───────────────────────────────
function useAnimatedEdges(edges: Edge[], setEdges: (updater: (eds: Edge[]) => Edge[]) => void) {
  const strategyStatus   = useCanvasStore(s => s.strategyStatus);
  const copyStatus       = useCanvasStore(s => s.copyStatus);
  const imageStatus      = useCanvasStore(s => s.imageStatus);
  const compositorStatus = useCanvasStore(s => s.compositorStatus);

  useEffect(() => {
    const statusColor = (status: string) =>
      status === "done"    ? "#10b981" :
      status === "loading" ? "#f59e0b" :
      status === "polling" ? "#3b82f6" :
      status === "error"   ? "#ef4444" :
      "#8b5cf6";

    setEdges(eds => eds.map(e => {
      const edgeStatus =
        e.id === "e-client-strategy"     ? strategyStatus   :
        e.id === "e-strategy-copy"       ? copyStatus       :
        e.id === "e-copy-creative"       ? copyStatus       :
        e.id === "e-creative-compositor" ? imageStatus      :
        e.id === "e-compositor-postfinal"? compositorStatus :
        "idle";

      return {
        ...e,
        animated: ["loading", "polling"].includes(edgeStatus),
        style: {
          stroke:      statusColor(edgeStatus),
          strokeWidth: 2,
        },
      };
    }));
  }, [strategyStatus, copyStatus, imageStatus, compositorStatus, setEdges]);
}

// ── Main Canvas page ──────────────────────────────────────────────────────────
export default function CanvasPage() {
  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);

  const resetAll = useCanvasStore(s => s.resetStep);

  // Animate edges as pipeline progresses
  useAnimatedEdges(edges, setEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges(eds => addEdge({ ...connection, animated: true, style: { stroke: "#8b5cf6", strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  return (
    <div className="w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        {/* Background grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#cbd5e1"
        />

        {/* Zoom + fit controls */}
        <Controls
          className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
          showInteractive={false}
        />

        {/* Minimap */}
        <MiniMap
          nodeColor={(n) =>
            n.type === "client"     ? "#7c3aed" :
            n.type === "strategy"   ? "#2563eb" :
            n.type === "copy"       ? "#059669" :
            n.type === "creative"   ? "#d97706" :
            n.type === "compositor" ? "#0891b2" :
            n.type === "postfinal"  ? "#16a34a" :
            "#6b7280"
          }
          className="bg-white border border-slate-200 rounded-xl shadow-sm"
          maskColor="rgba(148,163,184,0.15)"
        />

        {/* Header panel */}
        <Panel position="top-left">
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Canvas IA</p>
              <p className="text-xs text-slate-400">Pipeline visual de geração de posts</p>
            </div>
          </div>
        </Panel>

        {/* Reset panel */}
        <Panel position="top-right">
          <button
            onClick={() => resetAll("all")}
            className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm nodrag"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reiniciar pipeline
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
