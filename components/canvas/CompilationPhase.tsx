"use client";

import React from "react";
import { CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import { compilerStrings } from "@/lib/i18n/pt-br";
import type { CompileOutput } from "@/types";

interface CompilationPhaseProps {
  status: "idle" | "running" | "done" | "error";
  output?: CompileOutput | null;
  error?: string | null;
}

export function CompilationPhase({ status, output, error }: CompilationPhaseProps) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium">
      {status === "running" && (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
          <span className="text-violet-600">{compilerStrings.compilingStatus}</span>
        </>
      )}
      {status === "done" && output && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-emerald-700">
            {compilerStrings.summaryLine(output.trace.slotsRendered, output.warnings.length)}
          </span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-amber-700">{error ?? compilerStrings.errors.compile_failed}</span>
        </>
      )}
    </div>
  );
}
