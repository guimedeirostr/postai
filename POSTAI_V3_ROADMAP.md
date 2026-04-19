# PostAI v3 — O Diretor Criativo AI

> A IA é o diretor. O canvas é o palco. O cliente é o universo.
> A IA planeja, decide, executa e entrega — o humano cura.

**Stack oficial do projeto (não mudar):** Next.js (App Router) + TypeScript + Firestore + Firebase Auth + Firebase Storage + Vercel. Acesso a dados continua via `lib/firestore/*` seguindo o padrão atual do repo. **Não** introduzir Prisma, Postgres, Supabase DB, pgvector ou qualquer banco novo.

---

## 1. Princípios Fundadores

1. **Brain-first, pixel-last** — nenhum pixel é gerado antes de um plano.
2. **Banco por cliente é sagrado** — toda decisão da IA consulta o `ClientMemory` primeiro.
3. **O canvas é visualização do raciocínio** — nodes aparecem na tela conforme a IA pensa.
4. **Autonomia com freio** — a IA executa fluxos completos, mas o usuário pode pausar, editar ou regerar qualquer node.
5. **Zero retrabalho** — toda peça aprovada vira referência automática pro próximo post do mesmo cliente.
6. **Zero migração destrutiva** — só adição de campos/coleções; o que já existe no Firestore continua funcionando.

---

## 2. Arquitetura

```
apps/web (Next.js 14 App Router)
├── app/
│   ├── (auth)/
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── clients/
│   │   │   └── [id]/
│   │   │       ├── brand/           ← editor de Brand Kit
│   │   │       └── library/         ← biblioteca de assets do cliente
│   │   ├── canvas/[flowId]/         ← CORE: Canvas node-based
│   │   ├── posts/
│   │   │   ├── [id]/                ← timeline de fases
│   │   │   └── [id]/review/         ← curadoria
│   │   ├── carousels/
│   │   ├── variants/
│   │   └── settings/
│   └── api/
│       ├── director/
│       │   ├── plan/route.ts        ← agente planejador
│       │   └── instantiate-canvas/route.ts
│       ├── generate/
│       │   ├── image/route.ts       ← dispara geração de imagem
│       │   └── critic/route.ts      ← GPT-4o vision
│       └── jobs/
│           └── worker/route.ts      ← processador de fila (veja seção 7)
├── components/
│   ├── canvas/                      ← React Flow + custom nodes
│   ├── brand/                       ← Brand Kit editor
│   └── director/                    ← chat do agente
├── lib/
│   ├── firebase/
│   │   ├── client.ts                ← app Firestore no cliente
│   │   └── admin.ts                 ← Firebase Admin SDK (server)
│   ├── firestore/
│   │   ├── converters.ts            ← FirestoreDataConverter por tipo
│   │   ├── paths.ts                 ← helpers de path
│   │   └── queries.ts               ← queries reutilizáveis
│   ├── ai/
│   │   ├── director.ts              ← orquestração do agente
│   │   ├── memory.ts                ← ClientMemory + busca vetorial
│   │   ├── models.ts                ← OpenAI / Replicate / Fal / Ideogram
│   │   └── critic.ts
│   └── jobs/
│       ├── queue.ts                 ← fila em Firestore (veja seção 7)
│       └── worker.ts
└── types/
    └── index.ts                     ← TODOS os tipos novos entram aqui
```

**Stack auxiliar (sem substituir Firestore):**
- UI: Tailwind + shadcn/ui + Framer Motion + Zustand.
- Canvas: `@xyflow/react` (React Flow).
- Forms: React Hook Form + Zod.
- Realtime: `onSnapshot` do Firestore (nativo — não precisa Pusher nem Supabase Realtime).
- Fila de jobs: coleção `generationJobs` no Firestore + Cloud Function / Vercel Cron consumindo (seção 7).
- Storage: Firebase Storage (continua como hoje).
- Modelos IA: OpenAI (GPT-4.1 + GPT-4o vision + text-embedding-3-small), Replicate / Fal para Flux 1.1 Pro, Ideogram 3 e Nano Banana.
- Billing: Stripe com créditos persistidos no doc do usuário.

