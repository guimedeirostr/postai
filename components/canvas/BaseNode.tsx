"use client";

import React from "react";
import type { StepStatus } from "@/lib/canvas-store";

interface BaseNodeProps {
  children: React.ReactNode;
  title: string;
  icon: React.ReactNode;
  status?: StepStatus;
  selected?: boolean;
  width?: number;
  accentColor?: string;
}

// ── Status configuration ──────────────────────────────────────────────────────

interface StatusConfig {
  barColor: string;
  badgeColor: string;
  badgeText: string;
}

const STATUS_CONFIG: Record<StepStatus, StatusConfig> = {
  idle: {
    barColor:    "bg-violet-600",
    badgeColor:  "bg-slate-100 text-slate-500",
    badgeText:   "Aguardando",
  },
  loading: {
    barColor:    "bg-amber-400",
    badgeColor:  "bg-amber-100 text-amber-700",
    badgeText:   "Processando...",
  },
  done: {
    barColor:    "bg-emerald-500",
    badgeColor:  "bg-emerald-100 text-emerald-700",
    badgeText:   "Concluído",
  },
  error: {
    barColor:    "bg-red-500",
    badgeColor:  "bg-red-100 text-red-700",
    badgeText:   "Erro",
  },
  polling: {
    barColor:    "bg-blue-500",
    badgeColor:  "bg-blue-100 text-blue-700",
    badgeText:   "Gerando...",
  },
};

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3 text-amber-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── BaseNode ──────────────────────────────────────────────────────────────────

export default function BaseNode({
  children,
  title,
  icon,
  status = "idle",
  selected = false,
  width = 280,
}: BaseNodeProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      style={{ width }}
      className={[
        "rounded-xl bg-white shadow-lg overflow-hidden flex flex-col",
        "border-2 transition-colors duration-150",
        selected ? "border-violet-500" : "border-transparent",
      ].join(" ")}
    >
      {/* Top color bar */}
      <div className={`h-1 w-full flex-none ${cfg.barColor}`} />

      {/* Header row */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {/* Icon */}
        <span className="flex-none text-slate-500 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>

        {/* Title */}
        <span className="flex-1 text-sm font-semibold text-slate-800 leading-none truncate">
          {title}
        </span>

        {/* Status badge */}
        <span
          className={[
            "flex-none inline-flex items-center gap-1 px-2 py-0.5",
            "rounded-full text-[10px] font-medium leading-none whitespace-nowrap",
            cfg.badgeColor,
          ].join(" ")}
        >
          {(status === "loading" || status === "polling") && <Spinner />}
          {cfg.badgeText}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-slate-100" />

      {/* Content slot */}
      <div className="px-3 py-3 flex flex-col gap-2">{children}</div>
    </div>
  );
}
