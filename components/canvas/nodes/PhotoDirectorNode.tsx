"use client";

import { createPortal } from "react-dom";
import { useState, useRef } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Camera, Sparkles, Wand2, AlertCircle, ImageIcon,
  X, Loader2, Check, Upload,
} from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { BrandPhoto } from "@/types";

// ── AI Provider definitions ───────────────────────────────────────────────────

interface AiProvider {
  id:          string;
  label:       string;
  description: string;
  badge?:      string;
}

const AI_PROVIDERS: AiProvider[] = [
  { id: "freepik",   label: "Freepik Mystic",   description: "Realista · Alta qualidade",     badge: "⭐" },
  { id: "seedream",  label: "Freepik Seedream",  description: "Criativo · Estilo único"                   },
  { id: "fal",       label: "Flux Pro",          description: "Ultra-realista · Detalhado"                },
  { id: "imagen4",   label: "Google Imagen 4",   description: "Cinematográfico · Premium"                 },
];

// ── PhotoBankModal ────────────────────────────────────────────────────────────

interface PhotoBankModalProps {
  clientId: string;
  onSelect: (url: string) => void;
  onClose:  () => void;
}

function PhotoBankModal({ clientId, onSelect, onClose }: PhotoBankModalProps) {
  const [photos,  setPhotos]  = useState<BrandPhoto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

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
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Banco de Fotos</h2>
            <p className="text-xs text-slate-400 mt-0.5">Selecione uma foto para usar como imagem do post</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
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

// ── AI Picker Modal ───────────────────────────────────────────────────────────

interface AiPickerModalProps {
  selectedProvider: string;
  onSelectProvider: (id: string) => void;
  onGenerate:       (id: string) => void;
  onClose:          () => void;
}

function AiPickerModal({ selectedProvider, onSelectProvider, onGenerate, onClose }: AiPickerModalProps) {
  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Escolher Gerador de IA</h2>
            <p className="text-xs text-slate-400 mt-0.5">Selecione o motor de geração de imagem</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {AI_PROVIDERS.map(p => {
              const isSelected = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProvider(p.id)}
                  className={[
                    "nodrag nopan relative flex flex-col gap-1 rounded-xl border-2 px-3 py-3 text-left transition-all",
                    isSelected
                      ? "border-violet-500 bg-violet-50"
                      : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/50",
                  ].join(" ")}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-slate-900">{p.label}</span>
                    {p.badge && <span className="text-xs">{p.badge}</span>}
                  </div>
                  <span className="text-[11px] text-slate-500">{p.description}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onGenerate(selectedProvider)}
            className="nodrag nopan w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            ▶ Gerar Imagem
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

// ── Spinner inline ────────────────────────────────────────────────────────────

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function ShimmerBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-slate-200 animate-pulse"
          style={{ width: `${[72, 56, 88, 64][i % 4]}%` }}
        />
      ))}
    </div>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type PhotoDirectorNodeType = Node<{ label: string }, "photodirector">;

// ── PhotoDirectorNode ─────────────────────────────────────────────────────────

