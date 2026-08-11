import { runtimeConfig } from "../config.js";
import { retrieveKnowledge } from "./retrieval.js";
import { MockAgentProvider } from "./providers/mock.js";
import { FirebaseAgentProvider } from "./providers/firebase.js";
import { OllamaAgentProvider } from "./providers/ollama.js";

function createProvider(config) {
  if (config.provider === "ollama") {
    return new OllamaAgentProvider(config.ollama);
  }

  if (config.provider === "firebase") {
    return new FirebaseAgentProvider(config.firebase);
  }

  return new MockAgentProvider(config.mock);
}

function shouldUseOfflineFallback(error) {
  if (error instanceof TypeError) return true;
  if ([404, 502, 503, 504].includes(error?.status)) return true;
  return ["OLLAMA_UNAVAILABLE", "OLLAMA_TIMEOUT"].includes(error?.code);
}

export class AgentService {
  constructor({ knowledge, systemPrompt, config = runtimeConfig.agent }) {
    this.knowledge = knowledge;
    this.systemPrompt = systemPrompt;
    this.config = config;
    this.provider = createProvider(config);
    this.fallbackProvider = new MockAgentProvider({
      ...config.mock,
      initialDelayMs: Math.min(config.mock?.initialDelayMs ?? 500, 240)
    });
    this.fallbackHistory = [];
    this.sources = new Map(
      knowledge.nodes
        .filter(
          (entry) =>
            typeof entry.source?.label === "string" &&
            typeof entry.source?.href === "string" &&
            entry.source.href.startsWith("#")
        )
        .map((entry) => [
          entry.id,
          {
            id: entry.id,
            ...entry.source,
            title: entry.title,
            summary: entry.summary,
            tags: Array.isArray(entry.tags) ? entry.tags : [],
            kind: entry.kind,
            status: entry.status,
            authority: entry.authority,
            provenance: entry.provenance
          }
        ])
    );
  }

  get providerLabel() {
    return this.provider.label;
  }

  get providerNotice() {
    return this.provider.notice;
  }

  get providerSectionCopy() {
    return this.provider.sectionCopy;
  }

  get healthEndpoint() {
    return this.config.healthEndpoint;
  }

  async ask(question, onToken, signal, onEvent, pageContext = null) {
    let receivedToken = false;

    const request = {
      question,
      onToken(token) {
        receivedToken = true;
        onToken?.(token);
      },
      onEvent,
      signal,
      pageContext
    };

    let response;
    try {
      response = await this.provider.generate(request);
    } catch (error) {
      if (
        error?.name === "AbortError" ||
        this.provider.name !== "ollama" ||
        error?.partial ||
        receivedToken ||
        !shouldUseOfflineFallback(error)
      ) {
        throw error;
      }

      const retrieval = retrieveKnowledge(question, this.knowledge, this.config.maxContextItems);
      const fallbackRequest = {
        ...request,
        retrieval,
        context: retrieval.matches.map(({ entry }) => entry),
        history: this.fallbackHistory.slice(-(this.config.maxHistoryTurns * 2)),
        systemPrompt: this.systemPrompt
      };

      onEvent?.("stage", {
        node: "generate",
        status: "fallback",
        detail: "Ollama 연결 실패로 검증된 fallback 답변을 사용합니다."
      });
      response = await this.fallbackProvider.generate(fallbackRequest);
      response.trace = {
        ...response.trace,
        requestedProvider: "ollama",
        fallbackReason: error instanceof Error ? error.message : "로컬 모델 연결 실패"
      };
    }

    const traceMatches = new Map(
      (response.trace?.retrieved ?? []).map((match) => [match.id, match])
    );
    const sourceIds = Array.isArray(response.sourceIds)
      ? response.sourceIds.filter(
          (sourceId) => this.sources.has(sourceId) && traceMatches.has(sourceId)
        )
      : [];
    const sources = [...new Set(sourceIds)]
      .map((sourceId) => {
        const source = this.sources.get(sourceId);
        const match = traceMatches.get(sourceId);
        return source && match ? { ...source, match } : source;
      })
      .filter(Boolean);
    const followUps = Array.isArray(response.followUps) ? response.followUps : [];

    this.fallbackHistory.push(
      { role: "user", content: question },
      { role: "assistant", content: response.answer }
    );
    this.fallbackHistory = this.fallbackHistory.slice(-(this.config.maxHistoryTurns * 2));

    return { ...response, sources, followUps };
  }

  async resetSession() {
    this.fallbackHistory = [];
    await this.provider.resetSession?.();
  }
}