---

## 3. Modelo de Dados — Firestore

Mantemos o stack atual. Tudo entra como **coleções/subcoleções** aninhadas por usuário e cliente, e os tipos vivem em `types/index.ts`.

### 3.1 Árvore de coleções

```
users/{userId}
  ├── (campos do user: email, name, creditsBalance, plan, ...)
  └── clients/{clientId}
        ├── (campos do cliente: name, niche, createdAt, ...)
        ├── brandKit/default                    ← doc único por cliente
        ├── memory/default                      ← doc único (ClientMemory)
        ├── assets/{assetId}                    ← referências, avatares, logos, gerados
        ├── embeddings/{assetId}                ← vetor separado (paralelo a assets)
        ├── flows/{flowId}                      ← grafos do canvas salvos
        ├── posts/{postId}
        │     └── slides/{slideId}
        └── generationJobs/{jobId}
```

Isolamento natural por usuário+cliente. Regras de segurança simples (seção 3.6).

### 3.2 Tipos em `types/index.ts`

```ts
import type { Timestamp } from "firebase/firestore";

// ---------- ASSETS ----------
export type AssetKind = "reference" | "avatar" | "logo" | "product" | "generated";

export interface Asset {
  id: string;
  clientId: string;
  kind: AssetKind;
  url: string;                 // Firebase Storage public URL
  storagePath: string;         // gs:// path (para delete/replace)
  slug: string;                // @img12, @avatar1 — único por cliente
  prompt?: string;             // se kind === "generated"
  model?: string;              // flux-1.1-pro, ideogram-3, ...
  seed?: number;
  expiresAt?: Timestamp | null;// "Salvar 48h" vs permanente
  createdAt: Timestamp;
}

// Vetor vive numa coleção paralela pra não inchar o doc de Asset
export interface AssetEmbedding {
  assetId: string;
  embedding: number[];         // text-embedding-3-small = 1536 dims
  createdAt: Timestamp;
}

// ---------- BRAND KIT ----------
export interface BrandKit {
  tone: string;                                          // ex: "autoridade médica editorial"
  palette: { primary: string; secondary: string; accents: string[] };
  typography: { headline: string; body: string; weights: number[] };
  logoUrl?: string;
  voiceGuidelines?: string;
  dosAndDonts?: { dos: string[]; donts: string[] };
  updatedAt: Timestamp;
}

// ---------- CLIENT MEMORY ----------
export interface RejectedPattern {
  pattern: string;
  reason: string;
  at: Timestamp;
}

export interface ClientMemory {
  toneExamples: string[];                                // legendas aprovadas (few-shot)
  rejectedPatterns: RejectedPattern[];
  personas: { name: string; description: string }[];
  productCatalog: { name: string; description: string }[];
  stats: { approved: number; rejected: number; avgCriticScore: number };
  updatedAt: Timestamp;
}

// ---------- PLAN (gerado pelo agente) ----------
export interface SlideBriefing {
  n: number;
  intencao: string;            // "gancho emocional", "dor", "solução", "CTA"
  visual: string;              // descrição do visual
  copy: string;                // headline/texto do slide
}

export interface PlanoDePost {
  bigIdea: string;
  publico: string;
  tomVoz: string[];
  estrutura: string;
  referenciasDecididas: string[];  // slugs @img @avatar
  estiloVisual: string;
  paletaAplicada: string[];
  slidesBriefing: SlideBriefing[];
}

// ---------- FLOW (Canvas React Flow) ----------
export type NodeKind =
  | "briefing" | "clientMemory" | "plan"
  | "reference" | "avatar"
  | "prompt" | "copy" | "textOverlay"
  | "carousel" | "output" | "critic"
  | "list" | "organize";

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

export interface Flow {
  id: string;
  clientId: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: Timestamp;
}

// ---------- POST & SLIDE ----------
export type PostStatus =
  | "draft" | "planning" | "directing" | "executing"
  | "review" | "approved" | "failed";

export interface Post {
  id: string;
  clientId: string;
  flowId?: string;
  title: string;
  status: PostStatus;
  failureReason?: string;        // ← corrige o "Falhou" silencioso
  plan?: PlanoDePost;
  format: "feed" | "carousel" | "reels-cover" | "story";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Slide {
  id: string;
  postId: string;
  order: number;
  assetId?: string;
  assetUrl?: string;             // cache do URL para thumbnails rápidos
  copy?: string;
  prompt?: string;
  criticScore?: number;
  criticNotes?: string;
}

// ---------- JOBS ----------
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationJob {
  id: string;
  clientId: string;
  flowId?: string;
  nodeId: string;
  model: string;
  prompt: string;
  refs: string[];                // URLs resolvidas dos @slugs
  status: JobStatus;
  costCredits: number;
  output?: { assetId: string; url: string };
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  attempts: number;              // para retry do CriticNode
}
```

