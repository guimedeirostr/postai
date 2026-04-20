"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Zap, AtSign, RefreshCw, Layers, RotateCcw } from "lucide-react";
import { useEffect, useCallback, useRef, useState } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import { FLAGS } from "@/lib/flags";
import { compilerStrings } from "@/lib/i18n/pt-br";
import { CompilationPhase } from "@/components/canvas/CompilationPhase";
import { SlotsDrawer } from "@/components/canvas/SlotsDrawer";
import type { NodeStatus } from "./BaseNodeV3";
import type { CompileOutput } from "@/types";

interface PromptData {
  prompt?:           string;
  assetUrl?:         string;
  status?:           NodeStatus;
  slideN?:           number;
  clientId?:         string;
  flowId?:           string;
  postId?:           string;
  slideId?:          string;
  format?:           string;
  model?:            string;
  // Ciclo 3 Compiler fields
  compiledText?:     string;
  originalCompiled?: string;
  compiledOutput?:   CompileOutput | null;
  wasEdited?:        boolean;
}

export default function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptData;
  const { updateNodeData } = useReactFlow();
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.prompt.status;
  const isRunnable = canRun(phases, 'prompt', storeClientId);

  const clientId = d.clientId ?? storeClientId ?? null;

  const [compilationStatus, setCompilationStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [compilationError, setCompilationError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const compiledAtRef = useRef<string | null>(null);
  const hasCompiledRef = useRef(false);

  const compile = useCallback(async (force = false) => {
    if (!FLAGS.COMPILER_ENABLED || !clientId) return;
    if (hasCompiledRef.current && !force) return;
    if (compilationStatus === "running") return;

    setCompilationStatus("running");
    setStatus('compilacao', 'running');
    setCompilationError(null);
    try {
      const res = await fetch("/api/compiler/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          brief: {
            objective: "",
            format: (d.format ?? "feed") as "feed" | "story" | "carousel" | "reels" | "linkedin_post",
            phase: "prompt" as const,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const output: CompileOutput = await res.json();
      compiledAtRef.current = new Date().toLocaleTimeString("pt-BR");
      hasCompiledRef.current = true;
      updateNodeData(id, {
        prompt: output.compiled,
        compiledText: output.compiled,
        originalCompiled: output.compiled,
        compiledOutput: output,
        wasEdited: false,
      });
      setCompilationStatus("done");
      setStatus('compilacao', 'done');
      console.log(JSON.stringify({ event: 'compiler.canvas.recompile', cid: clientId, hadManualEdits: !!d.wasEdited }));
    } catch (e) {
      setCompilationStatus("error");
      setStatus('compilacao', 'error');
      setCompilationError(String((e as Error)?.message ?? e));
    }
  }, [clientId, d.format, d.wasEdited, compilationStatus, id, updateNodeData, setStatus]);

  // Auto-compile on mount when flag is ON and clientId is known
  useEffect(() => {
    if (FLAGS.COMPILER_ENABLED && clientId && !hasCompiledRef.current) {
      compile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handlePromptChange(val: string) {
    const wasEdited = FLAGS.COMPILER_ENABLED && !!d.originalCompiled && val !== d.originalCompiled;
    updateNodeData(id, { prompt: val, wasEdited });
  }

  function handleRestore() {
    if (d.originalCompiled) {
      updateNodeData(id, { prompt: d.originalCompiled, wasEdited: false });
    }
  }

  async function handleRecompile() {
    if (d.wasEdited) {
      const ok = window.confirm(compilerStrings.recompileConfirm);
      if (!ok) return;
    }
    hasCompiledRef.current = false;
    console.log(JSON.stringify({ event: 'compiler.canvas.recompile', cid: clientId, hadManualEdits: !!d.wasEdited }));
    await compile(true);
  }

  function handleViewSlots() {
    console.log(JSON.stringify({ event: 'compiler.canvas.view_slots', cid: clientId }));
    setDrawerOpen(true);
  }

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!d.prompt?.trim() || !clientId) return;
    const input = { prompt: d.prompt, clientId, model: d.model ?? 'flux-pro', format: d.format ?? 'feed' };
    setStatus('prompt', 'running');
    setInputHash('prompt', hashInput(input));
    updateNodeData(id, { status: "loading" });
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, phaseId: 'prompt', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enfileirar");
      const assetUrl = json.output?.assetUrl;
      if (assetUrl) updateNodeData(id, { assetUrl, status: "done" });
      setOutput('prompt', json.output ?? {});
      markStaleDownstream('prompt');
    } catch {
      setStatus('prompt', 'error');
      updateNodeData(id, { status: "error" });
    }
  }

  async function handleApprove() {
    approve('prompt');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'prompt', clientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'prompt') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.prompt, clientId, d.model, d.format]);

  const headerLabel = (
    <span className="flex items-center gap-1.5">
      {`Prompt${d.slideN ? ` · Slide ${d.slideN}` : ""}`}
      {FLAGS.COMPILER_ENABLED && d.wasEdited && (
        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {compilerStrings.editedBadge}
        </span>
      )}
    </span>
  );

  return (
    <>
      <BaseNodeV3
        label={headerLabel as unknown as string}
        icon={<Zap className="w-3.5 h-3.5" />}
        accentColor="#f59e0b"
        selected={selected}
        width={300}
        phaseId="prompt"
        phaseStatus={phaseStatus}
        onRunToHere={() => run('run-to-here')}
        onRegenerate={() => run('regenerate')}
        onReset={() => { setStatus('prompt', 'idle'); updateNodeData(id, { assetUrl: undefined, status: 'idle' }); }}
        onApprove={handleApprove}
      >
        <div className="space-y-2.5">
          {/* Compilation phase indicator */}
          {FLAGS.COMPILER_ENABLED && compilationStatus !== "idle" && (
            <CompilationPhase
              status={compilationStatus}
              output={d.compiledOutput ?? null}
              error={compilationError}
            />
          )}

          {/* Compiler action buttons */}
          {FLAGS.COMPILER_ENABLED && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRecompile}
                disabled={compilationStatus === "running" || !clientId}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:bg-slate-600/60 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                {compilerStrings.recompileButton}
              </button>
              {d.compiledOutput && (
                <button
                  onClick={handleViewSlots}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:bg-slate-600/60 transition-colors"
                >
                  <Layers className="w-3 h-3" />
                  {compilerStrings.viewSlotsButton}
                </button>
              )}
              {d.wasEdited && d.originalCompiled && (
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {compilerStrings.restoreCompiled}
                </button>
              )}
            </div>
          )}

          <div className="relative">
            <textarea
              value={d.prompt ?? ""}
              onChange={e => handlePromptChange(e.target.value)}
              placeholder={FLAGS.COMPILER_ENABLED ? "Compilando prompt…" : "Descreva a imagem… use @img1 para referenciar assets"}
              rows={3}
              className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/50 resize-none"
            />
            <AtSign className="absolute right-2.5 bottom-2.5 w-3.5 h-3.5 text-slate-600" />
          </div>

          {/* Summary line */}
          {FLAGS.COMPILER_ENABLED && d.compiledOutput && (
            <button
              onClick={handleViewSlots}
              className="w-full text-left text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {compilerStrings.summaryLine(
                d.compiledOutput.trace.slotsRendered,
                d.compiledOutput.warnings.length,
              )}
            </button>
          )}

          {d.assetUrl && (
            <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
              <img src={d.assetUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="flex justify-end border-t border-slate-700/40 pt-2">
            <InlineRunButton
              status={phaseStatus}
              canRun={isRunnable}
              onRun={() => run('step')}
              label="Gerar imagem"
              doneLabel="Regenerar"
              size="sm"
            />
          </div>
        </div>
      </BaseNodeV3>

      {d.compiledOutput && (
        <SlotsDrawer
          open={drawerOpen}
          output={d.compiledOutput}
          compiledAt={compiledAtRef.current ?? undefined}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