export default function PhotoDirectorNode({ selected }: NodeProps<PhotoDirectorNodeType>) {
  const client              = useCanvasStore(s => s.client);
  const copyStatus          = useCanvasStore(s => s.copyStatus);
  const imageStatus         = useCanvasStore(s => s.imageStatus);
  const imageError          = useCanvasStore(s => s.imageError);
  const imageUrl            = useCanvasStore(s => s.imageUrl);

  const visualPromptEdit       = useCanvasStore(s => s.visualPromptEdit);
  const photoDirectorMode      = useCanvasStore(s => s.photoDirectorMode);
  const photoDirectorStatus    = useCanvasStore(s => s.photoDirectorStatus);
  const photoDirectorError     = useCanvasStore(s => s.photoDirectorError);
  const refinedVisualPrompt    = useCanvasStore(s => s.refinedVisualPrompt);
  const selectedAiProvider     = useCanvasStore(s => s.selectedAiProvider);
  const aiPickerOpen           = useCanvasStore(s => s.aiPickerOpen);

  const setVisualPromptEdit    = useCanvasStore(s => s.setVisualPromptEdit);
  const setPhotoDirectorMode   = useCanvasStore(s => s.setPhotoDirectorMode);
  const setRefinedVisualPrompt = useCanvasStore(s => s.setRefinedVisualPrompt);
  const setSelectedAiProvider  = useCanvasStore(s => s.setSelectedAiProvider);
  const openAiPicker           = useCanvasStore(s => s.openAiPicker);
  const closeAiPicker          = useCanvasStore(s => s.closeAiPicker);
  const runRefinePrompt        = useCanvasStore(s => s.runRefinePrompt);
  const runImageWithProvider   = useCanvasStore(s => s.runImageWithProvider);
  const usePhotoFromBank       = useCanvasStore(s => s.usePhotoFromBank);

  const [bankOpen, setBankOpen] = useState(false);
  const [selectedBankPhoto, setSelectedBankPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGenerating = imageStatus === "loading" || imageStatus === "polling";

  // Derive node status
  const nodeStatus =
    imageStatus === "done"    ? "done"    :
    imageStatus === "error"   ? "error"   :
    imageStatus === "loading" ? "loading" :
    imageStatus === "polling" ? "polling" :
    photoDirectorStatus === "loading" ? "loading" :
    "idle";

  function handleSelectBankPhoto(url: string) {
    setSelectedBankPhoto(url);
  }

  function handleUseBankPhoto() {
    if (!selectedBankPhoto) return;
    usePhotoFromBank(selectedBankPhoto);
  }

  function handleGenerate(provider: string) {
    closeAiPicker();
    runImageWithProvider(provider);
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
        title="Diretor de Fotografia"
        icon={<Camera />}
        status={nodeStatus}
        selected={selected}
        width={380}
      >
        {/* Idle state — waiting for copy */}
        {copyStatus !== "done" ? (
          <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
            Aguardando copy e Diretor Criativo...
          </p>
        ) : (
          <div className="flex flex-col gap-3">

            {/* ── Prompt Visual atual ─────────────────────────────────────── */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Prompt Visual atual (EN)
              </label>
              <textarea
                className={[
                  "nodrag nopan",
                  "w-full rounded-lg border border-slate-200 bg-white",
                  "px-2.5 py-2 text-xs text-slate-700 placeholder-slate-400",
                  "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                  "resize-none leading-relaxed",
                  isGenerating ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
                rows={3}
                value={visualPromptEdit}
                onChange={e => setVisualPromptEdit(e.target.value)}
                placeholder="Describe the visual scene in English..."
                disabled={isGenerating}
              />
            </div>

            {/* ── Escolha do Caminho ──────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Escolha o Caminho
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPhotoDirectorMode("ai")}
                  disabled={isGenerating}
                  className={[
                    "nodrag nopan flex flex-col items-center justify-center gap-1",
                    "rounded-xl border-2 px-3 py-3 text-center text-xs font-semibold transition-all",
                    photoDirectorMode === "ai"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50/50",
                    isGenerating ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  <Sparkles className="h-4 w-4" />
                  Gerar com IA
                </button>

                <button
                  type="button"
                  onClick={() => setPhotoDirectorMode("bank")}
                  disabled={isGenerating}
                  className={[
                    "nodrag nopan flex flex-col items-center justify-center gap-1",
                    "rounded-xl border-2 px-3 py-3 text-center text-xs font-semibold transition-all",
                    photoDirectorMode === "bank"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50/50",
                    isGenerating ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Banco do Cliente
                </button>
              </div>
            </div>

            {/* ── Mode: AI ────────────────────────────────────────────────── */}
            {photoDirectorMode === "ai" && (
              <div className="flex flex-col gap-2">
                {/* Refine prompt button */}
                <button
                  type="button"
                  onClick={() => runRefinePrompt()}
                  disabled={isGenerating || photoDirectorStatus === "loading" || !visualPromptEdit.trim()}
                  className={[
                    "nodrag nopan w-full flex items-center justify-center gap-2",
                    "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    photoDirectorStatus === "loading"
                      ? "border-amber-300 bg-amber-50 text-amber-700 cursor-not-allowed"
                      : isGenerating || !visualPromptEdit.trim()
                        ? "border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"
                        : "border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400",
                  ].join(" ")}
                >
                  {photoDirectorStatus === "loading" ? (
                    <>
                      <Spinner className="h-3.5 w-3.5" />
                      Analisando 7 camadas...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" />
                      Refinar com Diretor de Fotografia (7 camadas)
                    </>
                  )}
                </button>

                {/* Refined prompt result */}
                {photoDirectorStatus === "loading" && (
                  <ShimmerBlock rows={4} />
                )}

                {photoDirectorStatus === "error" && photoDirectorError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />
                    <p className="text-xs text-red-700 leading-relaxed">{photoDirectorError}</p>
                  </div>
                )}

                {photoDirectorStatus === "done" && refinedVisualPrompt && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Prompt Refinado (7 camadas)
                    </label>
                    <textarea
                      className={[
                        "nodrag nopan",
                        "w-full rounded-lg border border-emerald-200 bg-emerald-50",
                        "px-2.5 py-2 text-xs text-slate-700",
                        "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
                        "resize-none leading-relaxed",
                      ].join(" ")}
                      rows={5}
                      value={refinedVisualPrompt}
                      onChange={e => setRefinedVisualPrompt(e.target.value)}
                    />
                  </div>
                )}

                {/* Generate with AI picker */}
                <button
                  type="button"
                  onClick={openAiPicker}
                  disabled={isGenerating || copyStatus !== "done"}
                  className={[
                    "nodrag nopan w-full flex items-center justify-center gap-2",
                    "rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors",
                    isGenerating || copyStatus !== "done"
                      ? "bg-violet-300 cursor-not-allowed"
                      : "bg-violet-600 hover:bg-violet-700 active:bg-violet-800",
                  ].join(" ")}
                >
                  {isGenerating ? (
                    <>
                      <Spinner className="h-4 w-4 text-white" />
                      {imageStatus === "polling" ? "Gerando imagem..." : "Iniciando..."}
                    </>
                  ) : (
                    <>
                      Escolher Gerador de IA →
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ── Mode: Bank ──────────────────────────────────────────────── */}
            {photoDirectorMode === "bank" && (
              <div className="flex flex-col gap-2">
                {selectedBankPhoto ? (
                  <div className="flex flex-col gap-2">
                    {/* Selected photo thumbnail */}
                    <div className="relative rounded-lg overflow-hidden" style={{ height: 90 }}>
                      <img
                        src={selectedBankPhoto}
                        alt="Foto selecionada"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20" />
                      <button
                        type="button"
                        onClick={() => setSelectedBankPhoto(null)}
                        className="nodrag nopan absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-2 text-[10px] text-white/80 font-medium">
                        Foto selecionada
                      </span>
                    </div>

                    {/* Use this photo button */}
                    <button
                      type="button"
                      onClick={handleUseBankPhoto}
                      disabled={isGenerating}
                      className={[
                        "nodrag nopan w-full flex items-center justify-center gap-2",
                        "rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors",
                        isGenerating
                          ? "bg-emerald-300 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
                      ].join(" ")}
                    >
                      <Check className="h-4 w-4" />
                      Usar esta foto → Compositor
                    </button>
                  </div>
                ) : (
                  /* Open bank modal */
                  <button
                    type="button"
                    onClick={() => setBankOpen(true)}
                    disabled={isGenerating || !client}
                    className={[
                      "nodrag nopan w-full flex items-center justify-center gap-2",
                      "rounded-xl border-2 border-dashed px-3 py-4 text-sm font-medium transition-colors",
                      isGenerating || !client
                        ? "border-slate-200 text-slate-300 cursor-not-allowed"
                        : "border-slate-300 text-slate-500 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50",
                    ].join(" ")}
                  >
                    <ImageIcon className="h-4 w-4" />
                    Abrir banco de fotos
                  </button>
                )}
              </div>
            )}

            {/* ── Image done state preview ─────────────────────────────────── */}
            {imageStatus === "done" && imageUrl && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Imagem gerada
                </label>
                <div className="relative rounded-lg overflow-hidden" style={{ height: 80 }}>
                  <img
                    src={imageUrl}
                    alt="Imagem gerada"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                  <span className="absolute bottom-1 left-2 text-[10px] text-white/80 font-medium flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" />
                    Pronto — siga para o Compositor
                  </span>
                </div>
              </div>
            )}

            {/* ── Error state ─────────────────────────────────────────────── */}
            {imageStatus === "error" && imageError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">{imageError}</p>
              </div>
            )}
          </div>
        )}
      </BaseNode>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />

      {/* Photo bank modal */}
      {bankOpen && client && (
        <PhotoBankModal
          clientId={client.id}
          onSelect={url => { handleSelectBankPhoto(url); setBankOpen(false); }}
          onClose={() => setBankOpen(false)}
        />
      )}

      {/* AI picker modal */}
      {aiPickerOpen && (
        <AiPickerModal
          selectedProvider={selectedAiProvider}
          onSelectProvider={setSelectedAiProvider}
          onGenerate={handleGenerate}
          onClose={closeAiPicker}
        />
      )}

      {/* Hidden file input (not currently used but available for future upload) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
      />
    </>
  );
}