### 3.3 Converters em `lib/firestore/converters.ts`

```ts
import { FirestoreDataConverter, DocumentData } from "firebase/firestore";
import type {
  Post, Flow, Asset, BrandKit, ClientMemory,
  GenerationJob, Slide, AssetEmbedding,
} from "@/types";

const make = <T>(): FirestoreDataConverter<T> => ({
  toFirestore: (data) => data as DocumentData,
  fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as Omit<T, "id">) }) as T,
});

export const postConverter         = make<Post>();
export const flowConverter         = make<Flow>();
export const assetConverter        = make<Asset>();
export const brandKitConverter     = make<BrandKit>();
export const clientMemoryConverter = make<ClientMemory>();
export const jobConverter          = make<GenerationJob>();
export const slideConverter        = make<Slide>();
export const embeddingConverter    = make<AssetEmbedding>();
```

### 3.4 Paths helpers em `lib/firestore/paths.ts`

```ts
export const paths = {
  user:       (u: string) => `users/${u}`,
  clients:    (u: string) => `users/${u}/clients`,
  client:     (u: string, c: string) => `users/${u}/clients/${c}`,

  brandKit:   (u: string, c: string) => `users/${u}/clients/${c}/brandKit/default`,
  memory:     (u: string, c: string) => `users/${u}/clients/${c}/memory/default`,

  assets:     (u: string, c: string) => `users/${u}/clients/${c}/assets`,
  asset:      (u: string, c: string, a: string) => `users/${u}/clients/${c}/assets/${a}`,

  embeddings: (u: string, c: string) => `users/${u}/clients/${c}/embeddings`,
  embedding:  (u: string, c: string, a: string) => `users/${u}/clients/${c}/embeddings/${a}`,

  flows:      (u: string, c: string) => `users/${u}/clients/${c}/flows`,
  flow:       (u: string, c: string, f: string) => `users/${u}/clients/${c}/flows/${f}`,

  posts:      (u: string, c: string) => `users/${u}/clients/${c}/posts`,
  post:       (u: string, c: string, p: string) => `users/${u}/clients/${c}/posts/${p}`,
  slides:     (u: string, c: string, p: string) => `users/${u}/clients/${c}/posts/${p}/slides`,

  jobs:       (u: string, c: string) => `users/${u}/clients/${c}/generationJobs`,
  job:        (u: string, c: string, j: string) => `users/${u}/clients/${c}/generationJobs/${j}`,
};
```

### 3.5 Busca vetorial sem sair do Firestore

Pra começar, **similaridade cosseno computada no Node**:

- `embeddings/{assetId}` guarda `number[]` (1536 dims) com `text-embedding-3-small`.
- `searchSimilar(uid, cid, queryVec, topK=5)` carrega todos os embeddings do cliente (paginando se > 1000) e calcula cosseno em memória.
- Para < 10k assets por cliente isso roda em < 200ms e evita dependência externa.
- Quando um cliente passar de 10k: plugar Vertex AI Matching Engine ou Pinecone como índice externo chaveado pelo `assetId`. Não é a realidade agora.

