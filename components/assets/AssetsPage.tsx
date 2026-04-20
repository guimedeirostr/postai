"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetGroup } from "./AssetGroup";
import { AssetUploadModal } from "./AssetUploadModal";
import { AssetEditModal } from "./AssetEditModal";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LibraryAsset, AssetRole } from "@/types";

const ALL_ROLES: AssetRole[] = ['logo', 'product', 'person', 'background'];

interface Props {
  clientId:   string;
  clientName: string;
}

type Toast = { id: number; text: string; type: 'ok' | 'err' };

export function AssetsPage({ clientId, clientName }: Props) {
  const [assets,       setAssets]       = useState<LibraryAsset[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showUpload,   setShowUpload]   = useState(false);
  const [uploadRole,   setUploadRole]   = useState<AssetRole | undefined>();
  const [editing,      setEditing]      = useState<LibraryAsset | undefined>();
  const [filterRole,   setFilterRole]   = useState<AssetRole | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [toasts,       setToasts]       = useState<Toast[]>([]);
  let toastId = 0;

  const toast = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (showInactive) params.set('includeInactive', 'true');
    const res = await fetch(`/api/clients/${clientId}/assets/library?${params}`);
    if (res.ok) {
      const data = await res.json() as { assets: LibraryAsset[] };
      setAssets(data.assets ?? []);
    }
    setLoading(false);
  }, [clientId, showInactive]);

  useEffect(() => { load(); }, [load]);

  function handleCreated(a: LibraryAsset) {
    setShowUpload(false);
    setUploadRole(undefined);
    setAssets(prev => [a, ...prev]);
    toast(PT_BR.assets.toasts.created);
  }

  function handleSaved(a: LibraryAsset) {
    setEditing(undefined);
    setAssets(prev => prev.map(x => x.id === a.id ? a : x));
    toast(a.preferred ? PT_BR.assets.toasts.preferredSet : PT_BR.assets.toasts.updated);
  }

  function handleDeleted(id: string) {
    setEditing(undefined);
    if (showInactive) {
      setAssets(prev => prev.map(x => x.id === id ? { ...x, active: false } : x));
    } else {
      setAssets(prev => prev.filter(x => x.id !== id));
    }
    toast(PT_BR.assets.toasts.deleted);
  }

  async function handlePrefer(a: LibraryAsset) {
    const res = await fetch(`/api/clients/${clientId}/assets/library/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred: true }),
    });
    if (res.ok) {
      await load();
      toast(PT_BR.assets.toasts.preferredSet);
    }
  }

  async function handleRestore(a: LibraryAsset) {
    const res = await fetch(`/api/clients/${clientId}/assets/library/${a.id}/restore`, { method: 'POST' });
    if (res.ok) {
      await load();
      toast(PT_BR.assets.toasts.restored);
    }
  }

  const displayedRoles = filterRole === 'all' ? ALL_ROLES : [filterRole];
  const visibleAssets = assets.filter(a => showInactive || a.active);

  const allEmpty = visibleAssets.length === 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as AssetRole | 'all')}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          <option value="all">{PT_BR.assets.filterAll}</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{PT_BR.assets.roles[r]}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-violet-600"
          />
          Inativos
        </label>

        <div className="ml-auto">
          <Button size="sm" onClick={() => { setUploadRole(undefined); setShowUpload(true); }}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {PT_BR.assets.newAsset}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : allEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <FolderOpen className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 max-w-sm mb-4">{PT_BR.assets.emptyAll}</p>
          <Button size="sm" onClick={() => { setUploadRole('logo'); setShowUpload(true); }}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {PT_BR.assets.addFirst}
          </Button>
        </div>
      ) : (
        displayedRoles.map(role => (
          <AssetGroup
            key={role}
            role={role}
            assets={visibleAssets.filter(a => a.role === role)}
            onAdd={() => { setUploadRole(role); setShowUpload(true); }}
            onEdit={setEditing}
            onPrefer={handlePrefer}
            onDelete={a => handleDeleted(a.id)}
            onRestore={handleRestore}
          />
        ))
      )}

      {/* Upload modal */}
      {showUpload && (
        <AssetUploadModal
          clientId={clientId}
          defaultRole={uploadRole}
          onClose={() => { setShowUpload(false); setUploadRole(undefined); }}
          onCreated={handleCreated}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <AssetEditModal
          clientId={clientId}
          asset={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium text-white ${t.type === 'ok' ? 'bg-slate-900' : 'bg-red-600'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
