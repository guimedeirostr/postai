"use client";

import { useState } from "react";
import { MoreHorizontal, Star, Pencil, StarOff, Trash2, RotateCcw, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LibraryAsset } from "@/types";

interface Props {
  asset: LibraryAsset;
  onEdit:    (a: LibraryAsset) => void;
  onPrefer:  (a: LibraryAsset) => void;
  onDelete:  (a: LibraryAsset) => void;
  onRestore: (a: LibraryAsset) => void;
}

export function AssetCard({ asset, onEdit, onPrefer, onDelete, onRestore }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const inactive = !asset.active;

  return (
    <div
      className={cn(
        "relative group bg-white rounded-xl border overflow-hidden transition-shadow",
        inactive
          ? "opacity-60 border-slate-200"
          : "border-slate-200 hover:shadow-md hover:border-violet-200",
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
        {asset.downloadUrl ? (
          <img
            src={asset.downloadUrl}
            alt={asset.label}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-slate-300" />
          </div>
        )}

        {/* Preferred star */}
        {asset.preferred && (
          <div className="absolute top-2 left-2 bg-amber-400 text-white rounded-full p-0.5" title={PT_BR.assets.card.preferredBadge}>
            <Star className="w-3 h-3 fill-current" />
          </div>
        )}

        {/* Inactive badge */}
        {inactive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">Inativo</span>
          </div>
        )}

        {/* Hover actions overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={() => onEdit(asset)}
            className="bg-white text-slate-800 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-violet-50 hover:text-violet-700 transition-colors"
          >
            {PT_BR.assets.card.menu.edit}
          </button>
          {!inactive && !asset.preferred && (
            <button
              onClick={() => onPrefer(asset)}
              className="bg-white text-slate-800 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors"
            >
              {PT_BR.assets.card.menu.prefer}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-2.5 py-2 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{asset.slug}</p>
          <p className="text-[10px] text-slate-400 truncate">{asset.label}</p>
        </div>

        {/* Menu */}
        <div className="relative flex-none">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              <button onClick={() => { onEdit(asset); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-slate-700">
                <Pencil className="w-3.5 h-3.5" /> {PT_BR.assets.card.menu.edit}
              </button>
              {!inactive && !asset.preferred && (
                <button onClick={() => { onPrefer(asset); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-50 text-amber-700">
                  <Star className="w-3.5 h-3.5" /> {PT_BR.assets.card.menu.prefer}
                </button>
              )}
              {inactive ? (
                <button onClick={() => { onRestore(asset); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-green-50 text-green-700">
                  <RotateCcw className="w-3.5 h-3.5" /> {PT_BR.assets.card.menu.restore}
                </button>
              ) : (
                <button onClick={() => { onDelete(asset); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 text-red-600">
                  <Trash2 className="w-3.5 h-3.5" /> {PT_BR.assets.card.menu.delete}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