### 3.6 Regras de segurança (Firestore rules)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

### 3.7 O que NÃO fazer

- ❌ Prisma, Postgres, Supabase DB, pgvector, packages/db.
- ❌ Migrar dados existentes — só adição de campos/coleções.
- ❌ Guardar embedding dentro do doc de Asset (infla leitura).
- ❌ Criar "workspaces" ou reestruturar por cima de `users/{uid}`.

---

## 4. As 5 Fases do Fluxo (o "Cérebro")

Todo post passa por estas 5 fases. É o agente encadeado; cada fase vira um node visível no canvas.

### Fase 1 — 📥 BRIEFING
Humano informa `cliente + objetivo + formato`.
Ex: *"Empório MIX, vender café da manhã de segunda, carrossel 5 slides."*
Persiste em `Post { status: "draft" }`.

### Fase 2 — 🧠 PLANEJAMENTO
IA consulta `ClientMemory` + `BrandKit` e produz `PlanoDePost` (JSON da seção 3.2).
Persiste em `Post.plan` e muda `status` pra `"planning"` → `"directing"`.

### Fase 3 — 🎬 DIREÇÃO
IA instancia o grafo no canvas:
- `BrandContextNode` do cliente.
- `ReferenceNodes` vindos da biblioteca ou marcados pra gerar.
- N `PromptNodes` (1 por slide) com prompts editoriais já escritos.
- `CopyNodes` por slide → `TextOverlayNodes` → `CarouselNode` → `OutputNode` → `CriticNode`.

Persiste em `Flow.nodes/edges` (autosave a cada 1s).

### Fase 4 — ⚡ EXECUÇÃO
Enfileira todos `PromptNodes` como `GenerationJob(status: "queued")`.
Worker consome, chama modelo, salva `Asset` + preenche `Slide.assetUrl`.
Status do Post: `"executing"`.
Realtime por `onSnapshot` nos jobs.

### Fase 5 — 🎯 CURADORIA
Tela `/posts/[id]/review`.
Humano aprova/regenera/edita/reprova cada slide.
Aprovação → `status: "approved"` + embeddings entram em `ClientMemory` via `approvedAssets` e `visualDNA`.
Reprovação → `rejectedPatterns` aprende.

---

## 5. Canvas — Nodes mínimos

Implementado com React Flow (`@xyflow/react`).

| Node | Quem cria | Entrada | Saída | Função |
|---|---|---|---|---|
| `BriefingNode` | humano | — | briefing | inputs do usuário |
| `ClientMemoryNode` | IA | clientId | memory+brand | injeta memória do cliente |
| `PlanNode` | IA | briefing+memory | PlanoDePost | expõe plano editável |
| `ReferenceNode` | IA ou humano | upload | asset-ref (@slug) | imagem do banco |
| `AvatarNode` | humano | upload(5+ fotos) | avatar-ref | rosto consistente |
| `PromptNode` | IA | art-brief+refs | image | gera 1 imagem (Flux/Ideogram/Nano Banana) |
| `CopyNode` | IA | plan | copy | headline/legenda/hashtags |
| `TextOverlayNode` | IA | image+copy | image final | aplica tipografia via Canvas API |
| `CarouselNode` | IA | N slides | carousel | agrupa em ordem |
| `OutputNode` | IA | qualquer | post | empacota em Post |
| `CriticNode` | IA | image+brief | score 0-10 | avalia e pede retry |
| `ListNode` | humano/IA | texto | string[] | batch de temas |
| `OrganizeNode` | humano | grafo | layout | auto-arrange |

**Slugs `@img{n}`:** todo node que produz asset expõe slug único por cliente. No `PromptNode` o textarea tem autocomplete ao digitar `@`. No backend o worker faz `prompt.replace(/@(\w+)/g, resolver)` e envia as URLs como IP-Adapter/reference_images.

