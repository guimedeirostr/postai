"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Loader2, Trash2, Library, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Asset, AssetKind } from "@/types";

const KIND_LABEL: Record<AssetKind, string> = {
  reference: "Referência", avatar: "Avatar", logo: "Logo",
  product: "Produto", generated: "Gerado",
};

const KIND_COLOR: Record<AssetKind, string> = {
  reference: "bg-violet-100 text-violet-700",
  avatar:    "bg-blue-100 text-blue-700",
  logo:      "bg-amber-100 text-amber-700",
  product:   "bg-green-100 text-green-700",
  generated: "bg-slate-100 text-slate-600",
};

const KIND_OPTIONS: AssetKind[] = ["reference", "avatar", "logo", "product"];

function AssetCard({ asset, onDelete }: { asset: Asset; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="aspect-square bg-slate-100 overflow-hidden relative">
        <img src={asset.url} alt={asset.slug} className="w-full h-full object-cover" />
        {hovered && (
          <div className="absolute inset-0 bg-black/50 flex items-end justify-between p-2">
            <span className="text-white text-xs font-mono bg-black/40 rounded px-1.5 py-0.5 flex items-center gap-1">
              <AtSign className="w-3 h-3" />{asset.slug}
            </span>
            <button onClick={onDelete} className="p-1.5 bg-white/10 hover:bg-red-500 text-white rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="p-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${KIND_COLOR[asset.kind]}`}>
          {KIND_LABEL[asset.kind]}
        </span>
      </div>
    </div>
  );
}

export default function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = React.use(params);

  const [assets,    setAssets]    = useState<Asset[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [kind,      setKind]      = useState<AssetKind>("reference");
  const [toast,     setToast]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function loadAssets() {
    const res  = await fetch(`/api/clients/${clientId}/assets`);
    const data = await res.json();
    setAssets(data.assets ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAssets(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { showToast("Use JPG, PNG ou WebP."); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("Máximo 10MB."); return; }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch(`/api/clients/${clientId}/assets`, { method: "POST", body: fd });
    if (res.ok) {
      const { asset } = await res.json();
      setAssets(prev => [asset, ...prev]);
      showToast(`Asset @${asset.slug} adicionado!`);
    } else {
      showToast("Erro ao enviar.");
    }
    setUploading(false);
  }

  async function handleDelete(asset: Asset) {
    const res = await fetch(`/api/clients/${clientId}/assets/${asset.id}`, { method: "DELETE" });
    if (res.ok) {
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      showToast("Asset removido.");
    }
  }

  const filtered = (kind2: AssetKind | "all") =>
    kind2 === "all" ? assets : assets.filter(a => a.kind === kind2);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Clientes
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Library className="w-6 h-6 text-violet-500" /> Biblioteca de Assets
          </h1>
          <p className="text-slate-500 mt-1">
            Referências, avatares e produtos do cliente — use <code className="bg-slate-100 px-1 rounded text-xs">@slug</code> nos prompts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as AssetKind)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {KIND_OPTIONS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            Adicionar
          </Button>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

      {/* Drag zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
        className="mb-8 border-2 border-dashed border-slate-200 hover:border-violet-300 bg-white hover:bg-violet-50/30 rounded-xl p-6 text-center cursor-pointer transition-colors"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-violet-600">
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-sm font-medium">Fazendo upload…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <ImagePlus className="w-7 h-7" />
            <p className="text-sm">Arraste ou clique para adicionar <strong>{KIND_LABEL[kind].toLowerCase()}</strong></p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Library className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="font-medium text-slate-600">Nenhum asset ainda</p>
          <p className="text-sm mt-1">Adicione referências e avatares para usar nos prompts com @slug</p>
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(["all", ...KIND_OPTIONS] as const).map(k => (
              <button
                key={k}
                onClick={() => setKind(k === "all" ? "reference" : k)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
                  (k === "all" && !assets.some(a => a.kind !== kind)) || (k !== "all" && kind === k)
                    ? "bg-violet-100 text-violet-700 border-violet-200"
                    : "bg-white text-slate-500 border-slate-200 hover:border-violet-200"
                }`}
              >
                {k === "all" ? "Todos" : KIND_LABEL[k]}
                <span className="ml-1.5 text-slate-400">({filtered(k).length})</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {assets.map(asset => (
              <AssetCard key={asset.id} asset={asset} onDelete={() => handleDelete(asset)} />
            ))}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
