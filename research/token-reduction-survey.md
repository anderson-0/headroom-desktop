# Reducing LLM Token Consumption Without Losing Context or Quality

*Full-stack survey. Compiled 2026-06-29.*

Framed against an inline compaction proxy (Headroom) that already does type-aware
lossless-first compression, CCR retrieval markers for lossy drops, prompt-cache
prefix alignment, and never drops whole messages. For each technique: how it
works, measured impact, failure modes, and whether it is **complementary** to
that proxy or **overlapping**.

**Rigor note:** headline numbers are best-case results on specific
benchmarks/datasets. Production results are consistently more modest (the
routing section makes this explicit). Anything labeled *emerging* is
directionally interesting, not broadly proven.

---

## Layer 1 — Model/provider-side (no architecture change)

### 1.1 Prompt caching (exact-prefix) — complementary, highest ROI, zero quality risk
The provider caches the KV state of a stable prompt prefix; subsequent requests
reusing that prefix skip recomputation. Anthropic reports up to **90% cost
reduction and up to 85% latency reduction** on long prompts (100K-token book
example: TTFT 11.5s -> 2.4s). Mechanics: **exact match only** (one changed
character = full price), **1,024-token minimum** block (lower for Haiku), up to
**4 breakpoints** processed tools -> system -> messages, **5-min default TTL**
(1-hour extended), refreshed on use. OpenAI prompt caching is automatic and free
for prompts over 1,024 tokens.

- **Failure mode:** counterproductive if enabled but rarely hit — you pay the
  cache-*write* premium without amortizing it. Dynamic content early in the
  prefix destroys all downstream cache hits.
- **vs Headroom:** this is exactly what cache-prefix alignment protects. The
  complementary win is *guaranteeing* breakpoints land on the largest stable
  blocks and never letting a compression rewrite mutate cached bytes. Tokenizer
  caveat: newer models may tokenize the same text up to ~35% differently, so
  cache-block sizing must be measured per model.