**UI:**
- Dark mode. Glassmorphism sutil. Border-radius 16.
- Edges animadas com CSS `pulseGlowEdge` + `electroPulse` (inspirado no IAGen).
- Toolbar topo: Imagem, Avatar, Saída, Lista, Organizar, **Gerar Todos** (verde), **Salvar** (rosa outline).
- Painel direito com abas: Agente | Brand Kit | Histórico.
- Atalhos: `N` novo node, `⌘K` palette, `G` gerar todos, `Space` pan.

---

## 6. Agente Diretor — Implementação

### 6.1 Orquestração

```
START → planning → directing → executing → curating → END
                       ↑                       ↓
                       └──── replan on reject ─┘
```

Implementado com **Vercel AI SDK** (`generateObject` + tool-use) nos endpoints `/api/director/*`. Cada transição persiste `Post.status`.

### 6.2 Tools do agente

```ts
const tools = {
  loadClientMemory: ({ uid, clientId }) => ...,          // lê memory/default + brandKit/default
  searchVisualBank: ({ uid, clientId, query }) => ...,   // embedding + cosseno (lib/ai/memory.ts)
  createPlan:       ({ briefing, memory }) => PlanoDePost,
  instantiateCanvas:({ plan }) => { nodes, edges },
  enqueueGeneration:({ uid, clientId, flowId, nodeId }) => jobId,
  critiqueGeneration:({ assetUrl, brief }) => { score, notes },
  updateMemory:     ({ uid, clientId, event }) => ...,
};
```

### 6.3 Modelos

- **Planejamento & Copy:** GPT-4.1 (ou Claude Sonnet 4.5).
- **Direção visual + crítica:** GPT-4o vision.
- **Imagem:** Flux 1.1 Pro (editorial), Ideogram 3 (texto na arte), Nano Banana (consistência de personagem).
- **Upscale:** Topaz / Magnific via Replicate.
- **Embeddings:** `text-embedding-3-small` da OpenAI.

---

## 7. Fila de Jobs (sem Redis obrigatório)

Usamos o próprio Firestore como fila:

1. POST `/api/generate/image` cria doc em `generationJobs` com `status: "queued"`.
2. **Worker = Vercel Cron (a cada 1 min)** chama `/api/jobs/worker` que:
   - Lê até N docs `queued`, move pra `running` em transação.
   - Chama o modelo via Replicate/Fal.
   - Atualiza `status: "succeeded"` + cria `Asset` + preenche `Slide.assetUrl`.
   - Em erro, grava `error` e `status: "failed"`, respeitando `attempts` (máx 2 para retry pelo Critic).
3. Frontend escuta `onSnapshot` em `generationJobs` pra realtime.

**Alternativa opcional (produção pesada):** migrar worker pra Cloud Functions on-create no doc `generationJobs`. Fica como evolução natural, não entra agora.

Sistema de créditos: debitar atomicamente no mesmo `runTransaction` que cria o job (`users/{uid}.creditsBalance`).

---

## 8. Correção dos Bugs Atuais (Sprint 0 — prioridade 0)

- [ ] Posts com status `"Falhou"` sem motivo: envolver pipeline em try/catch e gravar `Post.failureReason`. Status passa a ser `"failed"`.
- [ ] `"Invalid Date"` nos cards: formatar `createdAt: Timestamp` com `date-fns` + `.toDate()` e locale pt-BR.
- [ ] Card sem thumbnail: ler `slides/{firstSlide}.assetUrl` e renderizar.
- [ ] Botão "Gerar imagem" manual no modal: **remover**. Imagem nasce do fluxo.
- [ ] Página `/posts/[id]` com timeline das 5 fases lendo `Post.status` + lista de `generationJobs` relacionados.

---

## 9. ClientMemory — como a IA aprende

**Ao aprovar um Post:**
1. Pra cada `Slide` aprovado, gera embedding da `copy` + embedding da imagem (vision). Salva em `embeddings/{assetId}`.
2. Adiciona `copy` em `ClientMemory.toneExamples` (limite 50, FIFO).
3. `stats.approved++` e recalcula `avgCriticScore`.

