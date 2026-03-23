"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  ImageIcon, Loader2, Hash, Copy, Check, X,
  Calendar, Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BrandProfile, GeneratedPost } from "@/types";

const FORMAT_LABEL: Record<string, string> = {
  feed:        "Feed",
  stories:     "Stories",
  reels_cover: "Capa de Reels",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ready:      { label: "Pronto",    className: "bg-green-50 text-green-700 border-green-200" },
  generating: { label: "Gerando…",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:   { label: "Aprovado",  className: "bg-blue-50 text-blue-700 border-blue-200" },
  rejected:   { label: "Rejeitado", className: "bg-red-50 text-red-600 border-red-200" },
};

interface PostDetailModalProps {
  post: GeneratedPost;
  onClose: () => void;
  onImageGenerated?: (post_id: string, image_url: string) => void;
}

function PostDetailModal({ post, onClose, onImageGenerated }: PostDetailModalProps) {
  const [copied,     setCopied]     = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError,   setImgError]   = useState<string | null>(null);
  const [imageUrl,   setImageUrl]   = useState(post.image_url ?? null);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
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

      const { task_id, post_id } = data as { task_id: string; post_id: string };
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check     = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`);
        const checkData = await check.json() as { status: string; image_url?: string; error?: string };
        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setImageUrl(checkData.image_url);
          onImageGenerated?.(post.id, checkData.image_url);
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Imagem ou botão de gerar */}
          {imageUrl ? (
            <div className="rounded-xl overflow-hidden border max-h-72 flex items-center justify-center bg-slate-50">
              <img src={imageUrl} alt={post.headline} className="w-full object-cover" />
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={handleGenerateImage} disabled={imgLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                {imgLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando imagem...</>
                  : <><ImageIcon className="w-4 h-4 mr-2" />Gerar imagem com Freepik</>}
              </Button>
              {imgError && <p className="text-xs text-red-500 text-center">{imgError}</p>}
            </div>
          )}

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

          {/* Hashtags */}
          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" /> Hashtags ({post.hashtags.length})
              </span>
              <button onClick={() => copyText(post.hashtags.map(h => `#${h}`).join(" "), "hashtags")}
                className="text-slate-400 hover:text-slate-700">
                {copied === "hashtags" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags.map(h => (
                <Badge key={h} variant="secondary" className="text-xs">#{h}</Badge>
              ))}
            </div>
          </div>

          {/* Visual prompt */}
          <div className="p-4 bg-violet-50 rounded-xl space-y-1">
            <span className="text-xs font-medium text-violet-500 uppercase tracking-wide">Prompt visual</span>
            <p className="text-slate-600 text-sm italic">{post.visual_prompt}</p>
          </div>
        </div>
      </div>
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
                  {/* Imagem ou placeholder */}
                  {post.image_url ? (
                    <div className="w-full h-44 overflow-hidden rounded-t-xl">
                      <img src={post.image_url} alt={post.headline}
                        className="w-full h-full object-cover" />
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
          onClose={() => setSelected(null)}
          onImageGenerated={(post_id, image_url) => {
            setPosts(prev => prev.map(p => p.id === post_id ? { ...p, image_url, status: "ready" } : p));
            setSelected(prev => prev ? { ...prev, image_url, status: "ready" } : prev);
          }}
        />
      )}
    </div>
  );
}
