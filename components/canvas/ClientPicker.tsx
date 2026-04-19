'use client';

import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Check, Sparkles, AlertCircle } from 'lucide-react';
import { useCanvasStore } from '@/lib/canvas/store';
import type { ClientPickerOption } from '@/types';

type Props = {
  variant: 'header' | 'briefing' | 'onboarding';
  onChange?: (clientId: string) => void;
};

export function ClientPicker({ variant, onChange }: Props) {
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { clientId, setClientId } = useCanvasStore();

  useEffect(() => {
    fetch('/api/clients?withContext=1')
      .then(r => r.json())
      .then(data => { setClients(data.clients ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  async function select(id: string) {
    await setClientId(id);
    onChange?.(id);
    setOpen(false);
  }

  const selected = clients.find(c => c.id === clientId);

  if (variant === 'onboarding') {
    return (
      <div className="rounded-xl bg-slate-900/80 backdrop-blur p-6 border border-white/10 max-w-md w-full">
        <h3 className="text-lg font-medium mb-1">Para quem é este post?</h3>
        <p className="text-sm text-slate-400 mb-4">
          Quanto mais posts este cliente tem, mais o Diretor IA aprende.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="animate-spin h-4 w-4 border-2 border-violet-500 border-t-transparent rounded-full" />
            Carregando clientes…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {clients.map(c => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
              >
                <span className="h-6 w-6 rounded-full bg-violet-600 text-xs flex items-center justify-center shrink-0">
                  {c.initials}
                </span>
                <span className="text-sm">{c.name}</span>
                {c.hasDnaVisual
                  ? <Sparkles className="h-3 w-3 text-violet-400" />
                  : <AlertCircle className="h-3 w-3 text-yellow-500" />}
              </button>
            ))}
            <a
              href="/clients"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-violet-400 text-sm"
            >
              + Novo cliente
            </a>
          </div>
        )}
      </div>
    );
  }

  const isHeader = variant === 'header';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="client-picker-trigger"
        onClick={() => setOpen(o => !o)}
        title={!selected ? 'Selecione o cliente primeiro' : undefined}
        className={`flex items-center gap-2 rounded-md transition
          ${isHeader ? 'px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800' : 'px-2 py-1 bg-white/5 hover:bg-white/10'}
          ${!selected ? 'ring-2 ring-violet-500 animate-pulse' : ''}`}
      >
        {loading ? (
          <span className="text-sm text-slate-400">Carregando…</span>
        ) : selected ? (
          <>
            <span className="h-5 w-5 rounded-full bg-violet-600 text-[10px] flex items-center justify-center shrink-0">
              {selected.initials}
            </span>
            <span className="text-sm font-medium">{selected.name}</span>
            {selected.hasDnaVisual ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300">
                DNA {selected.dnaConfidence}%
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400">
                DNA pendente
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-slate-400">Selecione o cliente</span>
        )}
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-lg bg-slate-900 border border-white/10 shadow-xl z-50 max-h-80 overflow-auto">
          {clients.length === 0 ? (
            <p className="text-sm text-slate-500 px-3 py-4 text-center">Nenhum cliente cadastrado</p>
          ) : clients.map(c => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left"
            >
              <span className="h-7 w-7 rounded-full bg-violet-600 text-xs flex items-center justify-center shrink-0">
                {c.initials}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-[11px] text-slate-400">
                  {c.postCount} posts
                  {c.hasDnaVisual
                    ? ` • DNA ${c.dnaConfidence}%`
                    : ' • DNA pendente'}
                </div>
              </div>
              {c.id === clientId && <Check className="h-4 w-4 text-violet-400" />}
            </button>
          ))}
          <div className="border-t border-white/10">
            <a
              href="/clients"
              className="block px-3 py-2 text-sm text-violet-400 hover:bg-white/5"
            >
              + Gerenciar clientes
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
