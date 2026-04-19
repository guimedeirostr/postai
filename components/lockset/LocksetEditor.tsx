"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, History, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LockCard } from "./LockCard";
import { LockForm } from "./LockForm";
import { SuggestionsBanner } from "./SuggestionsBanner";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { BrandLock, BrandLockset, LockScope, LockSuggestion } from "@/types";

const SCOPE_ORDER: LockScope[] = ['color', 'typography', 'composition', 'signature', 'cta', 'tone', 'forbidden'];

interface Props {
  clientId: string;
  clientName?: string;
}

export function LocksetEditor({ clientId, clientName }: Props) {
  const [lockset,     setLockset]     = useState<BrandLockset | null>(null);
  const [suggestions, setSuggestions] = useState<LockSuggestion[] | null>(null);
  const [showSugg,    setShowSugg]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<BrandLock | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<BrandLock | undefined>();
  const [showHistory, setShowHistory] = useState(false);
  const [versions,    setVersions]    = useState<{ versionId: string; version: number; timestamp: number; changesSummary: string; locksCount: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [lRes, sRes] = await Promise.all([
      fetch(`/api/locksets/${clientId}`),
      fetch(`/api/locksets/${clientId}/suggestions`),
    ]);
    if (lRes.ok) setLockset(await lRes.json());
    if (sRes.ok) {
      const data = await sRes.json();
      setSuggestions(data.suggestions ?? []);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (lockset && lockset.locks.length === 0 && suggestions && suggestions.length > 0) {
      setShowSugg(true);
    }
  }, [lockset, suggestions]);

  async function handleAddLock(data: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) {
    const res = await fetch(`/api/locksets/${clientId}/locks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) { setShowForm(false); await load(); }
  }

  async function handleEditLock(data: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) {
    if (!editing) return;
    await fetch(`/api/locksets/${clientId}/locks/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditing(undefined);
    await load();
  }

  async function handleDeleteLock(lock: BrandLock) {
    await fetch(`/api/locksets/${clientId}/locks?lockId=${lock.id}`, { method: 'DELETE' });
    setDeleteConfirm(undefined);
    await load();
  }

  async function handleToggle(lock: BrandLock) {
    await fetch(`/api/locksets/${clientId}/locks/${lock.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !lock.active }),
    });
    await load();
  }

  async function handleDuplicate(lock: BrandLock) {
    const { id: _id, createdAt: _ca, updatedAt: _ua, createdBy: _cb, ...rest } = lock;
    await handleAddLock({ ...rest, description: `${rest.description} (cópia)` });
  }

  async function handleApprovesuggestions(locks: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[]) {
    for (const lock of locks) {
      await fetch(`/api/locksets/${clientId}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lock),
      });
    }
    setShowSugg(false);
    await load();
  }

  async function loadHistory() {
    const res = await fetch(`/api/locksets/${clientId}/versions`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions ?? []);
    }
    setShowHistory(true);
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  const activeLocks = lockset?.locks.filter(l => l.active !== false) ?? [];
  const grouped = SCOPE_ORDER.reduce<Record<string, BrandLock[]>>((acc, scope) => {
    const locks = (lockset?.locks ?? []).filter(l => l.scope === scope);
    if (locks.length) acc[scope] = locks;
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">{PT_BR.lockset.subtitle}</p>
          {lockset && lockset.version > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              Versão {lockset.version} · {activeLocks.length} {activeLocks.length === 1 ? 'trava ativa' : 'travas ativas'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadHistory}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <History className="w-3.5 h-3.5" /> Histórico ↻
          </button>
          <Button size="sm" onClick={() => setShowForm(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {PT_BR.lockset.newLock}
          </Button>
        </div>
      </div>

      {/* Suggestions banner */}
      {showSugg && suggestions && suggestions.length > 0 && (
        <SuggestionsBanner
          suggestions={suggestions}
          onApprove={handleApprovesuggestions}
          onSkip={() => setShowSugg(false)}
        />
      )}

      {/* Empty state */}
      {(lockset?.locks ?? []).length === 0 && !showSugg && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-slate-400" />
          </div>
          <p className="font-medium text-slate-700 mb-1">{PT_BR.lockset.emptyTitle}</p>
          <p className="text-sm text-slate-500 max-w-sm mb-2">{PT_BR.lockset.emptyDescription}</p>
          {suggestions !== null && suggestions.length === 0 && (
            <p className="text-xs text-slate-400 max-w-xs">{PT_BR.lockset.suggestionsEmpty}</p>
          )}
          <Button size="sm" onClick={() => setShowForm(true)} className="mt-5 bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar primeira trava
          </Button>
        </div>
      )}

      {/* Lock grid grouped by scope */}
      {Object.entries(grouped).map(([scope, locks]) => (
        <div key={scope} className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {PT_BR.lockset.scopes[scope as LockScope]}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {locks.map(lock => (
              <LockCard
                key={lock.id}
                lock={lock}
                onEdit={l => { setEditing(l); setShowForm(true); }}
                onDuplicate={handleDuplicate}
                onToggle={handleToggle}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Create / edit form modal */}
      {showForm && (
        <LockForm
          initial={editing}
          onSave={editing ? handleEditLock : handleAddLock}
          onCancel={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 mb-2">Excluir lock</h3>
            <p className="text-slate-500 text-sm mb-5">{PT_BR.lockset.deleteLockConfirm}</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(undefined)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDeleteLock(deleteConfirm)}>Excluir</Button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Histórico de versões</h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-700 text-sm">Fechar</button>
            </div>
            <div className="p-4 space-y-2">
              {versions.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhuma versão salva ainda</p>
              )}
              {versions.map(v => (
                <div key={v.versionId} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-violet-600 mt-0.5">v{v.version}</span>
                  <div>
                    <p className="text-sm text-slate-800">{v.changesSummary}</p>
                    <p className="text-xs text-slate-400">{v.locksCount} locks · {new Date(v.timestamp).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
