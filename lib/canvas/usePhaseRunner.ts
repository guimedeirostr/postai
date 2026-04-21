"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import type { PhaseId } from "@/types";

export interface PhaseRunnerResult {
  isRunning:   boolean;
  elapsedMs:   number;
  canRunPhase: boolean;
  run:         (forceRerun?: boolean) => Promise<void>;
}

export function usePhaseRunner(phaseId: PhaseId): PhaseRunnerResult {
  const clientId = useCanvasStore(s => s.clientId);
  const flowId   = useCanvasStore(s => s.flowId);
  const phases   = useCanvasStore(s => s.phases);
  const { setStatus, setOutput, appendTrace, clearPhaseTraces } = useCanvasStore();

  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phaseStatus = phases[phaseId]?.status ?? "idle";
  const isRunning   = phaseStatus === "running";
  const canRunPhase = canRun(phases, phaseId, clientId);

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const run = useCallback(async (forceRerun = false) => {
    if (!clientId || !flowId) return;
    if (forceRerun) clearPhaseTraces(phaseId);

    setStatus(phaseId, "running");
    setElapsedMs(0);
    const startAt = Date.now();
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startAt), 200);

    try {
      const res = await fetch("/api/canvas/run-phase", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId, flowId, phaseId, forceRerun }),
      });

      if (!res.ok || !res.body) {
        setStatus(phaseId, "error");
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "phase_start") setStatus(phaseId, "running");
            if (event.type === "phase_done") {
              setStatus(phaseId, "done");
              if (event.output) setOutput(phaseId, event.output);
            }
            if (event.type === "phase_error") setStatus(phaseId, "error");
            if (event.type === "node_trace") {
              appendTrace({
                phaseId,
                slideN:  event.slideN ?? undefined,
                ts:      event.ts      as number,
                level:   event.level   as import("@/types").TraceLevel,
                code:    event.code    as import("@/types").TraceCode,
                message: event.message as string,
                meta:    event.meta    as Record<string, unknown> | undefined,
              });
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      console.error("[usePhaseRunner] fetch error", { phaseId, err: (err as Error).message });
      setStatus(phaseId, "error");
    } finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [clientId, flowId, phaseId, setStatus, setOutput, appendTrace, clearPhaseTraces]);

  return { isRunning, elapsedMs, canRunPhase, run };
}