**Ao reprovar:**
1. Usuário dá motivo (obrigatório).
2. Grava em `ClientMemory.rejectedPatterns` com tag.
3. `stats.rejected++`.

**No próximo planejamento:** agente faz RAG buscando top-5 `toneExamples` similares ao briefing + carrega top-10 `rejectedPatterns` recentes no system prompt.

Resultado: **o 10º post fica muito melhor que o 1º**, porque a IA conhece o cliente. Isso é o que o IAGen não tem.

---

## 10. Receitas Prontas

6 templates de `Flow` que o usuário clona:

1. Carrossel Educativo 7 slides.
2. Lançamento de Produto (feed + stories).
3. Prova Social (screenshots → editorial).
4. Campanha Médica Premium (estilo IAGen).
5. Reels Storyboard 9 frames.
6. Stories em Série 5 frames.

Guardadas numa coleção global `recipes/{recipeId}` (read-only para usuários), clonadas ao chamar `createFlowFromRecipe`.

---

## 11. Créditos e Billing

| Ação | Custo |
|---|---|
| StrategyNode / PlanNode | 1 |
| CopyNode | 1 |
| PromptNode (Flux Schnell) | 2 |
| PromptNode (Flux 1.1 Pro / Ideogram 3) | 6 |
| PromptNode (Nano Banana / GPT Image) | 8 |
| VariantNode (x3) | custo × 3 |
| UpscaleNode | 4 |
| TextOverlayNode | 0 (client-side) |
| Agente Diretor (mensagem) | 1 |
| CriticNode | 1 |

Saldo em `users/{uid}.creditsBalance`. Debito atômico via `runTransaction`. Stripe para pacotes 500 / 1500 / 5000.

---

## 12. Roadmap de Execução

### Sprint 0 — Triagem + Types (2 dias)
- [ ] Corrigir os 5 itens da seção 8.
- [ ] Adicionar todos os tipos novos em `types/index.ts`.
- [ ] Criar `lib/firestore/converters.ts` e `lib/firestore/paths.ts`.
- [ ] Atualizar Firestore rules.

### Sprint 1 — Brand Kit + ClientMemory (3 dias)
- [ ] Editor `/clients/[id]/brand` persistindo em `brandKit/default`.
- [ ] Biblioteca `/clients/[id]/library` de assets (upload → Firebase Storage + doc `assets/{id}` + slug auto).
- [ ] `lib/ai/memory.ts` com `loadClientMemory`, `appendApproved`, `appendRejected`, `searchSimilar`.

### Sprint 2 — Canvas Node-Based (4 dias)
- [ ] Instalar `@xyflow/react` + `zustand` + `framer-motion`.
- [ ] `/canvas/[flowId]` com React Flow dark mode.
- [ ] Custom nodes: Briefing, Plan, Reference, Prompt, Copy, Output (glassmorphism + edges glow).
- [ ] Autosave `Flow` com debounce 1s (`setDoc` com merge).

### Sprint 3 — Agente Planejador (3 dias)
- [ ] `POST /api/director/plan`: recebe `{ clientId, objetivo, formato }`, devolve `PlanoDePost`.
- [ ] System prompt "Você é o Diretor Criativo do PostAI" + few-shot dos `toneExamples` + lista de `rejectedPatterns`.
- [ ] `PlanNode` renderiza plano em UI rica e editável.

### Sprint 4 — Agente Diretor (4 dias)
- [ ] `POST /api/director/instantiate-canvas`: recebe `PlanoDePost`, devolve `{ nodes, edges }`.
- [ ] Animação framer-motion de entrada dos nodes (stagger 200ms).
- [ ] Botão **"Criar Post"** na home encadeia plan → instantiate → abre canvas ao vivo.

### Sprint 5 — Execução + Crítica (4 dias)
- [ ] Fila via Firestore (seção 7) + Vercel Cron em `/api/jobs/worker`.
- [ ] Integração Flux 1.1 Pro + Ideogram 3 + Nano Banana via Replicate/Fal.
- [ ] Resolver `@slug` → URL antes de ch