/**
 * lib/canvas-store.ts
 *
 * Zustand store para o Canvas de Geração de Posts.
 * Orquestra o pipeline completo: Cliente → Estratégia → Copy → Diretor Criativo → Diretor de Fotografia → Compositor → Post Final.
 *
 * Cada etapa é independente — pode ser re-executada sem reiniciar as anteriores.
 */

import { create } from "zustand";
import type { BrandProfile, StrategyBriefing } from "@/types";

// ── Font pair definitions (shared with FontSelectorModal) ─────────────────────

export type FontPairId = "modern" | "editorial" | "script" | "minimal";

export interface FontPair {
  id:          FontPairId;
  label:       string;
  descriptor:  string;
  headline: { cssFamily: string; weight: number; googleId: string };
  secondary:{ cssFamily: string; weight: number; googleId: string };
  /** Keyword sent as font_family to compose API → resolved by typography.ts */
  headlineStyleHint: string;
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: "modern", label: "Bebas Neue + Heebo", descriptor: "Impacto Urbano",
    headline:  { cssFamily: "Bebas Neue",        weight: 400, googleId: "Bebas+Neue:wght@400"             },
    secondary: { cssFamily: "Heebo",             weight: 400, googleId: "Heebo:wght@400;500"              },
    headlineStyleHint: "",        // default → Montserrat Black (closest to Bebas Neue)
  },
  {
    id: "editorial", label: "Playfair + Raleway", descriptor: "Elegância Editorial",
    headline:  { cssFamily: "Playfair Display",  weight: 700, googleId: "Playfair+Display:wght@700;900"   },
    secondary: { cssFamily: "Raleway",           weight: 400, googleId: "Raleway:wght@400;500"            },
    headlineStyleHint: "serif",   // → PlayfairDisplay
  },
  {
    id: "script", label: "Caveat + Karla", descriptor: "Artesanal & Script",
    headline:  { cssFamily: "Caveat",            weight: 700, googleId: "Caveat:wght@700"                 },
    secondary: { cssFamily: "Karla",             weight: 400, googleId: "Karla:wght@400;500"              },
    headlineStyleHint: "script",  // → DancingScript
  },
  {
    id: "minimal", label: "Jakarta + Inter", descriptor: "Minimal & Clean",
    headline:  { cssFamily: "Plus Jakarta Sans", weight: 700, googleId: "Plus+Jakarta+Sans:wght@700;800"  },
    secondary: { cssFamily: "Inter",             weight: 400, googleId: "Inter:wght@400;500"              },
    headlineStyleHint: "minimal", // → Inter Medium
  },
];

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

  // ── Creative Director ─────────────────────────────────────────────────────
  visualPromptEdit:  string;
  referenceImageUrl: string | null;   // data URL (upload) or CDN URL (client bank)
  fontModalOpen:     boolean;
  selectedFont:      { pairId: FontPairId; color: string } | null;

  // ── Compositor ────────────────────────────────────────────────────────────
  textPosition:      "top" | "center" | "bottom-left" | "bottom-full";
  logoPlacement:     "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center" | "none";
  footerVisible:     boolean;
  footerOverlay:     boolean;
  gradientOverlay:   boolean;
  textBgOverlay:     boolean;
  logoOverlay:       boolean;
  headlineColor:     string;
  accentColor:       string;
  compositorStatus:  StepStatus;
  compositorError:   string | null;

  // ── Photo Director ────────────────────────────────────────────────────────
  photoDirectorMode:   "ai" | "bank" | null;
  photoDirectorStatus: StepStatus;
  photoDirectorError:  string | null;
  refinedVisualPrompt: string;
  selectedAiProvider:  string;
  aiPickerOpen:        boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  loadClients:      () => Promise<void>;
  selectClient:     (id: string) => void;
  setCampaignFocus: (focus: string) => void;
  runStrategy:      () => Promise<void>;
  runCopy:          () => Promise<void>;
  runImage:         () => Promise<void>;
  pollImage:        (taskId: string, postId: string) => Promise<void>;
  approvePost:      () => Promise<void>;
  rejectPost:       () => Promise<void>;
  removeBackground: () => Promise<void>;
  resetStep:        (step: "strategy" | "copy" | "image" | "all") => void;

  // ── Creative Director actions ──────────────────────────────────────────────
  setVisualPromptEdit:  (prompt: string) => void;
  setReferenceImageUrl: (url: string | null) => void;
  openFontModal:        () => void;
  closeFontModal:       () => void;
  selectFont:           (font: { pairId: FontPairId; color: string }) => void;

  // ── Compositor actions ─────────────────────────────────────────────────────
  setTextPosition:  (pos: "top" | "center" | "bottom-left" | "bottom-full") => void;
  setLogoPlacement: (placement: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center" | "none") => void;
  setFooterVisible: (visible: boolean) => void;
  setFooterOverlay:  (v: boolean) => void;
  setGradientOverlay:(v: boolean) => void;
  setTextBgOverlay:  (v: boolean) => void;
  setLogoOverlay:    (v: boolean) => void;
  setHeadlineColor:  (c: string) => void;
  setAccentColor:    (c: string) => void;
  composeManual:    () => Promise<void>;

  // ── Photo Director actions ─────────────────────────────────────────────────
  setPhotoDirectorMode:  (mode: "ai" | "bank" | null) => void;
  setRefinedVisualPrompt:(prompt: string) => void;
  setSelectedAiProvider: (provider: string) => void;
  openAiPicker:          () => void;
  closeAiPicker:         () => void;
  runRefinePrompt:       () => Promise<void>;
  runImageWithProvider:  (provider: string) => Promise<void>;
  usePhotoFromBank:      (imageUrl: string) => void;

  // ── Strategy/Copy editing ──────────────────────────────────────────────────
  editBriefingField: (field: string, value: string) => void;
  editCaption:       (caption: string) => void;
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

  // Creative Director defaults
  visualPromptEdit:  "",
  referenceImageUrl: null,
  fontModalOpen:     false,
  selectedFont:      null,

  // Compositor defaults
  textPosition:     "bottom-full",
  logoPlacement:    "top-left",
  footerVisible:    true,
  footerOverlay:    false,
  gradientOverlay:  true,
  textBgOverlay:    false,
  logoOverlay:      true,
  headlineColor:    "#FFFFFF",
  accentColor:      "#8b5cf6",
  compositorStatus: "idle",
  compositorError:  null,

  // Photo Director defaults
  photoDirectorMode:   null,
  photoDirectorStatus: "idle",
  photoDirectorError:  null,
  refinedVisualPrompt: "",
  selectedAiProvider:  "freepik",
  aiPickerOpen:        false,

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
      // Reset Creative Director + Compositor
      visualPromptEdit: "", referenceImageUrl: null, fontModalOpen: false, selectedFont: null,
      textPosition: "bottom-full", logoPlacement: "top-left", footerVisible: true,
      footerOverlay: false, gradientOverlay: true, textBgOverlay: false, logoOverlay: true,
      headlineColor: "#FFFFFF", accentColor: "#8b5cf6",
      compositorStatus: "idle", compositorError: null,
      // Reset Photo Director
      photoDirectorMode: null, photoDirectorStatus: "idle", photoDirectorError: null,
      refinedVisualPrompt: "", aiPickerOpen: false,
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

      set({
        copy: data,
        copyStatus: "done",
        postId: data.post_id ?? get().postId,
        // Sync visual_prompt to Creative Director editable field
        visualPromptEdit: data.visual_prompt ?? "",
      });
    } catch (e) {
      set({ copyStatus: "error", copyError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  // ── Image Generation ───────────────────────────────────────────────────────
  runImage: async () => {
    const { selectedClientId, briefing, campaignFocus, visualPromptEdit } = get();
    if (!selectedClientId || !briefing) return;

    set({ imageStatus: "loading", imageError: null, imageUrl: null, composedUrl: null, postId: null, taskId: null, qualityScore: null, compositorStatus: "idle", compositorError: null });

    try {
      const res = await fetch("/api/posts/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          client_id:      selectedClientId,
          campaign_focus: campaignFocus || undefined,
          ...(visualPromptEdit ? { visual_prompt_override: visualPromptEdit } : {}),
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
      set({ approveStatus: "idle", imageUrl: null, composedUrl: null, imageStatus: "idle", compositorStatus: "idle" });
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
        // Reset Creative Director + Compositor
        visualPromptEdit: "", referenceImageUrl: null, fontModalOpen: false, selectedFont: null,
        textPosition: "bottom-full", logoPlacement: "top-left", footerVisible: true,
        footerOverlay: false, gradientOverlay: true, textBgOverlay: false, logoOverlay: true,
        headlineColor: "#FFFFFF", accentColor: "#8b5cf6",
        compositorStatus: "idle", compositorError: null,
        // Reset Photo Director
        photoDirectorMode: null, photoDirectorStatus: "idle", photoDirectorError: null,
        refinedVisualPrompt: "", aiPickerOpen: false,
      });
    } else if (step === "strategy") {
      set({ briefing: null, strategyStatus: "idle", strategyError: null });
    } else if (step === "copy") {
      set({ copy: null, copyStatus: "idle", copyError: null, visualPromptEdit: "" });
    } else if (step === "image") {
      set({
        postId: null, taskId: null, imageUrl: null, imageStatus: "idle", imageError: null,
        qualityScore: null, composedUrl: null, approveStatus: "idle",
        transparentUrl: null, removeBgStatus: "idle", removeBgError: null,
        compositorStatus: "idle", compositorError: null,
        // Reset Photo Director state too
        photoDirectorMode: null, photoDirectorStatus: "idle", photoDirectorError: null,
        refinedVisualPrompt: "", aiPickerOpen: false,
      });
    }
  },

  // ── Creative Director actions ──────────────────────────────────────────────
  setVisualPromptEdit:  (prompt) => set({ visualPromptEdit: prompt }),
  setReferenceImageUrl: (url)    => set({ referenceImageUrl: url }),
  openFontModal:        ()       => set({ fontModalOpen: true }),
  closeFontModal:       ()       => set({ fontModalOpen: false }),
  selectFont:           (font)   => set({ selectedFont: font, fontModalOpen: false }),

  // ── Compositor actions ─────────────────────────────────────────────────────
  setTextPosition:   (pos)       => set({ textPosition: pos }),
  setLogoPlacement:  (placement) => set({ logoPlacement: placement }),
  setFooterVisible:  (visible)   => set({ footerVisible: visible }),
  setFooterOverlay:  (v)         => set({ footerOverlay: v }),
  setGradientOverlay:(v)         => set({ gradientOverlay: v }),
  setTextBgOverlay:  (v)         => set({ textBgOverlay: v }),
  setLogoOverlay:    (v)         => set({ logoOverlay: v }),
  setHeadlineColor:  (c)         => set({ headlineColor: c }),
  setAccentColor:    (c)         => set({ accentColor: c }),

  composeManual: async () => {
    const {
      postId, imageUrl,
      selectedFont,
      textPosition, logoPlacement, footerVisible,
      footerOverlay, gradientOverlay, textBgOverlay, logoOverlay,
      headlineColor, accentColor,
    } = get();
    if (!postId) return;

    set({ compositorStatus: "loading", compositorError: null });

    try {
      const res = await fetch("/api/posts/compose", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id:          postId,
          image_url:        imageUrl ?? undefined,
          font_family:      selectedFont
            ? (FONT_PAIRS.find(p => p.id === selectedFont.pairId)?.headlineStyleHint || undefined)
            : undefined,
          font_color:       selectedFont?.color ?? undefined,
          text_position:    textPosition,
          logo_placement:   logoPlacement,
          footer_visible:   footerVisible,
          footer_overlay:   footerOverlay,
          gradient_overlay: gradientOverlay,
          text_bg_overlay:  textBgOverlay,
          logo_overlay:     logoOverlay,
          headline_color:   headlineColor !== "#FFFFFF" ? headlineColor : undefined,
          accent_color:     accentColor,
        }),
      });
      const data = await res.json() as { composed_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao compor post");

      set({
        composedUrl:      data.composed_url ?? null,
        compositorStatus: "done",
      });
    } catch (e) {
      set({
        compositorStatus: "error",
        compositorError: e instanceof Error ? e.message : "Erro desconhecido",
      });
    }
  },

  // ── Photo Director actions ─────────────────────────────────────────────────
  setPhotoDirectorMode:   (mode)     => set({ photoDirectorMode: mode }),
  setRefinedVisualPrompt: (prompt)   => set({ refinedVisualPrompt: prompt }),
  setSelectedAiProvider:  (provider) => set({ selectedAiProvider: provider }),
  openAiPicker:           ()         => set({ aiPickerOpen: true }),
  closeAiPicker:          ()         => set({ aiPickerOpen: false }),

  runRefinePrompt: async () => {
    const { selectedClientId, briefing, visualPromptEdit, campaignFocus } = get();
    if (!selectedClientId) return;
    set({ photoDirectorStatus: "loading", photoDirectorError: null, refinedVisualPrompt: "" });
    try {
      const res = await fetch("/api/posts/refine-visual-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClientId,
          visual_prompt: visualPromptEdit || briefing?.tema || "",
          campaign_focus: campaignFocus || undefined,
          tema: briefing?.tema,
          objetivo: briefing?.objetivo,
        }),
      });
      const data = await res.json() as { refined_prompt?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro no diretor de fotografia");
      set({ refinedVisualPrompt: data.refined_prompt ?? "", photoDirectorStatus: "done" });
    } catch (e) {
      set({ photoDirectorStatus: "error", photoDirectorError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  runImageWithProvider: async (provider: string) => {
    const { postId, refinedVisualPrompt, visualPromptEdit } = get();
    const promptOverride = refinedVisualPrompt || visualPromptEdit || undefined;

    set({
      imageStatus: "loading", imageError: null, imageUrl: null, composedUrl: null,
      taskId: null, qualityScore: null, compositorStatus: "idle", compositorError: null,
      aiPickerOpen: false,
    });

    // If no postId, fall back to full pipeline
    if (!postId) {
      await get().runImage();
      return;
    }

    try {
      const res = await fetch("/api/posts/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          provider,
          ...(promptOverride ? { visual_prompt_override: promptOverride } : {}),
        }),
      });
      const data = await res.json() as { task_id?: string; image_url?: string; composed_url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar imagem");

      set({ taskId: data.task_id ?? null, imageUrl: data.image_url ?? null, composedUrl: data.composed_url ?? null });

      if (data.task_id && postId) {
        set({ imageStatus: "polling" });
        await get().pollImage(data.task_id, postId);
      } else if (data.image_url || data.composed_url) {
        set({ imageStatus: "done" });
      } else {
        set({ imageStatus: "done" });
      }
    } catch (e) {
      set({ imageStatus: "error", imageError: e instanceof Error ? e.message : "Erro desconhecido" });
    }
  },

  usePhotoFromBank: (imageUrl: string) => {
    set({ imageUrl, imageStatus: "done", composedUrl: null, compositorStatus: "idle", compositorError: null });
  },

  // ── Strategy/Copy editing ──────────────────────────────────────────────────
  editBriefingField: (field: string, value: string) => {
    const briefing = get().briefing;
    if (!briefing) return;
    set({ briefing: { ...briefing, [field]: value } });
  },

  editCaption: (caption: string) => {
    const copy = get().copy;
    if (!copy) return;
    set({ copy: { ...copy, caption } });
  },
}));
