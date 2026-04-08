"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, Loader2, ImageIcon, Camera, ScanSearch, GalleryHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientFormModal } from "@/components/client-form-modal";
import { GeneratePostModal } from "@/components/generate-post-modal";
import { GenerateCarouselModal } from "@/components/generate-carousel-modal";
import { PhotoLibraryModal } from "@/components/photo-library-modal";
import { AnalyzeReferenceModal } from "@/components/analyze-reference-modal";
import type { BrandProfile } from "@/types";

function DeleteDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="font-semibold text-slate-900 mb-2">Excluir cliente</h3>
        <p className="text-slate-500 text-sm mb-5">
          Tem certeza que deseja excluir <strong>{name}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>Excluir</Button>
        </div>
      </div>
    </div>
  );
}

function ResetDnaDialog({
  name,
  loading,
  onConfirm,
  onCancel,
}: {
  name: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-none">
            <RotateCcw className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="font-semibold text-slate-900">Resetar DNA Visual</h3>
        </div>
        <p className="text-slate-500 text-sm mb-2">
          Isso vai apagar o DNA sintetizado e todos os exemplos de referência de{" "}
          <strong>{name}</strong> para começar do zero com o novo workflow.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-5 space-y-1">
          <p>🗑️ <strong>Apagado:</strong> DNA sintetizado + exemplos de design</p>
          <p>✅ <strong>Mantido:</strong> perfil, cores, logo e fotos da biblioteca</p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Resetando...</>
            ) : (
              <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Resetar DNA</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients]     = useState<BrandProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<BrandProfile | undefined>();
  const [deleting, setDeleting]       = useState<BrandProfile | undefined>();
  const [generating,   setGenerating]   = useState<BrandProfile | undefined>();
  const [viewPhotos,   setViewPhotos]   = useState<BrandProfile | undefined>();
  const [analyzing,    setAnalyzing]    = useState<BrandProfile | undefined>();
  const [carouseling,  setCarouseling]  = useState<BrandProfile | undefined>();
  const [resetingDna,  setResetingDna]  = useState<BrandProfile | undefined>();
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg,     setResetMsg]     = useState<{ name: string; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const res  = await fetch("/api/clients");
    const data = await res.json();
    setClients(data.clients ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(client: BrandProfile) {
    await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    setDeleting(undefined);
    load();
  }

  function openNew()   { setEditing(undefined); setShowForm(true); }
  function openEdit(c: BrandProfile) { setEditing(c); setShowForm(true); }

  async function handleResetDna(client: BrandProfile) {
    setResetLoading(true);
    try {
      const res  = await fetch(`/api/clients/${client.id}/reset-dna`, { method: "DELETE" });
      const data = await res.json() as { message?: string; error?: string };
      setResetingDna(undefined);
      setResetMsg({ name: client.name, text: res.ok ? (data.message ?? "DNA resetado com sucesso.") : (data.error ?? "Erro ao resetar DNA.") });
      setTimeout(() => setResetMsg(null), 4500);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 mt-1">Gerencie os perfis de marca dos seus clientes</p>
        </div>
        <Button onClick={openNew} className="bg-violet-600 hover:bg-violet-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Novo cliente
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
          <Users className="w-10 h-10 mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Nenhum cliente ainda</p>
          <p className="text-sm mt-1">Clique em "Novo cliente" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {clients.map(client => (
            <Card key={client.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                {/* Header do card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {client.logo_url ? (
                      <img src={client.logo_url} alt={client.name}
                        className="w-12 h-12 rounded-xl object-cover border" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                        style={{ backgroundColor: client.primary_color }}>
                        {client.name[0]}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">{client.name}</p>
                      <p className="text-xs text-slate-400">{client.segment}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(client)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                      title="Editar perfil">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setResetingDna(client)}
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                      title="Resetar DNA visual">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleting(client)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                      title="Excluir cliente">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Cores */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: client.primary_color }} title="Cor primária" />
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: client.secondary_color }} title="Cor secundária" />
                  {client.instagram_handle && (
                    <span className="text-xs text-slate-400 ml-auto">{client.instagram_handle}</span>
                  )}
                </div>

                {/* Keywords */}
                {client.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {client.keywords.slice(0, 4).map(k => (
                      <span key={k} className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                        {k}
                      </span>
                    ))}
                    {client.keywords.length > 4 && (
                      <span className="text-xs text-slate-400">+{client.keywords.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline"
                    onClick={() => setViewPhotos(client)}
                    className="text-slate-600 border-slate-200 hover:bg-slate-50">
                    <Camera className="w-3.5 h-3.5 mr-1.5" /> Fotos
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => setAnalyzing(client)}
                    className="text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                    title="Analisar referência visual">
                    <ScanSearch className="w-3.5 h-3.5 mr-1.5" /> DNA
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => setGenerating(client)}
                    className="text-violet-700 border-violet-200 hover:bg-violet-50">
                    <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Post
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => setCarouseling(client)}
                    className="flex-1 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50">
                    <GalleryHorizontal className="w-3.5 h-3.5 mr-1.5" /> Carrossel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ClientFormModal
          client={editing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {deleting && (
        <DeleteDialog
          name={deleting.name}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(undefined)}
        />
      )}

      {generating && (
        <GeneratePostModal
          client={generating}
          onClose={() => setGenerating(undefined)}
          onGenerated={load}
        />
      )}

      {viewPhotos && (
        <PhotoLibraryModal
          client={viewPhotos}
          onClose={() => setViewPhotos(undefined)}
        />
      )}

      {analyzing && (
        <AnalyzeReferenceModal
          client={analyzing}
          onClose={() => setAnalyzing(undefined)}
          onSaved={() => {/* reference saved — no list reload needed */}}
        />
      )}

      {carouseling && (
        <GenerateCarouselModal
          client={carouseling}
          onClose={() => setCarouseling(undefined)}
        />
      )}

      {resetingDna && (
        <ResetDnaDialog
          name={resetingDna.name}
          loading={resetLoading}
          onConfirm={() => handleResetDna(resetingDna)}
          onCancel={() => setResetingDna(undefined)}
        />
      )}

      {/* Toast de confirmação de reset */}
      {resetMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm">
          <RotateCcw className="w-4 h-4 text-amber-400 flex-none" />
          <span><strong>{resetMsg.name}</strong> — {resetMsg.text}</span>
        </div>
      )}
    </div>
  );
}
