"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AssetsPage } from "@/components/assets/AssetsPage";

export default function ClientAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = React.use(params);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        href={`/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Biblioteca de Assets</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Logos, produtos, pessoas e fundos usados nas composições da marca.
        </p>
      </div>

      <AssetsPage clientId={clientId} clientName="" />
    </div>
  );
}
