"use client";

import { useRef, useState } from "react";
import { X, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { AssetRole, LibraryAsset } from "@/types";

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_BYTES = 10 * 1024 * 1024;

const ROLES: AssetRole[] = ['logo', 'product', 'person', 'background'];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'asset';
}

interface Props {
  clientId:     string;
  defaultRole?: AssetRole;
  onClose:      () => void;
  onCreated:    (a: LibraryAsset) => void;
}

export function AssetUploadModal({ clientId, defaultRole, onClose, onCreated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [role,        setRole]        = useState<AssetRole>(defaultRole ?? 'logo');
  const [slug,        setSlug]        = useState('');
  const [label,       setLabel]       = useState('');
  const [description, setDescription] = useState('');
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [progress,    setProgress]    = useState<string | null>(null);
  const [sending,     setSending]     = useState(false);

  function handleFileChange(f: File | null) {
    if (!f) return;
    const errs: Record<string, string> = {};
    if (!ACCEPTED_TYPES.includes(f.type as typeof ACCEPTED_TYPES[number])) {
      errs.file = PT_BR.assets.errors.invalidType;
      setErrors(errs); return;
    }
    if (f.size > MAX_BYTES) {
      errs.file = PT_BR.assets.errors.tooLarge;
      setErrors(errs); return;
    }
    setFile(f);
    setErrors({});
    setPreview(URL.createObjectURL(f));
    if (!label) {
      const name = f.name.replace(/\.[^.]+$/, '');
      setLabel(name);
      setSlug(slugify(name));
    }
  }

  function handleLabelChange(v: string) {
    setLabel(v);
    setSlug(slugify(v));
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!file) errs.file = 'Selecione um arquivo';
    if (label.trim().length < 2) errs.label = 'Mínimo 2 caracteres';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errs.slug = 'Apenas letras minúsculas, números e hífens (ex: logo-principal)';
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!file) return;

    setSending(true);
    setProgress('Criando registro…');
    try {
      // Step 1: Create asset metadata + get upload URL
      const createRes = await fetch(`/api/clients/${clientId}/assets/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role, slug, label: label.trim(),
          description: description.trim() || undefined,
          mimeType: file.type,
          bytes: file.size,
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        if (createRes.status === 409) {
          setErrors({ slug: PT_BR.assets.errors.slugTaken });
        } else {
          setErrors({ file: data?.error ?? PT_BR.assets.errors.uploadFailed });
        }
        return;
      }
      const { asset, uploadUrl } = await createRes.json() as { asset: LibraryAsset; uploadUrl: string };

      // Step 2: PUT file directly to Storage via signed URL
      setProgress('Enviando arquivo…');
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setErrors({ file: PT_BR.assets.errors.uploadFailed });
        return;
      }

      // Step 3: Finalize
      setProgress('Finalizando…');
      const finalRes = await fetch(`/api/clients/${clientId}/assets/library/${asset.id}/finalize`, {
        method: 'POST',
      });
      if (!finalRes.ok) {
        setErrors({ file: PT_BR.assets.errors.uploadFailed });
        return;
      }
      const { asset: finalAsset } = await finalRes.json() as { asset: LibraryAsset };
      onCreated(finalAsset);
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{PT_BR.assets.upload.title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* File drop zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.file}</label>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0] ?? null); }}
              className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
            >
              {preview ? (
                <img src={preview} alt="" className="mx-auto max-h-32 object-contain rounded-lg" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Upload className="w-6 h-6 text-slate-300" />
                  <p className="text-xs text-slate-400">Arraste ou clique para selecionar</p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
            {errors.file && <p className="text-xs text-red-500 mt-1">{errors.file}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.role}</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as AssetRole)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{PT_BR.assets.roles[r]}</option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.label}</label>
            <input
              type="text"
              value={label}
              onChange={e => handleLabelChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.slug}</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="logo-principal"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <p className="text-xs text-slate-400 mt-0.5">{PT_BR.assets.upload.slugHint}</p>
            {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{PT_BR.assets.upload.description}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={sending}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {sending ? `${progress ?? PT_BR.assets.upload.sending}…` : PT_BR.assets.upload.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
