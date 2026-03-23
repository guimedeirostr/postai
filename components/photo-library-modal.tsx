"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Trash2, Loader2, Images, Plus, Tag, FileJson, CheckCircle2, Wand2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandPhoto, BrandProfile } from "@/types";

const CATEGORIES: { value: BrandPhoto["category"]; label: string }[] = [
  { value: "produto",    label: "Produto" },
  { value: "equipe",     label: "Equipe" },
  { value: "bastidores", label: "Bastidores" },
  { value: "cliente",    label: "Cliente" },
  { value: "ambiente",   label: "Ambiente" },
  { value: "outro",      label: "Outro" },
];

const CATEGORY_COLORS: Record<string, string> = {
  produto:    "bg-blue-100 text-blue-700",
  equipe:     "bg-emerald-100 text-emerald-700",
  bastidores: "bg-orange-100 text-orange-700",
  cliente:    "bg-amber-100 text-amber-700",
  ambiente:   "bg-teal-100 text-teal-700",
  outro:      "bg-slate-100 text-slate-600",
};

interface Props {
  client: BrandProfile;
  onClose: () => void;
}

export function PhotoLibraryModal({ client, onClose }: Props) {
  const [photos,      setPhotos]      = useState<BrandPhoto[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [enhancing,   setEnhancing]   = useState<string | null>(null);
  const [enhancingAll, setEnhancingAll] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUpload,  setShowUpload]  = useState(false);

  // Import JSON state
  const [showImport,   setShowImport]   = useState(false);
  const [importFile,   setImportFile]   = useState<File | null>(null);
  const [importBase,   setImportBase]   = useState("");
  const [importPrefix, setImportPrefix] = useState("Imagens");
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);
  const importFileRef  = useRef<HTMLInputElement>(null);

  // Upload form
  const [selectedFile,  setSelectedFile]  = useState<File | null>(null);
  const [previewUrl,    setPreviewUrl]     = useState<string | null>(null);
  const [category,      setCategory]       = useState<BrandPhoto["category"]>("outro");
  const [tags,          setTags]           = useState("");
  const [description,   setDescription]    = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/clients/${client.id}/photos`);
      const data = await res.json();
      setPhotos(data.photos ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append("file",        selectedFile);
    form.append("category",    category);
    form.append("tags",        tags);
    form.append("description", description);

    const res = await fetch(`/api/clients/${client.id}/photos`, { method: "POST", body: form });
    if (res.ok) {
      setShowUpload(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setTags("");
      setDescription("");
      setCategory("outro");
      load();
    } else {
      const data = await res.json();
      setUploadError(data.error ?? "Erro ao fazer upload");
    }
    setUploading(false);
  }

  async function handleImport() {
    if (!importFile || !importBase) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const raw    = await importFile.text();
      const photos = JSON.parse(raw);

      const res  = await fetch(`/api/clients/${client.id}/photos/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          photos,
          public_base_url: importBase.trim().replace(/\/$/, ""),
          r2_path_prefix:  importPrefix.trim() || "Imagens",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error ?? "Erro na importação");
      } else {
        setImportResult({ imported: data.imported, skipped: data.skipped ?? 0 });
        load();
      }
    } catch {
      setImportError("Erro ao processar o arquivo JSON");
    } finally {
      setImporting(false);
    }
  }

  async function handleEnhance(photo: BrandPhoto) {
    setEnhancing(photo.id);
    try {
      const res  = await fetch(`/api/clients/${client.id}/photos/${photo.id}/enhance`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enhance: true }),
      });
      if (res.ok) {
        const { url } = await res.json() as { url: string };
        // Update locally so grid refreshes immediately
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, url } : p));
      }
    } finally {
      setEnhancing(null);
    }
  }

  async function handleEnhanceAll() {
    const unenhanced = photos.filter(p => !(p as BrandPhoto & { enhanced?: boolean }).enhanced);
    if (!unenhanced.length) return;
    setEnhancingAll(true);
    setEnhanceProgress({ done: 0, total: unenhanced.length });
    for (let i = 0; i < unenhanced.length; i++) {
      await handleEnhance(unenhanced[i]);
      setEnhanceProgress({ done: i + 1, total: unenhanced.length });
    }
    setEnhancingAll(false);
    setEnhanceProgress(null);
  }

  async function handleDelete(photoId: string) {
    setDeleting(photoId);
    await fetch(`/api/clients/${client.id}/photos/${photoId}`, { method: "DELETE" });
    setDeleting(null);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: client.primary_color }}>
              <Images className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Biblioteca de fotos — {client.name}</p>
              <p className="text-xs text-slate-400">{photos.length} foto{photos.length !== 1 ? "s" : ""} · usadas pelo Agente Curador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {photos.length > 0 && (
              <Button size="sm" variant="outline"
                onClick={handleEnhanceAll}
                disabled={enhancingAll}
                className="text-violet-700 border-violet-200 hover:bg-violet-50">
                {enhancingAll && enhanceProgress
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{enhanceProgress.done}/{enhanceProgress.total}</>
                  : <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Processar tudo</>}
              </Button>
            )}
            <Button size="sm" variant="outline"
              onClick={() => { setShowImport(v => !v); setShowUpload(false); }}
              className="text-slate-600 border-slate-200 hover:bg-slate-50">
              <FileJson className="w-3.5 h-3.5 mr-1.5" /> Importar JSON
            </Button>
            <Button size="sm" onClick={() => { setShowUpload(v => !v); setShowImport(false); }}
              className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar foto
            </Button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Import JSON panel ── */}
          {showImport && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-violet-600" />
                <p className="text-sm font-semibold text-slate-800">Importar fotos via JSON semântico</p>
              </div>
              <p className="text-xs text-slate-500">
                Importa em massa o JSON com tags geradas (r2_semantic_tags_updated.json). As categorias e tags são mapeadas automaticamente para o Curador de Imagens.
              </p>

              {/* JSON file picker */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Arquivo JSON</label>
                <div
                  onClick={() => importFileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors"
                >
                  {importFile ? (
                    <p className="text-sm font-medium text-slate-700">
                      📄 {importFile.name} — {(importFile.size / 1024).toFixed(0)} KB
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">Clique para selecionar o .json</p>
                  )}
                </div>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Public base URL */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                  URL pública base do R2 <span className="text-slate-400">(sem barra no final)</span>
                </label>
                <input
                  value={importBase}
                  onChange={e => setImportBase(e.target.value)}
                  placeholder="https://pub-xxxx.r2.dev"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">
                  URL final: <span className="text-slate-600 font-mono">{importBase || "https://pub-xxx.r2.dev"}/{importPrefix || "Imagens"}/foto.jpg</span>
                </p>
              </div>

              {/* Path prefix */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                  Pasta no bucket <span className="text-slate-400">(padrão: Imagens)</span>
                </label>
                <input
                  value={importPrefix}
                  onChange={e => setImportPrefix(e.target.value)}
                  placeholder="Imagens"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent font-mono"
                />
              </div>

              {/* Result / error feedback */}
              {importResult && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-700">Importação concluída!</p>
                    <p className="text-xs text-emerald-600">{importResult.imported} fotos importadas · {importResult.skipped} ignoradas</p>
                  </div>
                </div>
              )}
              {importError && <p className="text-xs text-red-500">{importError}</p>}

              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => { setShowImport(false); setImportFile(null); setImportResult(null); setImportError(null); }}>
                  Fechar
                </Button>
                <Button size="sm"
                  onClick={handleImport}
                  disabled={!importFile || !importBase || importing}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                  {importing
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Importando...</>
                    : <><FileJson className="w-3.5 h-3.5 mr-1.5" />Importar {importFile ? "JSON" : ""}</>}
                </Button>
              </div>
            </div>
          )}

          {/* ── Upload form ── */}
          {showUpload && (
            <div className="p-4 bg-violet-50 border border-violet-100 rounded-2xl space-y-4">
              <p className="text-sm font-semibold text-violet-800">Nova foto para a biblioteca</p>

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-violet-200 rounded-xl p-5 text-center cursor-pointer hover:bg-violet-100 transition-colors"
              >
                {selectedFile && previewUrl ? (
                  <div className="flex items-center gap-3 justify-center">
                    <img src={previewUrl} alt="preview" className="w-16 h-16 object-cover rounded-xl border" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-800">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                      <button type="button" className="text-xs text-violet-600 hover:underline mt-0.5">
                        Trocar arquivo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-violet-300" />
                    <p className="text-sm font-medium text-slate-600">Clique para selecionar</p>
                    <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP — máx. 10 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />

              {/* Category grid */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Categoria</p>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat.value} type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                        category === cat.value
                          ? "border-violet-500 bg-violet-100 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                      }`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tags semânticas
                  <span className="text-slate-400 font-normal ml-1">(separadas por vírgula)</span>
                </label>
                <input
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="produto, vermelho, lifestyle, mulher, exterior..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                  Descrição <span className="text-slate-400 font-normal">(ajuda a IA a contextualizar)</span>
                </label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Produto A sendo usado em ambiente ao ar livre, tarde quente"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                />
              </div>

              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => { setShowUpload(false); setSelectedFile(null); setPreviewUrl(null); }}>
                  Cancelar
                </Button>
                <Button size="sm"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Enviando...</>
                    : <><Upload className="w-3.5 h-3.5 mr-1.5" />Fazer upload</>}
                </Button>
              </div>
            </div>
          )}

          {/* ── Photo grid ── */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Images className="w-12 h-12 mb-3 text-slate-200" />
              <p className="font-medium text-slate-600">Nenhuma foto ainda</p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Adicione fotos reais da marca. O Agente Curador vai selecionar automaticamente a melhor para cada post.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-slate-100 bg-slate-50 aspect-square">
                  <img
                    src={photo.url}
                    alt={photo.filename}
                    className="w-full h-full object-cover"
                  />

                  {/* Enhanced badge */}
                  {(photo as BrandPhoto & { enhanced?: boolean }).enhanced && (
                    <div className="absolute top-2 right-2 bg-violet-500 text-white text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Wand2 className="w-2.5 h-2.5" /> IA
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-2.5">
                    <div className="flex items-end justify-between gap-1.5">
                      <div className="min-w-0 flex-1">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-1 ${CATEGORY_COLORS[photo.category] ?? "bg-slate-100 text-slate-600"}`}>
                          {CATEGORIES.find(c => c.value === photo.category)?.label ?? photo.category}
                        </span>
                        {photo.tags.length > 0 && (
                          <p className="text-xs text-white/80 truncate leading-tight">{photo.tags.join(", ")}</p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {/* Enhance button */}
                        <button
                          onClick={() => handleEnhance(photo)}
                          disabled={enhancing === photo.id || enhancingAll}
                          title="Corrigir orientação + melhorar qualidade"
                          className="p-1.5 bg-violet-500 hover:bg-violet-600 rounded-lg text-white transition-colors"
                        >
                          {enhancing === photo.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCw className="w-3.5 h-3.5" />}
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => handleDelete(photo.id)}
                          disabled={deleting === photo.id}
                          className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors"
                        >
                          {deleting === photo.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
