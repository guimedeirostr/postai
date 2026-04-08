"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  ImageIcon, Loader2, Hash, Copy, Check, X,
  Calendar, Tag, Download, Wand2, Layers, RefreshCw, ScanSearch, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BrandProfile, GeneratedPost } from "@/types";
import { PostComposer } from "@/components/post-composer";
import { AnalyzeReferenceModal } from "@/components/analyze-reference-modal";
const FORMAT_LABEL: Record<string, string> = {
  feed:        "Feed",
  stories:     "Stories",
  reels_cover: "Capa de Reels",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:      { label: "Pendente",   className: "bg-slate-50 text-slate-500 border-slate-200" },
  strategy:     { label: "Estratégia", className: "bg-sky-50 text-sky-700 border-sky-200" },
  copy:         { label: "Copy",       className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  art_direction:{ label: "Arte",       className: "bg-purple-50 text-purple-700 border-purple-200" },
  generating:   { label: "Gerando…",   className: "bg-amber-50 text-amber-700 border-amber-200" },
  composing:    { label: "Compondo…",  className: "bg-orange-50 text-orange-700 border-orange-200" },
  ready:        { label: "Pronto",     className: "bg-green-50 text-green-700 border-green-200" },
  approved:     { label: "Aprovado",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  rejected:     { label: "Rejeitado",  className: "bg-red-50 text-red-600 border-red-200" },
  failed:       { label: "Falhou",     className: "bg-red-50 text-red-600 border-red-200" },
};

interface PostDetailModalProps {
  post:    GeneratedPost;
  client?: BrandProfile;
  onClose: () => void;
  onPostUpdated?: (post_id: string, updates: Partial<GeneratedPost>) => void;
}

function PostDetailModal({ post, client, onClose, onPostUpdated }: PostDetailModalProps) {
  const [copied,       setCopied]       = useState<string | null>(null);
  const [imgLoading,   setImgLoading]   = useState(false);
  const [imgError,     setImgError]     = useState<string | null>(null);
  const [compLoading,  setCompLoading]  = useState(false);
  const [compError,    setCompError]    = useState<string | null>(null);
  const [imageUrl,     setImageUrl]     = useState(post.image_url ?? null);
  const [composedUrl,  setComposedUrl]  = useState(post.composed_url ?? null);
  // show composed (branded) by default if available, raw otherwise
  const [viewComposed, setViewComposed] = useState(!!post.composed_url);
  const [showDnaModal,       setShowDnaModal]       = useState(false);
  const [showAllHashtags,    setShowAllHashtags]    = useState(false);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleDownload() {
    const url = composedUrl ?? imageUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href  = url;
    a.download = `post-${post.id}.jpg`;
    a.target = "_blank";
    a.click();
  }

  async function handleCompose() {
    setCompLoading(true);
    setCompError(null);
    try {
      const res  = await fetch("/api/posts/compose", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: post.id }),
      });
      const data = await res.json() as { composed_url?: string; error?: string };
      if (!res.ok) { setCompError(data.error ?? "Erro ao compor"); return; }
      if (data.composed_url) {
        setComposedUrl(data.composed_url);
        setViewComposed(true);
        onPostUpdated?.(post.id, { composed_url: data.composed_url, status: "ready" });
      }
    } catch { setCompError("Erro inesperado. Tente novamente."); }
    setCompLoading(false);
  }

  async function handleGenerateImage() {
    setImgLoading(true);
    setImgError(null);
    try {
      const res  = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: post.id }),
      });
      const data = await res.json();
      if (!res.ok) { setImgError(data.error ?? "Erro ao iniciar geração"); setImgLoading(false); return; }

      // FAL/Imagen4: sync — returns image_url directly
      if (data.image_url) {
        setImageUrl(data.image_url);
        onPostUpdated?.(post.id, { image_url: data.image_url });
        setImgLoading(false);
        // auto-compose
        if (!composedUrl) await handleCompose();
        return;
      }

      // Freepik: async — poll
      const { task_id, post_id } = data as { task_id: string; post_id: string };
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check     = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`);
        const checkData = await check.json() as { status: string; image_url?: string; composed_url?: string; error?: string };
        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setImageUrl(checkData.image_url);
          if (checkData.composed_url) {
            setComposedUrl(checkData.composed_url);
            setViewComposed(true);
          }
          onPostUpdated?.(post.id, { image_url: checkData.image_url, composed_url: checkData.composed_url ?? null, status: "ready" });
          setImgLoading(false);
          return;
        }
        if (checkData.status === "FAILED") {
          setImgError(checkData.error ?? "Falha na geração"); setImgLoading(false); return;
        }
      }
      setImgError("Timeout. Tente novamente.");
    } catch { setImgError("Erro inesperado. Tente novamente."); }
    setImgLoading(false);
  }

  const status = STATUS_BADGE[post.status] ?? STATUS_BADGE.ready;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <p className="font-semibold text-slate-900">{post.headline}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-400">{post.client_name}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-400">{FORMAT_LABEL[post.format]}</span>
              <Badge variant="outline" className={`text-xs ${status.className}`}>{status.label}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(composedUrl ?? imageUrl) && (
              <button onClick={handleDownload}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
                title="Baixar imagem">
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Imagem principal */}
          {/* Toggle raw vs composed */}
          {imageUrl && composedUrl && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setViewComposed(false)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${!viewComposed ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                IA Bruta
              </button>
              <button
                onClick={() => setViewComposed(true)}
                className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors ${viewComposed ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                <Layers className="w-3 h-3" /> Premium
              </button>
            </div>
          )}

          {/* Premium (composed) — exibe só a imagem final, sem canvas adicional */}
          {viewComposed && composedUrl ? (
            <div className="space-y-2">
              {/* Barra de ações rápidas */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Re-compor */}
                <button
                  onClick={handleCompose}
                  disabled={compLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                  title="Re-compor post (após trocar logo ou cores)"
                >
                  {compLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Atualizar
                </button>

                <div className="w-px h-4 bg-slate-200 mx-0.5" />

                {/* Copiar legenda */}
                <button
                  onClick={() => copyText(post.caption, "caption_quick")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Copiar legenda"
                >
                  {copied === "caption_quick"
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                  Legenda
                </button>

                {/* Copiar hashtags */}
                <button
                  onClick={() => copyText(post.hashtags.map(h => `#${h}`).join(" "), "hashtags_quick")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Copiar hashtags"
                >
                  {copied === "hashtags_quick"
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : <Hash className="w-3.5 h-3.5" />}
                  Hashtags
                </button>

                {/* Copiar legenda + hashtags juntos */}
                <button
                  onClick={() => copyText(
                    `${post.caption}\n\n${post.hashtags.map(h => `#${h}`).join(" ")}`,
                    "full_copy"
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                  title="Copiar legenda + hashtags (pronto para colar no Instagram)"
                >
                  {copied === "full_copy"
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                  Copiar tudo
                </button>

                {/* Analisar referência visual para este post */}
                {client && (
                  <>
                    <div className="w-px h-4 bg-slate-200 mx-0.5" />
                    <button
                      onClick={() => setShowDnaModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors ml-auto"
                      title="Salvar imagem como referência de DNA visual do cliente — usada em posts futuros"
                    >
                      <ScanSearch className="w-3.5 h-3.5" />
                      + DNA Visual
                    </button>
                  </>
                )}
              </div>

              <div className="rounded-xl overflow-hidden border bg-slate-50">
                <img src={composedUrl} alt={post.headline} className="w-full object-cover" />
              </div>
            </div>

          /* IA Bruta — PostComposer (canvas) com a imagem raw */
          ) : imageUrl && client ? (
            <PostComposer
              post={{ ...post, image_url: imageUrl }}
              client={client}
              onImageRefined={(url) => {
                setImageUrl(url);
                onPostUpdated?.(post.id, { image_url: url });
              }}
            />

          /* Só imagem, sem cliente carregado */
          ) : imageUrl ? (
            <div className="rounded-xl overflow-hidden border bg-slate-50">
              <img src={imageUrl} alt={post.headline} className="w-full object-cover" />
            </div>

          /* Sem imagem — botão gerar */
          ) : (
            <div className="space-y-2">
              <Button onClick={handleGenerateImage} disabled={imgLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                {imgLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando imagem...</>
                  : <><ImageIcon className="w-4 h-4 mr-2" />Gerar imagem</>}
              </Button>
              {imgError && <p className="text-xs text-red-500 text-center">{imgError}</p>}
            </div>
          )}

          {/* Botão de compor (quando tem imagem mas não tem composed) */}
          {imageUrl && !composedUrl && !compLoading && (
            <Button onClick={handleCompose} disabled={compLoading}
              variant="outline"
              className="w-full border-violet-200 text-violet-700 hover:bg-violet-50">
              <Wand2 className="w-4 h-4 mr-2" />
              Compor post premium (headline + logo)
            </Button>
          )}
          {compLoading && (
            <div className="flex items-center justify-center gap-2 py-2 text-violet-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Compondo arte final...
            </div>
          )}
          {compError && <p className="text-xs text-red-500 text-center">{compError}</p>}

          {/* Headline */}
          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Headline</span>
              <button onClick={() => copyText(post.headline, "headline")} className="text-slate-400 hover:text-slate-700">
                {copied === "headline" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="font-bold text-slate-900 text-lg leading-snug">{post.headline}</p>
          </div>

          {/* Caption */}
          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Legenda</span>
              <button onClick={() => copyText(post.caption, "caption")} className="text-slate-400 hover:text-slate-700">
                {copied === "caption" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{post.caption}</p>
          </div>

          {/* Hashtags — mostra 5 por padrão (limite Instagram atual) */}
          {post.hashtags.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  Hashtags
                  <span className="text-slate-300 font-normal">({post.hashtags.length})</span>
                </span>
                <button onClick={() => copyText(post.hashtags.map(h => `#${h}`).join(" "), "hashtags")}
                  className="text-slate-400 hover:text-slate-700">
                  {copied === "hashtags" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(showAllHashtags ? post.hashtags : post.hashtags.slice(0, 5)).map(h => (
                  <Badge key={h} variant="secondary" className="text-xs">#{h}</Badge>
                ))}
              </div>
              {post.hashtags.length > 5 && (
                <button
                  onClick={() => setShowAllHashtags(v => !v)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-0.5">
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllHashtags ? "rotate-180" : ""}`} />
                  {showAllHashtags ? "Mostrar menos" : `Ver todas (${post.hashtags.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de referência visual — abre por cima do detail modal */}
      {showDnaModal && client && (
        <AnalyzeReferenceModal
          client={client}
          onClose={() => setShowDnaModal(false)}
          onSaved={() => setShowDnaModal(false)}
        />
      )}
    </div>
  );
}

export default function PostsPage() {
  const [posts,    setPosts]    = useState<GeneratedPost[]>([]);
  const [clients,  setClients]  = useState<BrandProfile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("");
  const [selected, setSelected] = useState<GeneratedPost | null>(null);

  async function loadClients() {
    const res  = await fetch("/api/clients");
    const data = await res.json();
    setClients(data.clients ?? []);
  }

  async function loadPosts(client_id?: string) {
    setLoading(true);
    const url  = client_id ? `/api/posts?client_id=${client_id}` : "/api/posts";
    const res  = await fetch(url);
    const data = await res.json();
    setPosts(data.posts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
    loadPosts();
  }, []);

  function handleFilterChange(client_id: string) {
    setFilter(client_id);
    loadPosts(client_id || undefined);
  }

  function formatDate(ts: GeneratedPost["created_at"]) {
    if (!ts) return "";
    const d = (ts as unknown as { toDate?: () => Date }).toDate?.() ?? new Date((ts as unknown as number) * 1000);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Posts Gerados</h1>
          <p className="text-slate-500 mt-1">Todos os posts criados pela IA para seus clientes</p>
        </div>

        {/* Filtro por cliente */}
        {clients.length > 0 && (
          <select
            value={filter}
            onChange={e => handleFilterChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <option value="">Todos os clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
          <ImageIcon className="w-10 h-10 mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Nenhum post ainda</p>
          <p className="text-sm mt-1">Gere posts na página de Clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {posts.map(post => {
            const status = STATUS_BADGE[post.status] ?? STATUS_BADGE.ready;
            return (
              <Card key={post.id}
                className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelected(post)}>
                <CardContent className="p-0">
                  {/* Imagem ou placeholder — prefere a versão composta (premium) */}
                  {(post.composed_url ?? post.image_url) ? (
                    <div className="w-full h-44 overflow-hidden rounded-t-xl relative">
                      <img src={(post.composed_url ?? post.image_url)!} alt={post.headline}
                        className="w-full h-full object-cover" />
                      {post.composed_url && (
                        <span className="absolute top-2 right-2 bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          ✦ Premium
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-44 rounded-t-xl bg-gradient-to-br from-violet-50 to-slate-100 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    </div>
                  )}

                  <div className="p-4 space-y-2">
                    <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                      {post.headline}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-500">{post.client_name}</span>
                      </div>
                      <Badge variant="outline" className={`text-xs ${status.className}`}>
                        {status.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{FORMAT_LABEL[post.format]}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(post.created_at)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <PostDetailModal
          post={selected}
          client={clients.find(c => c.id === selected.client_id)}
          onClose={() => setSelected(null)}
          onPostUpdated={(post_id, updates) => {
            setPosts(prev => prev.map(p => p.id === post_id ? { ...p, ...updates } : p));
            setSelected(prev => prev ? { ...prev, ...updates } : prev);
          }}
        />
      )}
    </div>
  );
}
