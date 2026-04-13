"use client";

import { useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Users } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";

// ── Spinner ───────────────────────────────────────────────────────────────────

function ButtonSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type ClientNodeType = Node<{ label: string }, "client">;

// ── ClientNode ────────────────────────────────────────────────────────────────

export default function ClientNode({ selected }: NodeProps<ClientNodeType>) {
  const {
    clients,
    selectedClientId,
    campaignFocus,
    strategyStatus,
    copyStatus,
    imageStatus,
    loadClients,
    selectClient,
    setCampaignFocus,
    runStrategy,
    runCopy,
    runImage,
  } = useCanvasStore();

  // Load clients on mount (idempotent — store guards against double-fetch)
  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Derive overall "any step is busy" flag for disabling the run button
  const isBusy =
    strategyStatus === "loading" ||
    strategyStatus === "polling" ||
    copyStatus === "loading" ||
    copyStatus === "polling" ||
    imageStatus === "loading" ||
    imageStatus === "polling";

  // Derive the composite status for BaseNode status bar
  const nodeStatus =
    imageStatus === "done"    ? "done"    :
    imageStatus === "error"   ? "error"   :
    imageStatus === "polling" ? "polling" :
    copyStatus  === "loading" ? "loading" :
    strategyStatus === "loading" ? "loading" :
    selectedClientId          ? "idle"    :
    "idle";

  // Full pipeline runner: strategy → copy → image in sequence
  const handleRunPipeline = useCallback(async () => {
    if (!selectedClientId || isBusy) return;
    await runStrategy();
    // Check that strategy succeeded before proceeding
    const afterStrategy = useCanvasStore.getState().strategyStatus;
    if (afterStrategy !== "done") return;
    await runCopy();
    const afterCopy = useCanvasStore.getState().copyStatus;
    if (afterCopy !== "done") return;
    await runImage();
  }, [selectedClientId, isBusy, runStrategy, runCopy, runImage]);

  return (
    <>
      <BaseNode
        title="Cliente"
        icon={<Users />}
        status={nodeStatus}
        selected={selected}
        width={280}
      >
        {/* Client selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            Cliente
          </label>
          <select
            className={[
              "nodrag nopan",
              "w-full rounded-lg border border-slate-200 bg-white",
              "px-2.5 py-1.5 text-sm text-slate-800",
              "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
            value={selectedClientId ?? ""}
            onChange={(e) => {
              if (e.target.value) selectClient(e.target.value);
            }}
            disabled={isBusy}
          >
            <option value="" disabled>
              Selecione um cliente
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Campaign focus input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            Foco de campanha{" "}
            <span className="normal-case text-slate-400">(opcional)</span>
          </label>
          <input
            type="text"
            className={[
              "nodrag nopan",
              "w-full rounded-lg border border-slate-200 bg-white",
              "px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
            placeholder="Ex: Dia das Mães"
            value={campaignFocus}
            onChange={(e) => setCampaignFocus(e.target.value)}
            disabled={isBusy}
          />
        </div>

        {/* Full pipeline button */}
        <button
          type="button"
          onClick={handleRunPipeline}
          disabled={!selectedClientId || isBusy}
          className={[
            "nodrag nopan",
            "mt-1 w-full flex items-center justify-center gap-2",
            "rounded-lg px-3 py-2 text-sm font-semibold text-white",
            "transition-colors duration-150",
            !selectedClientId || isBusy
              ? "bg-violet-300 cursor-not-allowed"
              : "bg-violet-600 hover:bg-violet-700 active:bg-violet-800",
          ].join(" ")}
        >
          {isBusy ? (
            <>
              <ButtonSpinner />
              Processando...
            </>
          ) : (
            <>▶ Gerar Post Completo</>
          )}
        </button>
      </BaseNode>

      {/* Output handle — right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />
    </>
  );
}
