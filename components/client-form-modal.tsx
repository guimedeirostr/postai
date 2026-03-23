"use client";

import { useState, useRef } from "react";
import { X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/tag-input";
import type { BrandProfile } from "@/types";

type FormData = Omit<BrandProfile, "id" | "agency_id" | "created_at">;

const empty: FormData = {
  name: "", logo_url: null,
  primary_color: "#6d28d9", secondary_color: "#4f46e5",
  fonts: [],
  segment: "", target_audience: "", tone_of_voice: "",
  instagram_handle: "", bio: "", keywords: [], avoid_words: [],
};

interface Props {
  client?: BrandProfile;
  onClose: () => void;
  onSaved: () => void;
}

export function ClientFormModal({ client, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormData>(client ? {
    name: client.name, logo_url: client.logo_url,
    primary_color: client.primary_color, secondary_color: client.secondary_color,
    fonts: client.fonts ?? [],
    segment: client.segment, target_audience: client.target_audience,
    tone_of_voice: client.tone_of_voice, instagram_handle: client.instagram_handle,
    bio: client.bio, keywords: client.keywords, avoid_words: client.avoid_words,
  } : empty);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 600;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => resolve(new File([blob!], "logo.jpg", { type: "image/jpeg" })),
            "image/jpeg", 0.78
          );
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleLogoUpload(rawFile: File) {
    if (!client) return;
    setUploading(true);
    try {
      const file = await compressImage(rawFile);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", client.id);
      const res  = await fetch("/api/clients/upload-logo", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) set("logo_url", data.url);
      else alert(`Erro no upload: ${data.error ?? res.status}`);
    } catch (err) {
      console.error("handleLogoUpload:", err);
      alert("Erro ao enviar logo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const url    = client ? `/api/clients/${client.id}` : "/api/clients";
    const method = client ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-slate-900 text-lg">
            {client ? "Editar Cliente" : "Novo Cliente"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label>Nome da marca *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Núcleo VB" />
          </div>

          {/* Logo */}
          {client && (
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {form.logo_url && (
                  <img src={form.logo_url} alt="logo" className="w-12 h-12 rounded-lg object-cover border" />
                )}
                <Button type="button" variant="outline" size="sm"
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {uploading ? "Enviando..." : "Upload de logo"}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              </div>
              <p className="text-xs text-slate-400">Salve o cliente primeiro para fazer upload da logo.</p>
            </div>
          )}

          {/* Cores */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cor primária *</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primary_color}
                  onChange={e => set("primary_color", e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border" />
                <Input value={form.primary_color} onChange={e => set("primary_color", e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor secundária *</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.secondary_color}
                  onChange={e => set("secondary_color", e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border" />
                <Input value={form.secondary_color} onChange={e => set("secondary_color", e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>

          {/* Segmento + Público */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Segmento *</Label>
              <Input value={form.segment} onChange={e => set("segment", e.target.value)} placeholder="Ex: Saúde e Bem-estar" />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram *</Label>
              <Input value={form.instagram_handle} onChange={e => set("instagram_handle", e.target.value)} placeholder="@handle" />
            </div>
          </div>

          {/* Público-alvo */}
          <div className="space-y-1.5">
            <Label>Público-alvo *</Label>
            <Input value={form.target_audience} onChange={e => set("target_audience", e.target.value)}
              placeholder="Ex: Mulheres 30-50 anos interessadas em saúde" />
          </div>

          {/* Tom de voz */}
          <div className="space-y-1.5">
            <Label>Tom de voz *</Label>
            <textarea value={form.tone_of_voice} onChange={e => set("tone_of_voice", e.target.value)}
              rows={2} placeholder="Ex: Profissional, acolhedor e científico. Nunca genérico."
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <Label>Descrição da marca</Label>
            <textarea value={form.bio} onChange={e => set("bio", e.target.value)}
              rows={2} placeholder="Breve descrição sobre a marca e sua missão"
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <Label>Palavras-chave <span className="text-slate-400 font-normal">(Enter para adicionar)</span></Label>
            <TagInput value={form.keywords} onChange={v => set("keywords", v)} placeholder="Ex: saúde, bem-estar, ciência" />
          </div>

          {/* Avoid words */}
          <div className="space-y-1.5">
            <Label>Palavras proibidas</Label>
            <TagInput value={form.avoid_words} onChange={v => set("avoid_words", v)} placeholder="Ex: milagre, mágico, perfeito" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.name}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {client ? "Salvar alterações" : "Criar cliente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
