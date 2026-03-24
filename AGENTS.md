<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# PostAI — Convenções do Projeto

## O que é este projeto

PostAI é uma plataforma SaaS para agências de marketing gerarem conteúdo para Instagram via IA. O fluxo central é:

1. **Estrategista** (`/api/posts/generate-strategy`) — Analisa o perfil da marca e gera um briefing estratégico (pilar, tema, objetivo, público, dor/desejo).
2. **Compositor de Copy** (`/api/posts/generate-copy`) — Usa o briefing para escrever headline, caption, hashtags + gerar `visual_prompt` e `layout_prompt` para imagem.
3. **Geração de imagem** (`/api/posts/generate-image`) — Envia `visual_prompt` para Freepik Mystic API (txt2img).
4. **Refinamento img2img** (`/api/posts/refine-image`) — Envia a arte composta do canvas para Freepik como img2img.
5. **Verificação de status** (`/api/posts/check-image`) — Polling do status da task Freepik.
6. **Orquestrador** (`/api/posts/generate`) — Pipeline completo: strategy + copy + image em uma chamada. Retorna `post_id`; frontend faz polling em check-image.

## Convenções de Prompt

- **Idioma**: Todos os prompts Claude são em **português-BR** (instruções, contexto de marca, captions).
- **`visual_prompt`**: SEMPRE em **inglês** — é enviado diretamente à API Freepik. Ver regra 7 em `lib/prompts/copy.ts`.
- **`layout_prompt`**: SEMPRE em **inglês** — descreve composição do design para img2img. Sempre termina com `"All text overlays are in Brazilian Portuguese (pt-BR)."`.
- **`visual_headline`**: MÁXIMO 6 PALAVRAS. É o texto sobreposto na imagem — deve funcionar sozinho.
- **JSON limpo**: Todos os agentes retornam JSON puro. O código remove markdown fences antes de `JSON.parse`.

## Modelos Claude utilizados

| Rota | Modelo | Max tokens |
|------|--------|-----------|
| `/api/posts/generate-strategy` | `ANTHROPIC_MODEL` env (default: `claude-haiku-4-5-20251001`) | 1024 |
| `/api/posts/generate-copy` | `ANTHROPIC_MODEL` env (default: `claude-haiku-4-5-20251001`) | 2048 |

Configure `ANTHROPIC_MODEL` no `.env.local` para trocar o modelo sem alterar código.

## Estrutura de prompts

Os prompts dos agentes vivem em `lib/prompts/`:

```
lib/prompts/
├── strategy.ts   # buildStrategyPrompt(client, campaign_focus?)
└── copy.ts       # buildCopyPrompt(client, format, objective, strategy?)
                  # selectFramework(objective, hookTypeOverride?)
                  # HOOK_GUIDE, FORMAT_GUIDE
```

**Não escreva prompts inline nas rotas.** Importe de `lib/prompts/`.

## Rate Limiting

Chamadas às rotas de IA são limitadas por agência via `lib/rate-limit.ts`:

- **100 chamadas IA/dia** por `agency_id` (padrão)
- Contador armazenado no Firestore (`rate_limits/{agency_id}_{YYYY-MM-DD}`)
- Retorna HTTP 429 com header `X-RateLimit-Reset` quando excedido
- Para ajustar o limite: altere `AI_DAILY_LIMIT` em `lib/rate-limit.ts`

## Armazenamento de imagens

- **Cloudflare R2** (S3-compatível): fotos da biblioteca da marca, acessadas via `lib/r2.ts`
- **Firebase Storage**: logos de clientes
- **Freepik URLs**: imagens geradas são URLs diretas da Freepik (não armazenadas no R2)

## Dados no Firestore

| Coleção | Descrição |
|---------|-----------|
| `clients` | Perfis de marca (`BrandProfile`). Campo `agency_id` = UID do usuário. |
| `photos` | Fotos da biblioteca (`BrandPhoto`). Indexadas por `agency_id` + `client_id`. |
| `posts` | Posts gerados (`GeneratedPost`). Status: `pending → generating → ready → approved/rejected`. |
| `rate_limits` | Contadores de uso diário por agência. |

## Como testar localmente o pipeline

1. Configure `.env.local` com: `ANTHROPIC_API_KEY`, `FREEPIK_API_KEY`, Firebase vars, R2 vars.
2. `npm run dev`
3. Login via Google OAuth em `/login`
4. Crie um cliente, faça upload de fotos (ou importe via JSON)
5. Gere um post: chame `POST /api/posts/generate` com `{ client_id, campaign_focus? }`
6. Faça polling em `GET /api/posts/check-image?task_id=...&post_id=...` a cada 4s

## Convenções de código

- **App Router** com `async` Server Components e Route Handlers.
- Autenticação: **sempre** verificar `getSessionUser()` no início de cada Route Handler.
- Ownership: **sempre** verificar `agency_id === user.uid` ao buscar docs do Firestore.
- Erros: retornar `NextResponse.json({ error: message }, { status: N })` — nunca lançar para o runtime.
- Tipos: todos os tipos principais estão em `types/index.ts`. Não duplique.
