"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewLockAsPromptHint } from "@/lib/lockset/injection";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LockSuggestion, BrandLock } from "@/types";

interface Props {
  suggestions: LockSuggestion[];
  onApprove:   (locks: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[]) => Promise<void>;
  onSkip:      () => void;
}

export function SuggestionsBanner({ suggestions, onApprove, onSkip }: Props) {
  const [selected,  setSelected]  = useState<Set<number>>(new Set(suggestions.map((_, i) => i)));
  const [expanded,  setExpanded]  = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);

  function toggleSelect(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleExpand(i: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function handleApprove() {
    const chosen = suggestions
      .filter((_, i) => selected.has(i))
      .map(s => s.lock);
    if (!chosen.length) return;
    setApproving(true);
    try { await onApprove(chosen); } finally { setApproving(false); }
  }

  return (
    <div className="border border-violet-200 bg-violet-50 rounded-2xl p-5 mb-6">
      <h3 className="font-semibold text-violet-900 text-sm mb-1">{PT_BR.lockset.suggestionsTitle}</h3>
      <p className="text-xs text-violet-700 mb-4">Identifiquei {suggestions.length} padrões recorrentes. Você aprova?</p>

      <div className="space-y-3 mb-4">
        {suggestions.map((s, i) => {
          const hint = previewLockAsPromptHint({ ...s.lock, id: '', createdAt: 0, updatedAt: 0, createdBy: '' });
          const scopeLabel = PT_BR.lockset.scopes[s.lock.scope];
          return (
            <div key={i} className="bg-white rounded-xl border border-violet-100 p-3">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className="mt-0.5 accent-violet-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    <span className="text-violet-600">{scopeLabel}</span>
                    {" — "}{s.lock.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.reason}
                    {" · "}
                    <span className="font-medium">{Math.round(s.confidence * 100)}% confiança</span>
                  </p>
                  <button
                    onClick={() => toggleExpand(i)}
                    className="flex items-center gap-1 text-xs text-violet-600 hover:underline mt-1"
                  >
                    {expanded.has(i) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expanded.has(i) ? "Ocultar preview" : "Ver preview do prompt-hint"}
                  </button>
                  {expanded.has(i) && (
                    <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-600">
                      <span className="text-[10px] font-medium text-slate-400 uppercase block mb-0.5">Slot: {hint.slotKey}</span>
                      {hint.hint}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" size="sm" onClick={onSkip} disabled={approving}>{PT_BR.lockset.skip}</Button>
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={approving || selected.size === 0}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {approving ? "Salvando..." : PT_BR.lockset.approveSelected}
        </Button>
      </div>
    </div>
  );
}
