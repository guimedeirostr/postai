"use client";

import { Plus } from "lucide-react";
import { AssetCard } from "./AssetCard";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LibraryAsset, AssetRole } from "@/types";

const ROLE_ICON: Record<AssetRole, string> = {
  logo:       "🎯",
  product:    "🍔",
  person:     "👤",
  background: "🏞️",
};

interface Props {
  role:      AssetRole;
  assets:    LibraryAsset[];
  onAdd:     () => void;
  onEdit:    (a: LibraryAsset) => void;
  onPrefer:  (a: LibraryAsset) => void;
  onDelete:  (a: LibraryAsset) => void;
  onRestore: (a: LibraryAsset) => void;
}

export function AssetGroup({ role, assets, onAdd, onEdit, onPrefer, onDelete, onRestore }: Props) {
  const label = PT_BR.assets.roles[role];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{ROLE_ICON[role]}</span>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          {label} ({assets.length})
        </h3>
        <button
          onClick={onAdd}
          className="ml-auto flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors"
        >
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>

      {assets.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{PT_BR.assets.emptyRole}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {assets.map(a => (
            <AssetCard
              key={a.id}
              asset={a}
              onEdit={onEdit}
              onPrefer={onPrefer}
              onDelete={onDelete}
              onRestore={onRestore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
