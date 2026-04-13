/**
 * lib/canvas-store.ts
 *
 * Zustand store para o Canvas de Geração de Posts.
 * Orquestra o pipeline completo: Cliente → Estratégia → Copy → Imagem → Post Final.
 *
 * Cada etapa é independente — pode ser re-executada sem reiniciar as anteriores.
 */

import { create } from "zustand";
import type { BrandProfile, StrategyBriefing } from "@/types";

export type StepStatus = "idle" | "loading" | "done" | "error" | "polling";

export interface CopyData {
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
  visual_prompt:   string;
  layout_prompt?:  string;
  framework_used:  string;
  hook_type:       string;
  post_id?:        string;
}

export interface CanvasState {
  // ── Client ────────────────────────────────────────────────────────────────
  clients:          BrandProfile[];
  clientsLoaded:    boolean;
  selectedClientId: string | null;
  client:           BrandProfile | null;
  campaignFocus:    string;

  // ── Strategy ──────────────────────────────────────────────────────────────
  briefing:        StrategyBriefing | null;
  strategyStatus:  StepStatus;
  strategyError:   string | null;

  // ── Copy ──────────────────────────────────────────────────────────────────
  copy:        CopyData | null;
  copyStatus:  StepStatus;
  copyError:   string | null;

  // ── Image ─────────────────────────────────────────────────────────────────
  postId:          string | null;
  taskId:          string | null;
  imageUrl:        string | null;
  imageProvider:   string | null;
  imageStatus:     StepStatus;
  imageError:      string | null;
  qualityScore:    number | null;

  // ── Composed ──────────────────────────────────────────────────────────────
  composedUrl:     string | null;
  approveStatus:   StepStatus;

  // ── Remove Background ─────────────────────────────────────────────────────
  transparentUrl:  string | null;
  removeBgStatus:  StepStatus;
  removeBgError:   string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  loadClients:     () => Promise<void>;
  selectClient:    (id: string) => void;
  setCampaignFocus:(focus: string) => void;
  runStrategy:     () => Promise<void>;
  runCopy:         () => Promise<void>;
  runImage:        () => Promise<void>;
  pollImage:       (taskId: string, postId: string) => Promise<void>;
  approvePost:     () => Promise<void>;
  rejectPost:      () => Promise<void>;
  removeBackground:() => Promise<void>;
  resetStep:       (step: "strategy" | "copy" | "image" | "all") => void;
}

