"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClientFormModal } from "@/components/client-form-modal";
import { GeneratePostModal } from "@/components/generate-post-modal";
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

export default function ClientsPage() {
  const [clients, setClients]     = useState<BrandProfile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<BrandProfile | undefined>();
  const [deleting, setDeleting]       = useState<BrandProfile | undefined>();
  const [generating, setGenerating]   = useState<BrandProfile | undefined>();

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
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleting(client)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600">
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

                {/* Gerar post */}
                <Button size="sm" variant="outline"
                  onClick={() => setGenerating(client)}
                  className="w-full mt-4 text-violet-700 border-violet-200 hover:bg-violet-50">
                  <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Gerar post
                </Button>
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
    </div>
  );
}
