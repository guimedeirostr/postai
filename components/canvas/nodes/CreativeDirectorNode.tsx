"use client";

import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Wand2, Upload, ImageIcon, X, AlertCircle, Info } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { BrandPhoto } from "@/types";

// ── Idle placeholder ──────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
      Aguardando copy...
    </p>
  );
}

// ── Client photo bank picker (portal modal) ───────────────────────────────────

interface PhotoBankModalProps {
  clientId: string;
  onSelect: (url: string) => void;
  onClose:  () => void;
}

function PhotoBankModal({ clientId, onSelect, onClose }: PhotoBankModalProps) {
  const [photos,  setPhotos]  = useState<BrandPhoto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Load photos once on mount
  if (photos === null && !loading) {
    setLoading(true);
    fetch(`/api/clients/${clientId}/photos`)
      .then(r => r.json())
      .then((d: { photos?: BrandPhoto[] }) => {
        setPhotos(d.photos ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Erro ao carregar banco de fotos");
        setLoading(false);
      });
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Banco de Fotos do Cliente</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha uma imagem como referência de estilo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-600 flex-none mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            Referência de <strong>estilo</strong> — cores, posição do texto e composição. Sua imagem não será copiada.
          </p>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              Carregando fotos...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-none" />
              {error}
            </div>
          )}
          {photos && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <ImageIcon className="w-8 h-8 text-slate-300" />
              Nenhuma foto no banco deste cliente
            </div>
          )}
          {photos && photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 18).map(photo => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => { onSelect(photo.url); onClose(); }}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-violet-500 transition-all group"
                >
                  <img
                    src={photo.url}
                    alt={photo.description || photo.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type CreativeDirectorNodeType = Node<{ label: string }, "creative">;

// ── CreativeDirectorNode ──────────────────────────────────────────────────────

export default function CreativeDirectorNode({ selected }: NodeProps<CreativeDirectorNodeType>) {
  const client            = useCanvasStore(s => s.client);
  const copyStatus        = useCanvasStore(s => s.copyStatus);
  const referenceImageUrl = useCanvasStore(s => s.referenceImageUrl);

  const setReferenceImageUrl = useCanvasStore(s => s.setReferenceImageUrl);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankOpen, setBankOpen] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setReferenceImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <BaseNode
        title="Diretor Criativo"
        icon={<Wand2 />}
        status={copyStatus === "done" ? "done" : "idle"}
        selected={selected}
        width={280}
      >
        {copyStatus !== "done" ? (
          <IdlePlaceholder />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Reference image — upload or client bank */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Referência de Post
              </label>

              {referenceImageUrl ? (
                /* Thumbnail + clear */
                <div className="relative rounded-lg overflow-hidden" style={{ height: 72 }}>
                  <img
                    src={referenceImageUrl}
                    alt="Referência"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20" />
                  <button
                    type="button"
                    onClick={() => setReferenceImageUrl(null)}
                    className="nodrag nopan absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                    title="Remover referência"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="absolute bottom-1 left-2 text-[10px] text-white/80 font-medium">
                    Referência ativa
                  </p>
                </div>
              ) : (
                /* Picker buttons */
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={[
                      "nodrag nopan flex-1 flex items-center justify-center gap-1.5",
                      "rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium",
                      "text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50",
                      "transition-colors duration-150",
                    ].join(" ")}
                  >
                    <Upload className="h-3 w-3 flex-none" />
                    Subir Imagem
                  </button>

                  {client && (
                    <button
                      type="button"
                      onClick={() => setBankOpen(true)}
                      className={[
                        "nodrag nopan flex-1 flex items-center justify-center gap-1.5",
                        "rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium",
                        "text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50",
                        "transition-colors duration-150",
                      ].join(" ")}
                    >
                      <ImageIcon className="h-3 w-3 flex-none" />
                      Banco do Cliente
                    </button>
                  )}
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Info note */}
              {referenceImageUrl ? (
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Referência de estilo visual — cores, composição e posicionamento de texto.
                </p>
              ) : (
                <div className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1.5">
                  <Wand2 className="h-3 w-3 text-violet-500 flex-none" />
                  <p className="text-[10px] text-violet-700 leading-relaxed font-medium">
                    Sem referência — IA cria 100% pela copy
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </BaseNode>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />

      {/* Client photo bank modal */}
      {bankOpen && client && (
        <PhotoBankModal
          clientId={client.id}
          onSelect={url => setReferenceImageUrl(url)}
          onClose={() => setBankOpen(false)}
        />
      )}
    </>
  );
}