const POLL_INTERVAL = 4000;
const MAX_POLLS     = 45; // 3 minutes max

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  clients:          [],
  clientsLoaded:    false,
  selectedClientId: null,
  client:           null,
  campaignFocus:    "",

  briefing:       null,
  strategyStatus: "idle",
  strategyError:  null,

  copy:       null,
  copyStatus: "idle",
  copyError:  null,

  postId:        null,
  taskId:        null,
  imageUrl:      null,
  imageProvider: null,
  imageStatus:   "idle",
  imageError:    null,
  qualityScore:  null,

  composedUrl:    null,
  approveStatus:  "idle",

  transparentUrl: null,
  removeBgStatus: "idle",
  removeBgError:  null,

  // ── Load clients list ──────────────────────────────────────────────────────
  loadClients: async () => {
    if (get().clientsLoaded) return;
    try {
      const res  = await fetch("/api/clients");
      const data = await res.json() as { clients: BrandProfile[] };
      set({ clients: data.clients ?? [], clientsLoaded: true });
    } catch {
      set({ clientsLoaded: true });
    }
  },

  // ── Select client ──────────────────────────────────────────────────────────
  selectClient: (id: string) => {
    const client = get().clients.find(c => c.id === id) ?? null;
    set({
      selectedClientId: id,
      client,
      // Reset downstream steps when client changes
      briefing: null, strategyStatus: "idle", strategyError: null,
      copy: null,     copyStatus: "idle",     copyError: null,
      postId: null, taskId: null, imageUrl: null, imageStatus: "idle", imageError: null, qualityScore: null,
      composedUrl: null, approveStatus: "idle",
    });
  },

  setCampaignFocus: (focus) => set({ campaignFocus: focus }),

  // ── Strategy Agent ─────────────────────────────────────────────────────────
  runStrategy: async () => {
    const { selectedClientId, campaignFocus } = get();
    if (!selectedClientId) return;

    set({ strategyStatus: "loading", strategyError: null, briefing: null });

    try {
      const res = await fetch("/api/posts/generate-strategy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ client_id: selectedClientId, campaign_focus: campaignFocus || undefined }),
      });
      const data = await res.json() as StrategyBriefing & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro na estratégia");

      set({ briefing: data, strategyStatus: "done" });
    } catch (e) {
      set({ strategyStatus: "error", strategyError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  // ── Copy Agent ─────────────────────────────────────────────────────────────
  runCopy: async () => {
    const { selectedClientId, briefing } = get();
    if (!selectedClientId || !briefing) return;

    set({ copyStatus: "loading", copyError: null, copy: null });

    try {
      const res = await fetch("/api/posts/generate-copy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          client_id:          selectedClientId,
          theme:              briefing.tema,
          objective:          briefing.objetivo,
          format:             briefing.formato_sugerido,
          pilar:              briefing.pilar,
          publico_especifico: briefing.publico_especifico,
          dor_desejo:         briefing.dor_desejo,
          hook_type:          briefing.hook_type,
          no_persist:         false,
        }),
      });
      const data = await res.json() as CopyData & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro no copy");

      set({ copy: data, copyStatus: "done" });
    } catch (e) {
      set({ copyStatus: "error", copyError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  // ── Image Generation ───────────────────────────────────────────────────────
  runImage: async () => {
    const { selectedClientId, briefing, campaignFocus } = get();
    if (!selectedClientId || !briefing) return;

    set({ imageStatus: "loading", imageError: null, imageUrl: null, composedUrl: null, postId: null, taskId: null, qualityScore: null });

    try {
      const res = await fetch("/api/posts/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          client_id:      selectedClientId,
          campaign_focus: campaignFocus || undefined,
        }),
      });
      const data = await res.json() as {
        post_id?: string; task_id?: string; image_url?: string;
        composed_url?: string; image_provider?: string;
        briefing?: StrategyBriefing; quality_score?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Erro na geração de imagem");

      // Atualiza briefing e copy com o que o pipeline retornou (pode ser diferente)
      if (data.briefing) set({ briefing: data.briefing });

      set({
        postId:        data.post_id ?? null,
        taskId:        data.task_id ?? null,
        imageUrl:      data.image_url ?? null,
        composedUrl:   data.composed_url ?? null,
        imageProvider: data.image_provider ?? null,
        qualityScore:  data.quality_score ?? null,
      });

      if (data.task_id && data.post_id) {
        // Freepik async — inicia polling
        set({ imageStatus: "polling" });
        await get().pollImage(data.task_id, data.post_id);
      } else if (data.image_url || data.composed_url) {
        set({ imageStatus: "done" });
      } else {
        set({ imageStatus: "done" }); // pipeline started, post_id salvo
      }
    } catch (e) {
      set({ imageStatus: "error", imageError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  // ── Polling Freepik ────────────────────────────────────────────────────────
  pollImage: async (taskId: string, postId: string) => {
    let polls = 0;
    while (polls < MAX_POLLS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      polls++;

      try {
        const res = await fetch(`/api/posts/check-image?task_id=${taskId}&post_id=${postId}`);
        const data = await res.json() as {
          status?: string; image_url?: string; composed_url?: string; quality_score?: number;
        };

        if (data.status === "done" || data.image_url || data.composed_url) {
          set({
            imageUrl:    data.image_url    ?? get().imageUrl,
            composedUrl: data.composed_url ?? get().composedUrl,
            qualityScore: data.quality_score ?? get().qualityScore,
            imageStatus: "done",
          });
          return;
        }
        if (data.status === "failed") {
          set({ imageStatus: "error", imageError: "Geração falhou no servidor" });
          return;
        }
      } catch {
        // non-fatal, continua polling
      }
    }
    // Timeout
    set({ imageStatus: "error", imageError: "Timeout: geração demorou mais que 3 minutos" });
  },

  // ── Approve ────────────────────────────────────────────────────────────────
  approvePost: async () => {
    const { postId } = get();
    if (!postId) return;
    set({ approveStatus: "loading" });
    try {
      await fetch(`/api/posts/${postId}/approve`, { method: "POST" });
      set({ approveStatus: "done" });
    } catch {
      set({ approveStatus: "error" });
    }
  },

  // ── Reject ─────────────────────────────────────────────────────────────────
  rejectPost: async () => {
    const { postId } = get();
    if (!postId) return;
    try {
      await fetch(`/api/posts/${postId}/reject`, { method: "POST" });
      set({ approveStatus: "idle", imageUrl: null, composedUrl: null, imageStatus: "idle" });
    } catch { /* silent */ }
  },

  // ── Remove Background ──────────────────────────────────────────────────────
  removeBackground: async () => {
    const { postId } = get();
    if (!postId) return;

    set({ removeBgStatus: "loading", removeBgError: null });
    try {
      const res  = await fetch(`/api/posts/${postId}/remove-bg`, { method: "POST" });
      const data = await res.json() as { transparent_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao remover fundo");
      set({ transparentUrl: data.transparent_url ?? null, removeBgStatus: "done" });
    } catch (e) {
      set({
        removeBgStatus: "error",
        removeBgError: e instanceof Error ? e.message : "Erro desconhecido",
      });
    }
  },

  // ── Reset steps ────────────────────────────────────────────────────────────
  resetStep: (step) => {
    if (step === "all") {
      set({
        briefing: null, strategyStatus: "idle", strategyError: null,
        copy: null,     copyStatus: "idle",     copyError: null,
        postId: null, taskId: null, imageUrl: null, imageStatus: "idle", imageError: null, qualityScore: null,
        composedUrl: null, approveStatus: "idle",
        transparentUrl: null, removeBgStatus: "idle", removeBgError: null,
      });
    } else if (step === "strategy") {
      set({ briefing: null, strategyStatus: "idle", strategyError: null });
    } else if (step === "copy") {
      set({ copy: null, copyStatus: "idle", copyError: null });
    } else if (step === "image") {
      set({
        postId: null, taskId: null, imageUrl: null, imageStatus: "idle", imageError: null,
        qualityScore: null, composedUrl: null, approveStatus: "idle",
        transparentUrl: null, removeBgStatus: "idle", removeBgError: null,
      });
    }
  },
}));
