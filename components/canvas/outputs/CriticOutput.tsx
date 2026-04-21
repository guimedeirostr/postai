"use client";

export function CriticOutput({ output }: { output: Record<string, unknown> }) {
  const score = output.score as number | undefined;
  const notes = output.notes as string | undefined;

  const scoreColor =
    score == null   ? "text-pi-text-muted" :
    score >= 80     ? "text-emerald-400" :
    score >= 60     ? "text-amber-400"   :
                      "text-red-400";

  return (
    <div className="space-y-1.5 text-[11px]">
      {score != null && (
        <div className="flex items-center gap-2">
          <span className={`text-xl font-bold font-mono ${scoreColor}`}>{score}</span>
          <span className="text-pi-text-muted/50">/100</span>
          <div className="flex-1 h-1.5 rounded-full bg-pi-surface-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
      )}
      {notes && (
        <p className="text-pi-text/70 leading-relaxed line-clamp-4">{notes}</p>
      )}
    </div>
  );
}
