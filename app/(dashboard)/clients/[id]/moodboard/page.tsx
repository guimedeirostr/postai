"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  LayoutGrid,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MoodboardItem } from "@/types";

// ── Delete confirmation dialog ─────────────────────────────────────────────────
function DeleteDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-slate-900 mb-2">Remover referência</h3>
        <p className="text-slate-500 text-sm mb-5">
          Tem certeza que deseja remover esta imagem do moodboard? Esta ação não
          pode ser desfeita.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
          >
            Remover
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Upload skeleton card ───────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm animate-pulse">
      <div className="aspect-square bg-slate-200" />
      <div className="p-3 space-y-2">
        <div className="flex gap-1">
          <div className="h-5 w-14 bg-slate-200 rounded-full" />
          <div className="h-5 w-10 bg-slate-200 rounded-full" />
        </div>
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-4 h-4 rounded-full bg-slate-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Moodboard item card ────────────────────────────────────────────────────────
function MoodCard({
  item,
  onDelete,
}: {
  item: MoodboardItem;
  onDelete: (item: MoodboardItem) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.filename}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Hover overlay: style_notes + delete */}
        {hovered && (
          <div className="absolute inset-0 bg-black/60 flex flex-col justify-between p-3 transition-opacity duration-200">
            <button
              onClick={() => onDelete(item)}
              className="self-end p-1.5 rounded-lg bg-white/10 hover:bg-red-500 text-white transition-colors"
              title="Remover"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {item.style_notes && (
              <p className="text-white text-xs leading-relaxed line-clamp-5">
                {item.style_notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        {/* inspiration_tags */}
        {item.inspiration_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.inspiration_tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* applies_to_pillar */}
        {item.applies_to_pillar?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.applies_to_pillar.map((pillar) => (
              <span
                key={pillar}
                className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
              >
                {pillar}
              </span>
            ))}
          </div>
        )}

        {/* color_palette swatches */}
        {item.color_palette?.length > 0 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            {item.color_palette.map((hex) => (
              <div
                key={hex}
                className="w-4 h-4 rounded-full border border-white shadow-sm flex-none"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function MoodboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = React.use(params);

  const [items, setItems]       = useState<MoodboardItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MoodboardItem | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientName, setClientName] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Show toast ───────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ── Fetch items ──────────────────────────────────────────────────────────────
  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/moodboard`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao carregar moodboard");
      }
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar moodboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Fetch client name (best-effort, uses list endpoint) ─────────────────────
  async function loadClientName() {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) return;
      const data = await res.json();
      const match = (data.clients ?? []).find(
        (c: { id: string; name: string }) => c.id === clientId
      );
      if (match?.name) setClientName(match.name);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    loadItems();
    loadClientName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Upload handler ───────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    // Validate type
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      showToast("Formato inválido. Use JPG, PNG ou WebP.");
      return;
    }
    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/clients/${clientId}/moodboard`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao enviar imagem");
      }
      const item = await res.json() as MoodboardItem;
      setItems((prev) => [item, ...prev]);
      showToast("Imagem adicionada ao moodboard!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar imagem";
      showToast(msg);
    } finally {
      setUploading(false);
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(item: MoodboardItem) {
    setDeleting(undefined);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/moodboard/${item.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao remover item");
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast("Referência removida.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao remover item";
      showToast(msg);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href={`/clients`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Clientes
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-violet-500" />
            MoodBoard
            {clientName && (
              <span className="text-slate-400 font-normal text-lg">
                · {clientName}
              </span>
            )}
          </h1>
          {!loading && (
            <p className="text-slate-500 mt-1">
              {items.length === 0
                ? "Nenhuma referência ainda"
                : `${items.length} referência${items.length !== 1 ? "s" : ""} de estilo`}
            </p>
          )}
        </div>

        <Button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando…</>
          ) : (
            <><ImagePlus className="w-4 h-4 mr-2" /> Adicionar imagem</>
          )}
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Upload zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={[
          "mb-8 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragOver
            ? "border-violet-400 bg-violet-50"
            : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50",
          uploading ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-violet-600">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-medium">
              Enviando e analisando com Claude Vision…
            </p>
            <p className="text-xs text-slate-400">Isso pode levar alguns segundos</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <ImagePlus className="w-8 h-8" />
            <div>
              <p className="text-sm font-medium text-slate-600">
                Arraste uma imagem ou clique para selecionar
              </p>
              <p className="text-xs mt-1">JPG, PNG ou WebP · máximo 10MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <X className="w-4 h-4 flex-none" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : items.length === 0 && !uploading ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
          <LayoutGrid className="w-10 h-10 mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Nenhuma referência ainda</p>
          <p className="text-sm mt-1">
            Adicione imagens de Pinterest, Behance ou qualquer inspiração visual
          </p>
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Upload skeleton at the front when uploading */}
          {uploading && <SkeletonCard />}

          {items.map((item) => (
            <MoodCard
              key={item.id}
              item={item}
              onDelete={(i) => setDeleting(i)}
            />
          ))}
        </div>
      )}

      {/* Delete dialog */}
      {deleting && (
        <DeleteDialog
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(undefined)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm">
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
