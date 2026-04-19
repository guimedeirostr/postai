// Helpers de path para a árvore V3: users/{uid}/clients/{cid}/...
// Nunca modificar a estrutura flat existente (posts/, clients/ raiz).

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
  slide:      (u: string, c: string, p: string, s: string) => `users/${u}/clients/${c}/posts/${p}/slides/${s}`,

  jobs:       (u: string, c: string) => `users/${u}/clients/${c}/generationJobs`,
  job:        (u: string, c: string, j: string) => `users/${u}/clients/${c}/generationJobs/${j}`,

  recipes:    () => `recipes`,
  recipe:     (r: string) => `recipes/${r}`,

  // Prompt Compiler V3
  compiledPrompt:  (u: string, c: string, p: string, s: string) =>
    `users/${u}/clients/${c}/posts/${p}/slides/${s}/compiledPrompt/current`,
  promptOutcomes:  (u: string, c: string) => `users/${u}/clients/${c}/promptOutcomes`,
  promptOutcome:   (u: string, c: string, o: string) => `users/${u}/clients/${c}/promptOutcomes/${o}`,

  // Canvas Execution Modes V3
  canvasRuns:   (u: string, c: string) => `users/${u}/clients/${c}/canvasRuns`,
  canvasRun:    (u: string, c: string, r: string) => `users/${u}/clients/${c}/canvasRuns/${r}`,
  phaseRuns:    (u: string, c: string, r: string) => `users/${u}/clients/${c}/canvasRuns/${r}/phaseRuns`,
  phaseRun:     (u: string, c: string, r: string, p: string) => `users/${u}/clients/${c}/canvasRuns/${r}/phaseRuns/${p}`,
};
