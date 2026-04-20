"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LibraryAsset, AssetRole } from "@/types";

const ROLES: AssetRole[] = ['logo', 'product', 'person', 'background'];

interface Props {
  clientId: string;
  asset:    LibraryAsset;
  onClose:  () => void;
  onSaved:  (a: LibraryAsset) => void;
  onDeleted: (id: string) => void;
}

export function AssetEditModal({ clientId, asset, onClose, onSaved, onDeleted }: Props) {
  const [role,        setRole]        = useState<AssetRole>(asset.role);
  const [slug,        setSlug]        = useState(asset.slug);
  const [label,       setLabel]       = useState(asset.label);
  const [description, setDescription] = useState(asset.description ?? '');
  const [preferred,   setPreferred]   = useState(asset.preferred);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (label.trim().length < 2) errs.label = 'Mínimo 2 caracteres';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errs.slug = 'Apenas letras minúsculas, números e hífens';
    return errs;
  }

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/assets/library/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, slug, label: label.trim(), description: description.trim() || undefined, preferred }),
      });
      if (res.ok) {
        const data = await res.json() as { asset: LibraryAsset };
        onSaved(data.asset);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrors({ label: data?.error ?? 'Erro ao salvar' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(PT_BR.lockset.deleteLockConfirm)) return;
    setDeleting(true);
    try {
      await fetch(`/api/clients/${clientId}/assets/library/${asset.id}`, { method: 'DELETE' });
      onDeleted(asset.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{PT_BR.assets.edit.title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preview */}
          {asset.downloadUrl && (
            <div className="flex justify-center">
              <img src={asset.downloadUrl} alt={asset.label} className="max-h-32 object-contain rounded-xl border border-slate-100" />
            </div>
          )}

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.role}</label>
            <select value={role} onChange={e => setRole(e.target.value as AssetRole)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300">
              {ROLES.map(r => <option key={r} value={r}>{PT_BR.assets.roles[r]}</option>)}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.label}</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.slug}</label>
            <input type="text" value={slug} onChange={e => setSlug(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300" />
            {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.description}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>

          {/* Preferred toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)}
              className="accent-amber-500 w-4 h-4" />
            <span className="text-sm text-slate-700">{PT_BR.assets.edit.preferred}</span>
          </label>
        </div>

        <div className="flex gap-2 justify-between px-6 pb-5">
          <Button size="sm" variant="outline" onClick={handleDelete} disabled={deleting || saving}
            className="text-red-600 border-red-200 hover:bg-red-50">
            {deleting ? 'Excluindo…' : PT_BR.assets.edit.delete}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving || deleting}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || deleting}
              className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? 'Salvando…' : PT_BR.assets.edit.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