Sources: [Claude prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Introl guide](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025),
[PromptHub cross-provider](https://www.prompthub.us/blog/prompt-caching-with-openai-anthropic-and-google-models),
[Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)

### 1.2 Token-efficient tool use — complementary
Anthropic beta reduces tokens consumed during tool-call generation. Guidance:
flat schemas, concise field descriptions, drop unused optional fields, split
large extraction schemas. Savings are schema-dependent — measure on real schemas.

- **vs Headroom:** orthogonal — operates on the tool-call output path the proxy
  does not shape. Worth pairing.

Sources: [Token-efficient tool use docs](https://docs.claude.com/en/docs/agents-and-tools/tool-use/token-efficient-tool-use)

### 1.3 Structured outputs / JSON schema — complementary, modest
Constraining output to JSON omits natural-language fluff and gives compact,
parse-ready data. Saves *output* tokens (often the costlier direction).

- **Failure mode:** forcing rigid JSON too early can hurt reasoning quality
  (model needs room to think before emitting structure).
- **vs Headroom:** output-side; the proxy is input-side. Complementary.

Sources: [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[cross-provider guide](https://logic.inc/resources/structured-outputs-guide)

### 1.4 Batch API — complementary, no quality cost
Async batch endpoints (Anthropic/OpenAI) give ~50% discounts; stack with caching
multipliers. Non-interactive workloads only. Pure cost lever, zero context loss.

---

## Layer 2 — Routing & cascades (model selection)

### 2.1 LLM cascades (FrugalGPT) — strong research, modest in production
Try the cheapest model first; a scoring function decides if the answer is
reliable; escalate only if not. **FrugalGPT matched GPT-4 quality with up to 98%
cost reduction** (or +4% accuracy at equal cost) on their benchmarks. Escalation
signal can be self-consistency across CoT samples. Requires labeled data to learn
thresholds.

### 2.2 Single-step routers (RouteLLM) — production-ready
A classifier dispatches each query to one model up front (no rejected-stage
cost). **RouteLLM: ~85% cost reduction on MT-Bench while keeping ~95% of GPT-4
performance.**

- **Key tradeoff (agents):** in multi-step agent loops, **cascades pay the cost
  of every rejected stage on every step** — it accumulates. Pure routers pay the
  routing decision once. Single-shot Q&A favors cascades; multi-step agents favor
  pure routers.
- **Reality check:** headline numbers are best-case; **most enterprise teams see
  40–70%** in production.
- **vs Headroom:** complementary and arguably the biggest untapped lever — a
  provider-agnostic proxy is the natural place to insert a confidence/complexity
  router. Start with a two-model confidence cascade on predictable query types
  (no training data needed).

Sources: [FrugalGPT paper](https://arxiv.org/abs/2305.05176),
[LeanLM routing](https://leanlm.ai/blog/llm-model-routing),
[nexos.ai FrugalGPT](https://nexos.ai/blog/frugal-gpt/),
[Portkey](https://portkey.ai/blog/implementing-frugalgpt-smarter-llm-usage-for-lower-costs/),
[SMART (no-label thresholds)](https://arxiv.org/pdf/2403.13835)

---

## Layer 3 — Prompt compression (input-side, closest to Headroom)

### 3.1 LLMLingua family — overlaps Headroom text compression; question-aware variant is complementary
- **LLMLingua:** perplexity-based token pruning with a small LM.
- **LongLLMLingua:** adds **question-aware** coarse-to-fine compression, document
  reordering (fights "lost in the middle"), dynamic ratios, subsequence recovery.
  **Up to +21.4% performance with ~4x fewer tokens on NaturalQuestions**, and
  **94% cost reduction on LooGLE** at 2x–6x compression.
- **LLMLingua-2 (2024):** task-agnostic, trained via GPT-4 data distillation as
  token classification — faster, more faithful, better for general compression.

Method-choice insight: extractive (reranker-based) compression **improved**
accuracy (+7.89 F1 on 2WikiMultihopQA at 4.5x) by filtering noise, while
**abstractive** compression at similar ratios *decreased* accuracy (−4.69 F1).
Tiers: light (2–3x) ~80% cost cut at <5% accuracy loss; moderate (5–7x) ~85–90%
cost cut at 5–15% accuracy loss.

- **Failure mode:** task-agnostic perplexity pruning can strip question-relevant
  tokens; abstractive summarization risks paraphrase errors; effectiveness is
  **benchmark-dependent**.
- **vs Headroom:** Headroom already does type-aware text compression (Kompress)
  and lossless-first. Complementary addition: **question-aware** scoring using the
  latest user query (Headroom already extracts the query for routing;
  LongLLMLingua-style contrastive-perplexity selection would deepen it). The
  extractive-beats-abstractive finding validates Headroom's lossless-first + CCR
  design over summarization.

Sources: [LongLLMLingua paper](https://arxiv.org/pdf/2310.06839),
[LLMLingua series](https://www.llmlingua.com/),
[Characterizing prompt compression](https://arxiv.org/pdf/2407.08892),
[benchmark-dependent dynamics](https://arxiv.org/pdf/2603.23527),
[LeanLM prompt compression](https://leanlm.ai/blog/prompt-compression)

---

## Layer 4 — Caching by meaning

### 4.1 Semantic caching (GPTCache et al.) — complementary, but real quality risk
Embed the query, vector-search prior queries; on a near-match return the stored
response without calling the LLM. **61.6%–68.8% fewer API calls**; hit rate tracks
query predictability (highest for repetitive support traffic).

- **Central failure mode — false positives:** related-but-different questions
  collide and the user gets a wrong answer. Governed by the **similarity
  threshold**: ~0.8 was optimal in the cited study (>97% positive-hit accuracy at
  ~68.8% hit rate); too low = wrong answers, too high = no savings. GPTCache
  produced **233 false hits vs MeanCache's 89** out of 700 queries.
- **Other failure mode — embedding drift:** provider updates the embedding model
  and similarity scores shift; mitigate with versioned embeddings + TTL.
- **Required discipline:** sample 1–5% of cache hits for LLM-as-judge grading;
  tolerance ~2% false-positive (0.5% regulated).
- **vs Headroom:** complementary at a different layer (response reuse vs request
  shrinking). Lower-risk first step is exact-match/prompt caching (1.1) before
  embedding-based caching.

Sources: [GPT Semantic Cache paper](https://arxiv.org/abs/2411.05276),
[GPTCache](https://www.researchgate.net/publication/376404523_GPTCache_An_Open-Source_Semantic_Cache_for_LLM_Applications_Enabling_Faster_Answers_and_Cost_Savings),
[buildmvpfast threshold guidance](https://www.buildmvpfast.com/blog/semantic-caching-ai-agents-cost-optimization),
[Spheron setup](https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/)

---

## Layer 5 — RAG vs long-context (architecture)

Consensus 2024–2025: **route, don't commit.** Retrieval wins when contexts exceed
~100K tokens, the task is numerical reasoning / precise fact lookup, models are
weaker/open-source, or data is dynamic. Long-context wins for **global synthesis**
over static documents with strong proprietary models.

- **"Lost in the middle"** (TACL 2024): accuracy is U-shaped across position —
  models attend best to start and end. Core reason "just use the 1M window"
  degrades quality.
- **Self-Route (EMNLP 2024):** let the model decide per-query whether it needs
  full context or retrieval — improves accuracy *and* cuts cost.
- **vs Headroom:** out of scope for a message-rewriting proxy, but reinforces the
  routing principle in Layer 2.

Sources: [Long Context vs RAG eval](https://arxiv.org/pdf/2501.01880),
[Meilisearch comparison](https://www.meilisearch.com/blog/rag-vs-long-context-llms),
[UDA benchmark](https://arxiv.org/pdf/2406.15187)

---

## Layer 6 — Agent context engineering (highest leverage for agent workloads)

Anthropic's four strategies: **write, compress, isolate, select/retrieve.** Most
agent failures are *context* failures, not model failures.

- **Compaction / summarization checkpoints:** summarize history with a fast model
  at token thresholds (Aider, OpenHands, Gemini CLI, Codex CLI). Codex CLI splits
  **pre-turn vs mid-turn** compaction so reinjected context lands where the model
  expects it.
  - **Failure mode — "thrashing":** compaction drops something needed, so the
    agent re-reads files / re-runs tools, *increasing* tokens. The single most
    important failure mode for a compaction proxy.
- **Tool-result clearing** (Anthropic, Claude Developer Platform): keep message
  structure, clear stale raw tool outputs — lightest-touch compaction.
  **Essentially Headroom's read-lifecycle / CCR markers**, validating that design.
- **Structured note-taking / external memory** (Anthropic memory tool, Sonnet 4.5
  beta): agent writes state to a file outside context and reloads after resets.
- **Sub-agent context isolation:** specialized sub-agents with clean narrow
  windows; Anthropic's multi-agent researcher beat single-agent this way.
- **Temporal isolation:** fresh sessions carrying only a summary forward
  (RelentlessAgent: up to 10,000 sequential sub-sessions).

- **vs Headroom:** read-lifecycle + CCR + never-drop-messages already implements
  "compress + don't lose context." Complementary frontier: **external memory**
  (page dropped content to a re-readable file — CCR markers already gesture at
  this) and **anti-thrashing telemetry** (detect re-reads of compacted content
  and back off).

Sources: [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
[LangChain context engineering](https://www.langchain.com/blog/context-engineering-for-agents),
[mem0 guide](https://mem0.ai/blog/context-engineering-ai-agents-guide)

---

## Bottom line: ranked complementary additions for a Headroom-style proxy

| Priority | Technique | Why | Quality risk |
|---|---|---|---|
| 1 | Cache-breakpoint optimization (1.1) | Compounds with everything; 90% read savings; per-model tokenizer-aware | None |
| 2 | Confidence/complexity routing (2.2) | Proxy is the natural insertion point; 40–70% real savings; no message loss | Low |
| 3 | Question-aware pruning (3.1) | Deepens existing text compression using the user query | Low–med (extractive only) |
| 4 | External-memory paging (6) | Extends CCR markers to durable re-readable storage | Low |
| 5 | Anti-thrashing telemetry (6) | Detect re-reads of compacted content; #1 compaction failure | Reduces risk |
| 6 | Semantic response cache (4.1) | Big savings on repetitive traffic; needs threshold tuning + eval loop | High if untuned |

Throughline across the measured evidence: **lossless/extractive beats
lossy/abstractive**, **exact-match caching beats semantic caching on safety**, and
**routing per-query beats committing to one model or one context strategy** —
exactly the philosophy Headroom already follows. Clearest gains come from *adding
routing and cache discipline around* the existing compaction, not replacing it.
