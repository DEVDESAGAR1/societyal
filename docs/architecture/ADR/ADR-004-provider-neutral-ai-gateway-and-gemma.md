# ADR-004: Provider-Neutral AI Gateway and Gemma Model Integration

> **Status:** Accepted  
> **Date:** 2026-10-14  
> **Deciders:** Principal AI Architect, Engineering Lead

---

## Context
SocietyFix AI relies heavily on AI models for transcribing meeting discussions, extracting structured minutes and resolutions, decomposing action items, and indexing society memory.

Directly coupling application business services to a specific SDK or vendor creates major architectural risks:
- Vendor lock-in.
- Inability to switch models if pricing, speed, or performance changes.
- Inability to support self-hosted open-weights models (e.g., Gemma 2 on private infrastructure for strict data sovereignty).
- Difficulty testing and mocking AI behaviors in CI/CD.

## Decision
We decided to architect a **Provider-Neutral AI Gateway** based on a hexagonal port-and-adapter architecture, using **Gemma 2 / Gemini** (via `@google/genai`) as the primary production adapter.

### Core Architectural Decisions:
1. **Abstract Gateway Interface (`AIGatewayPort`):** Defines four domain operations:
   - `generateText(request)`
   - `generateStructured<T>(request)` (with Zod validation)
   - `embedText(request)`
   - `transcribeSpeech(request)`
2. **Standard Production Adapter (`GemmaAdapter`):** Implements `AIGatewayPort` using Google's `@google/genai` TypeScript SDK. Configured to use Gemma 2 for cost-effective structured tasks and Gemini 2.5 Flash for high-context multimodal audio ingestion.
3. **Mock Adapter for Testing (`MockAIGatewayAdapter`):** Provides deterministic, instant responses for automated test suites without incurring API costs or network flakiness.
4. **Structured Schema Validation with Zod:** Every structured generation call validates the output against a strict Zod schema. If the model outputs malformed JSON or invalid enums, the gateway catches the error and executes an automated repair loop.
5. **No Direct Execution Agency:** AI outputs are marked as draft proposals (`is_ai_draft = true`). The gateway interface does not have database write access.

## Consequences

### Positive:
- The entire application core remains 100% agnostic to the underlying AI model.
- Switching from cloud-hosted Gemini to self-hosted Gemma on Vertex AI or vLLM requires changing only configuration without modifying a single line of business logic.
- Fast, deterministic automated testing using the mock adapter.
- Schema errors are caught at runtime before invalid data enters domain services.

### Negative / Trade-offs:
- Requires maintaining an adapter abstraction layer and Zod schemas for all structured outputs.
- Repair iterations can occasionally add latency if a model produces malformed output (mitigated by using modern instruction-tuned models with native JSON mode).
