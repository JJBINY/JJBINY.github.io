import { runtimeConfig } from "../config.js";
import { retrieveKnowledge } from "./retrieval.js";
import { MockAgentProvider } from "./providers/mock.js";
import { FirebaseAgentProvider } from "./providers/firebase.js";
import { OllamaAgentProvider } from "./providers/ollama.js";
import {
  classifyQueryScope,
  createNavigationAction,
  validateNavigationAction
} from "./query-scope.js";

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
  constructor({ knowledge, projects = [], systemPrompt, config = runtimeConfig.agent }) {
    this.knowledge = knowledge;
    this.projects = projects;
    this.systemPrompt = systemPrompt;
    this.config = config;
    this.provider = createProvider(config);
    this.fallbackProvider = new MockAgentProvider({
      ...config.mock,
      initialDelayMs: Math.min(config.mock?.initialDelayMs ?? 500, 240)
    });
    this.fallbackHistory = [];
    this.runtimeIdentity = {
      queryIndexDigest: "unknown",
      goldCorpusDigest: "none",
      presetDigest: "unknown",
      model: this.config.ollama?.model ?? this.provider.name ?? "unknown"
    };
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

  get followUpCacheIdentity() {
    return Object.freeze({
      publicBundleDigest: this.knowledge.metadata?.bundleDigest ?? "unknown",
      model: this.runtimeIdentity.model,
      agentContract: this.config.ollama?.agentContract ?? "portfolio-agent-v1",
      clientRelease: this.config.ollama?.clientRelease ?? "unknown",
      queryIndexDigest: this.runtimeIdentity.queryIndexDigest,
      goldCorpusDigest: this.runtimeIdentity.goldCorpusDigest,
      presetDigest: this.runtimeIdentity.presetDigest,
      conversationDigest: this.provider.sessionId ?? `fresh:${Math.floor(this.fallbackHistory.length / 2)}`
    });
  }

  updateRuntimeIdentity({ queryIndexDigest, goldCorpusDigest, presetDigest, model } = {}) {
    this.runtimeIdentity = {
      queryIndexDigest: queryIndexDigest ?? this.runtimeIdentity.queryIndexDigest,
      goldCorpusDigest: goldCorpusDigest ?? this.runtimeIdentity.goldCorpusDigest,
      presetDigest: presetDigest ?? this.runtimeIdentity.presetDigest,
      model: model ?? this.runtimeIdentity.model
    };
  }

  restoreBrowserSession({ sessionId, turns = [] } = {}) {
    this.provider.restoreSessionId?.(sessionId);
    this.fallbackHistory = turns
      .filter(({ role, body }) => ["user", "assistant"].includes(role) && typeof body === "string")
      .map(({ role, body }) => ({ role, content: body }))
      .slice(-(this.config.maxHistoryTurns * 2));
  }

  get browserSessionIdentity() {
    return Object.freeze({
      sessionId: this.provider.sessionId,
      agentContract: this.config.ollama?.agentContract ?? "portfolio-agent-v1",
      clientRelease: this.config.ollama?.clientRelease ?? "unknown"
    });
  }

  async ask(question, onToken, signal, onEvent, pageContext = null, { cachedFollowUps = null, clarificationReply = null } = {}) {
    let receivedToken = false;
    const queryScope = classifyQueryScope(question, pageContext, this.projects);
    const action = validateNavigationAction(
      createNavigationAction(question, this.projects),
      this.projects
    );

    if (action) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const answer = action.target.kind === "landing"
        ? "프로젝트 목록으로 이동합니다. 현재 대화는 PIP로 유지되며, 3초 안에 이동을 취소할 수 있습니다."
        : `${this.projects.find(({ id }) => id === action.target.projectId)?.title ?? "선택한 프로젝트"}로 이동합니다. 현재 대화는 PIP로 유지됩니다.`;
      const traceId = globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`;
      const stages = [
        ["context", "complete", "현재 대화와 공개 프로젝트 카탈로그를 확인했습니다.", { recentExchangeCount: 0, recalledEpisodeCount: 0, pageContext }],
        ["query-understanding", "complete", `scope: ${queryScope.kind} · navigation intent`, { intent: "navigation", queryScope }],
        ["preset", "complete", "navigation · 허용된 내부 이동만 수행합니다.", { preset: "navigation" }],
        ["evidence", "complete", "프로젝트 카탈로그의 허용된 이동 대상을 확인했습니다.", { seeds: [], confidence: "high", retrieval: { effectiveMode: "allowlisted catalog" } }],
        ["judgment", "skipped", "탐색 이동에는 Gold 판단 렌즈가 필요하지 않습니다.", { gold: { used: false } }],
        ["source-admission", "complete", "임의 URL 없이 검증된 내부 경로만 허용했습니다.", { sourceIds: [] }],
        ["response-ready", "complete", "이동 안내와 취소 가능한 카운트다운을 준비했습니다.", { outputTokens: answer.split(/\s+/).length, timeToFirstTokenMs: 0 }]
      ].map(([node, status, detail, output], index) => ({ node, status, detail, output, traceId, atMs: index * 40 }));
      stages.forEach((payload) => onEvent?.("stage", payload));
      await onToken?.(answer);
      const response = {
        answer,
        actions: [action],
        sourceIds: [],
        sources: [],
        followUps: [],
        insufficientEvidence: false,
        confidence: "high",
        trace: {
          traceId,
          provider: "deterministic-action",
          intent: "navigation",
          queryScope,
          retrieved: [],
          stages,
          totalMs: stages.at(-1).atMs
        }
      };
      this.fallbackHistory.push({ role: "user", content: question }, { role: "assistant", content: answer });
      this.fallbackHistory = this.fallbackHistory.slice(-(this.config.maxHistoryTurns * 2));
      return response;
    }

    const request = {
      question,
      onToken(token) {
        receivedToken = true;
        return onToken?.(token);
      },
      onEvent,
      signal,
      pageContext,
      queryScope,
      clarificationReply,
      preferCachedFollowUps: Array.isArray(cachedFollowUps) && cachedFollowUps.length >= 2
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
      const fallbackStartedAt = performance.now();
      const fallbackTraceId = globalThis.crypto?.randomUUID?.() ?? `fallback-${Date.now()}`;
      const fallbackStages = [];
      const emitFallbackStage = (node, status, detail, output = undefined) => {
        const event = {
          node,
          status,
          detail,
          traceId: fallbackTraceId,
          atMs: Math.round(performance.now() - fallbackStartedAt)
        };
        if (output !== undefined) event.output = output;
        fallbackStages.push(event);
        onEvent?.("stage", event);
      };
      const publicMatches = retrieval.matches.map(({ entry, score, matchType, via }) => ({
        id: entry.id,
        title: entry.title,
        score: Math.round(score * 10) / 10,
        matchType,
        via
      }));
      emitFallbackStage("memory", "complete", "브라우저 fallback은 이번 질문과 현재 공개 화면 문맥만 사용합니다.", {
        recentExchangeCount: 0,
        recalledEpisodeCount: 0,
        pageContext
      });
      emitFallbackStage("classify", "running", "질문 의도를 분류하고 있습니다.");
      emitFallbackStage("classify", "complete", `intent: ${retrieval.intent}`, { intent: retrieval.intent });
      emitFallbackStage("preset", "complete", "generic-retrieval · 브라우저 fallback", {
        preset: "generic-retrieval"
      });
      emitFallbackStage("retrieve", "running", "공개 지식 번들에서 답변 근거를 검색하고 있습니다.");
      emitFallbackStage("retrieve", "complete", `${retrieval.seedMatches.length}개의 seed 근거를 찾았습니다.`, {
        confidence: retrieval.confidence,
        bundle: retrieval.bundle,
        seeds: publicMatches.slice(0, retrieval.seedMatches.length),
        retrieval: { effectiveMode: "browser lexical + graph" }
      });
      emitFallbackStage("connect", "running", "공개 relation을 따라 연관 근거를 확장하고 있습니다.");
      emitFallbackStage("connect", "complete", `${retrieval.matches.filter(({ via }) => via).length}개의 관계 경로를 연결했습니다.`, {
        paths: publicMatches.filter(({ via }) => via).map(({ id, via }) => ({ id, via }))
      });
      const fallbackRequest = {
        ...request,
        retrieval,
        context: retrieval.matches.map(({ entry }) => entry),
        history: this.fallbackHistory.slice(-(this.config.maxHistoryTurns * 2)),
        systemPrompt: this.systemPrompt
      };
      const admittedSourceIds = publicMatches
        .map(({ id }) => id)
        .filter((id) => this.sources.has(id))
        .slice(0, 3);

      emitFallbackStage("ground", "complete", `${admittedSourceIds.length}개의 공개 source 후보를 생성 전에 허용했습니다.`, {
        sourceIds: admittedSourceIds,
        goldCitationCount: 0
      });
      emitFallbackStage(
        "generate",
        "running",
        "Ollama 연결 실패로 검증된 fallback 답변을 구성하고 있습니다."
      );
      response = await this.fallbackProvider.generate(fallbackRequest);
      emitFallbackStage("generate", "fallback", "검증된 공개 지식 답변 엔진으로 생성을 완료했습니다.", {
        outputTokens: response.answer.split(/\s+/).filter(Boolean).length,
        timeToFirstTokenMs: response.trace?.elapsedMs ?? 0
      });
      emitFallbackStage("ground", "complete", `${response.sourceIds.length}개의 허용된 공개 근거를 최종 결속했습니다.`, {
        sourceIds: response.sourceIds
      });
      response.trace = {
        ...response.trace,
        traceId: fallbackTraceId,
        stages: fallbackStages,
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
    const browserCached = this.config.ollama?.agentContract !== "portfolio-agent-v2-preset"
      && Array.isArray(cachedFollowUps)
      && cachedFollowUps.length >= 2;
    const followUps = browserCached
      ? cachedFollowUps.slice(0, 2)
      : Array.isArray(response.followUps) ? response.followUps.slice(0, 2) : [];

    if (!response.needsClarification) {
      this.fallbackHistory.push(
        { role: "user", content: question },
        { role: "assistant", content: response.answer }
      );
      this.fallbackHistory = this.fallbackHistory.slice(-(this.config.maxHistoryTurns * 2));
    }

    return {
      ...response,
      sources,
      followUps,
      trace: {
        ...response.trace,
        followUpMode: browserCached ? "browser-cache" : response.trace?.followUpMode
      }
    };
  }

  async resetSession() {
    this.fallbackHistory = [];
    await this.provider.resetSession?.();
  }
}
