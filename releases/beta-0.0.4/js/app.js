import {
  loadAgentContent,
  loadPortfolioContent,
  loadPortfolioKnowledge
} from "./content.js";
import { AgentService } from "./agent/service.js";
import { readCurrentPageContext } from "./agent/page-context.js";
import { initializeDiagramAttachments } from "./agent/diagram-attachments.js";
import { classifyQueryScope, validateNavigationAction } from "./agent/query-scope.js";
import { createFollowUpCache, createFollowUpCacheKey } from "./agent/follow-up-cache.js";
import { createConversationSessionStore } from "./agent/conversation-session.js";
import { renderMermaid } from "./diagrams/mermaid-renderer.js";
import { formatReleaseStamp } from "./release-stamp.js";
import { renderMarkdown } from "./markdown.js";
import {
  initializePortfolioExplorer,
  projectDetailRoute,
  routeForEvidence
} from "./portfolio-explorer.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function setText(selector, value, root = document) {
  $$(selector, root).forEach((element) => {
    element.textContent = value;
  });
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const RETRIEVAL_RELATION_LABELS = Object.freeze({
  supports: "지원 관계",
  demonstrates: "입증 관계",
  applies_to: "적용 관계",
  derived_from: "파생 관계",
  contrasts_with: "대조 관계",
  part_of: "구성 관계"
});

function createRetrievalPath(source) {
  const via = source.match?.via;
  if (!via) return null;
  const relationType = typeof via.type === "string" && via.type.trim()
    ? via.type.trim()
    : "related";
  const relationLabel = RETRIEVAL_RELATION_LABELS[relationType]
    ?? (relationType === "related" ? "연결 관계" : relationType.replaceAll("_", " "));

  const path = createElement("section", "evidence-card__path");
  path.append(
    createElement("span", "evidence-card__path-label", "실제 검색 경로"),
    createElement("p", "", "이번 답변에서 검색 후보가 근거로 확장된 경로입니다.")
  );
  const steps = document.createElement("ol");
  [
    ["01", "시작 후보", via.seedId ?? "retrieval seed"],
    ["02", relationLabel, "그래프 확장"],
    ["03", "선택 근거", source.title ?? source.id]
  ].forEach(([index, label, value]) => {
    const step = document.createElement("li");
    step.append(
      createElement("span", "", index),
      createElement("strong", "", label),
      createElement("code", "", value)
    );
    steps.append(step);
  });
  path.append(steps);
  return path;
}

function renderProfile(site) {
  const {
    profile,
    stats,
    approachCopy,
    principles,
    version = "beta:0.0.4",
    release = {},
    runtime = {}
  } = site;
  const concurrentInferences = Number.isInteger(runtime.concurrentInferences)
    ? Math.max(1, runtime.concurrentInferences)
    : 1;
  const queueCapacity = Number.isInteger(runtime.queueCapacity)
    ? Math.max(0, runtime.queueCapacity)
    : 0;
  const [expectedMin = 20, expectedMax = 40] = Array.isArray(runtime.expectedSeconds)
    ? runtime.expectedSeconds
    : [];
  const runtimeCapacity = $("[data-runtime-capacity]");
  const runtimeMetadata = $(".site-runtime");
  const capacityLabel = `${concurrentInferences} RUN${queueCapacity > 0 ? ` + ${queueCapacity} WAIT` : ""}`;
  const releaseStamp = formatReleaseStamp(release.releasedAt, {
    timeZone: release.timeZone,
    label: release.stage === "candidate" ? "candidate build" : "released"
  });

  document.title = `${profile.nameKo} · ${profile.role} · ${version}`;
  setText("[data-site-version]", version);
  $$("[data-site-released-at]").forEach((element) => {
    element.hidden = !releaseStamp;
    if (!releaseStamp) return;
    element.textContent = releaseStamp;
    element.setAttribute("datetime", release.releasedAt);
  });
  setText("[data-runtime-active]", capacityLabel);
  setText("[data-runtime-latency]", `≈${expectedMin}–${expectedMax} SEC`);
  if (runtimeCapacity) {
    const queueSummary = queueCapacity > 0 ? `, 대기 ${queueCapacity}건` : "";
    const runtimeSummary = `동시 추론 ${concurrentInferences}건${queueSummary}, 예상 답변 완료 시간 약 ${expectedMin}초에서 ${expectedMax}초`;
    runtimeCapacity.setAttribute("aria-label", runtimeSummary);
    runtimeCapacity.title = `현재 공개 데모 측정값 · ${capacityLabel} · 예상 답변 약 ${expectedMin}–${expectedMax}초`;
  }
  if (runtimeMetadata) {
    const releaseSummary = releaseStamp ? `, ${releaseStamp}` : "";
    runtimeMetadata.setAttribute(
      "aria-label",
      `포트폴리오 ${version}${releaseSummary}, ${capacityLabel}, 예상 답변 약 ${expectedMin}–${expectedMax}초`
    );
  }
  setText("[data-profile-initials]", profile.initials);
  setText("[data-profile-name]", profile.nameKo);
  setText("[data-profile-role]", profile.role);
  setText("[data-profile-status]", profile.status);
  setText("[data-profile-eyebrow]", profile.eyebrow);
  setText("[data-profile-summary]", profile.summary);
  setText("[data-approach-copy]", approachCopy);

  const headline = $("[data-profile-headline]");
  headline.replaceChildren();
  profile.headline.forEach((line, index) => {
    if (index > 0) headline.append(document.createElement("br"));
    headline.append(document.createTextNode(line));
  });

  const statsRoot = $("[data-profile-stats]");
  statsRoot.replaceChildren();
  stats.forEach((stat) => {
    const item = createElement("div", "hero-stat");
    item.append(createElement("strong", "hero-stat__value", stat.value));
    item.append(createElement("span", "hero-stat__label", stat.label));
    statsRoot.append(item);
  });

  const principlesRoot = $("[data-principles-root]");
  if (principlesRoot) {
    principlesRoot.replaceChildren();
    principles.forEach((principle) => {
      const article = createElement("article", "principle reveal-on-scroll");
      const index = createElement("span", "principle__index", principle.index);
      const copy = createElement("div", "principle__copy");
      copy.append(createElement("h3", "", principle.title));
      copy.append(createElement("p", "", principle.body));
      const meta = createElement("span", "principle__meta", principle.meta);
      article.append(index, copy, meta);
      principlesRoot.append(article);
    });
  }

  const linksRoot = $("[data-profile-links]");
  const profileLinks = profile.links ?? [];
  linksRoot.replaceChildren();
  linksRoot.hidden = profileLinks.length === 0;
  profileLinks.forEach((link) => {
    const anchor = createElement("a", "", `${link.label} ↗`);
    anchor.href = link.href;
    if (/^https?:\/\//.test(link.href)) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    linksRoot.append(anchor);
  });
}

function renderProjects(projects) {
  const root = $("[data-projects-root]");
  root.replaceChildren();
  root.className = "project-card-grid";

  projects.forEach((project) => {
    const article = createElement("article", "project-card reveal-on-scroll");
    article.dataset.projectId = project.id;
    article.tabIndex = 0;

    const header = createElement("header", "project-card__header");
    header.append(
      createElement("span", "project-card__number", project.number),
      createElement("span", "project-label", project.label)
    );
    article.append(header, createElement("h3", "", project.title));

    const problem = createElement("section", "project-card__fact");
    problem.append(
      createElement("span", "", "PROBLEM"),
      createElement("p", "", project.description)
    );

    const scope = createElement("section", "project-card__fact");
    scope.append(createElement("span", "", "MY SCOPE"));
    const scopeList = document.createElement("ul");
    project.scope.slice(0, 3).forEach((item) => {
      scopeList.append(createElement("li", "", item));
    });
    scope.append(scopeList);

    const outcome = createElement("section", "project-card__fact project-card__fact--outcome");
    outcome.append(
      createElement("span", "", "OUTCOME"),
      createElement("p", "", project.result)
    );

    const link = createElement("a", "project-card__link", "사례 자세히 보기 ↗");
    link.href = projectDetailRoute(project.id, "overview");
    article.append(
      createElement("p", "project-card__subtitle", project.subtitle),
      problem,
      scope,
      outcome,
      link
    );
    root.append(article);
  });
}

function initializeContextualAgentCta(projects) {
  const promptsRoot = $("[data-context-agent-prompts]");
  const label = $("[data-context-project-label]");
  const title = $("[data-context-agent-title]");
  const copy = $("[data-context-agent-copy]");
  if (!promptsRoot || projects.length === 0) return;

  const projectById = new Map(projects.map((project) => [project.id, project]));
  let activeProjectId = projects[0].id;

  function render(projectId) {
    const project = projectById.get(projectId) ?? projects[0];
    activeProjectId = project.id;
    label.textContent = project.title.toUpperCase();
    title.textContent = "궁금해진 설계 판단이 있나요?";
    title.style.whiteSpace = "pre-line";
    copy.textContent = "방금 살펴본 구현 경계와 근거를 끊김 없이 이어서 질문할 수 있습니다.";
    promptsRoot.replaceChildren();
    (project.agentPrompts ?? []).slice(0, 3).forEach((question, index) => {
      const button = createElement("button", "context-agent-prompt");
      button.type = "button";
      button.append(
        createElement("span", "", `QUESTION ${String(index + 1).padStart(2, "0")}`),
        createElement("strong", "", question),
        createElement("i", "", "↗")
      );
      button.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("portfolio:open-agent", {
          detail: { question, submit: true, projectId: project.id }
        }));
      });
      promptsRoot.append(button);
    });
  }

  const cards = $$("[data-project-id]", $("[data-projects-root]"));
  cards.forEach((card) => {
    const activate = () => {
      if (card.dataset.projectId !== activeProjectId) render(card.dataset.projectId);
    };
    card.addEventListener("focusin", activate);
    card.addEventListener("pointerdown", activate, { passive: true });
  });

  if ("IntersectionObserver" in window) {
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
        else visible.delete(entry.target);
      });
      const next = [...visible.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0];
      if (next?.dataset.projectId && next.dataset.projectId !== activeProjectId) {
        render(next.dataset.projectId);
      }
    }, { threshold: [0.25, 0.5, 0.75], rootMargin: "-15% 0px -25%" });
    cards.forEach((card) => observer.observe(card));
  }

  render(activeProjectId);
}

function initializeReveals() {
  const targets = $$(".reveal-on-scroll");

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8%" }
  );

  targets.forEach((target) => observer.observe(target));
}

function initializeHeader() {
  const header = $("[data-site-header]");
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function initializeAgent({
  agentService,
  projects,
  questions,
  onOpenSource,
  getPageContext,
  diagramAttachments
}) {
  const workspace = $("[data-agent-workspace]");
  const transcript = $("[data-agent-transcript]");
  const suggestionsRoot = $("[data-agent-suggestions]");
  const suggestionsShell = $("[data-agent-suggestions-shell]");
  const form = $("[data-agent-form]");
  const input = $("[data-agent-input]");
  const submit = $("[data-agent-submit]");
  const messageTemplate = $("#message-template");
  const providerBadge = $("[data-provider-badge]");
  const providerNotice = $("[data-agent-notice]");
  const providerSectionCopy = $("[data-agent-section-copy]");
  const providerStatus = $("[data-provider-status]");
  const evidenceRoot = $("[data-agent-evidence]");
  const traceRoot = $("[data-agent-trace]");
  const traceEventCount = $("[data-trace-event-count]");
  const evidenceCount = $("[data-evidence-count]");
  const inspectorTabs = $$("[data-agent-tab]");
  const inspectorPanels = $$("[data-agent-panel]");
  const agentStage = $("[data-agent-stage]");
  const liveStatus = $("[data-agent-live-status]");
  const peekButton = $("[data-peek-agent]");
  const peekRole = $("[data-agent-peek-role]");
  const peekStatus = $("[data-agent-peek-status]");
  const peekMessage = $("[data-agent-peek-message]");
  const contextLabel = $("[data-agent-context]");
  const followUpCache = createFollowUpCache({ storage: window.sessionStorage, maxEntries: 24 });
  const conversationStore = createConversationSessionStore({ storage: window.sessionStorage });
  const browserSessionIdentity = agentService.browserSessionIdentity;
  const restoredConversation = conversationStore.load(browserSessionIdentity);
  let conversationTurns = restoredConversation?.turns.map((turn) => ({ ...turn, sources: [...turn.sources] })) ?? [];
  let pendingClarification = restoredConversation?.pendingClarification ?? null;
  if (restoredConversation) agentService.restoreBrowserSession(restoredConversation);
  let isResponding = false;
  let conversationVersion = 0;
  let activeController = null;
  let activeSourceId = null;
  let lastOpener = null;
  let traceEvents = 0;
  let finalTrace = null;
  let activeTraceId = null;
  let activeInlineTrace = null;
  let traceClockTimer = null;
  let traceRenderFrame = 0;
  let traceStartedAt = 0;
  let streamedAnswerCharacters = 0;
  let streamedAnswerPreview = "";
  let liveTraceView = null;
  let activeGenerationArticle = null;
  let continuationStartedAt = 0;
  let continuationTimer = 0;
  const traceNodes = new Map();
  const presentedTraceNodes = new Set();
  let tracePresentationVersion = 0;
  let tracePresentationChain = Promise.resolve();
  const navigationTimers = new Set();
  let peekPreviewState = Object.freeze({
    role: "AI READY",
    status: "PUBLIC KNOWLEDGE",
    message: "포트폴리오의 프로젝트와 설계 판단을 질문해보세요."
  });
  const traceDefinitions = [
    ["context", "01", "Context", "최근 대화와 현재 페이지 힌트를 검색 문맥으로 정리합니다."],
    ["query-understanding", "02", "Query understanding", "질문 유형, 지칭 대상과 공개 범위를 판별합니다."],
    ["preset", "03", "Preset", "O/X 조건으로 실행할 workflow와 필요한 근거 슬롯을 확정합니다."],
    ["evidence", "04", "Evidence", "프로젝트 공개 근거를 우선 검색하고 중복 claim을 축약합니다."],
    ["judgment", "05", "Judgment", "필요할 때만 승인 Gold 판단 렌즈 한 개를 비인용 조건으로 적용합니다."],
    ["source-admission", "06", "Source admission", "모델 호출 전에 공개 source allowlist와 Gold 비인용 경계를 확정합니다."],
    ["response-ready", "07", "Response ready", "첫 응답 토큰을 준비하고 Trace 완료 뒤 실제 스트리밍을 시작합니다."]
  ];
  const legacyTraceNodeAliases = Object.freeze({
    memory: "context",
    classify: "query-understanding",
    retrieve: "evidence",
    connect: "judgment",
    generate: "response-ready",
    ground: "source-admission",
    synthesis: "response-ready",
    "source-check": "source-admission"
  });
  const tracePresentationDuration = Object.freeze({
    context: 900,
    "query-understanding": 1100,
    preset: 700,
    evidence: 1400,
    judgment: 1000,
    "source-admission": 900,
    "response-ready": 1400
  });

  providerBadge.textContent = agentService.providerLabel;
  providerNotice.textContent = agentService.providerNotice;
  if (providerSectionCopy) providerSectionCopy.textContent = agentService.providerSectionCopy;
  document.body.dataset.interviewState = "peek";

  function currentContext() {
    return getPageContext?.() ?? null;
  }

  function updateContextLabel() {
    const context = currentContext();
    if (!contextLabel) return;
    contextLabel.textContent = context?.routeType === "project-detail"
      ? context.title
      : "전체 포트폴리오";
  }

  function updatePeekPreview(update) {
    peekPreviewState = Object.freeze({ ...peekPreviewState, ...update });
    peekRole.textContent = peekPreviewState.role;
    peekStatus.textContent = peekPreviewState.status;
    peekMessage.textContent = peekPreviewState.message;
  }

  $$('[data-open-agent]').forEach((button) => {
    button.setAttribute("aria-controls", workspace.id);
    button.setAttribute("aria-expanded", "false");
  });

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function setProviderState({ label, status, notice, provider }) {
    providerBadge.textContent = label;
    providerBadge.dataset.provider = provider;
    if (providerStatus) providerStatus.textContent = status;
    if (notice) providerNotice.textContent = notice;
  }

  async function refreshProviderHealth() {
    if (!agentService.healthEndpoint) {
      setProviderState({
        label: "LOCAL AI · ON DEMAND",
        status: "LOCAL AGENT · READY ON DEMAND",
        notice: "질문을 보낼 때만 로컬 AI 서버에 연결합니다. 일반 포트폴리오 탐색은 GitHub Pages 안에서 동작합니다.",
        provider: "ollama"
      });
      return;
    }

    setProviderState({
      label: "CHECKING",
      status: "LOCAL AGENT · CHECKING",
      provider: "checking"
    });

    try {
      const response = await fetch(agentService.healthEndpoint, {
        signal: AbortSignal.timeout?.(3500)
      });
      if (!response.ok) throw new Error(`health ${response.status}`);
      const health = await response.json();
      const model = health.ollama?.model ?? "OLLAMA";
      agentService.updateRuntimeIdentity({
        model,
        queryIndexDigest: health.agentContracts?.v2QueryIndexDigest,
        goldCorpusDigest: health.agentContracts?.goldCorpusDigest,
        presetDigest: health.agentContracts?.v2PresetDigest
      });

      if (health.status === "ready") {
        try {
          window.sessionStorage.setItem("portfolio-followup-model", model);
        } catch {
          // Cache identity remains usable with the configured provider name.
        }
        setProviderState({
          label: `LOCAL AI · ${model}`,
          status: "LOCAL AGENT · READY",
          notice: "로컬 AI가 공개 포트폴리오 근거 안에서 답변합니다. 응답 경로와 근거는 오른쪽에서 확인할 수 있습니다.",
          provider: "ollama"
        });
        return;
      }

      throw new Error("model offline");
    } catch {
      setProviderState({
        label: "SAFE FALLBACK",
        status: "LOCAL MODEL OFF · FALLBACK READY",
        notice: "Ollama가 연결되지 않아 검증된 포트폴리오 답변 엔진을 사용합니다. UI와 근거 탐색은 그대로 체험할 수 있습니다.",
        provider: "fallback"
      });
    }
  }

  function setStage(stage, announcement) {
    agentStage.textContent = stage;
    if (announcement) liveStatus.textContent = announcement;
  }

  function activateInspectorTab(name, { focus = false } = {}) {
    inspectorTabs.forEach((tab) => {
      const active = tab.dataset.agentTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    inspectorPanels.forEach((panel) => {
      panel.hidden = panel.dataset.agentPanel !== name;
    });
  }

  function traceStatusLabel(status) {
    return {
      pending: "WAITING",
      running: "RUNNING",
      complete: "COMPLETE",
      skipped: "SKIPPED",
      unavailable: "UNAVAILABLE",
      fallback: "FALLBACK",
      cancelled: "CANCELLED",
      error: "ERROR"
    }[status] ?? String(status).toUpperCase();
  }

  function traceDefinition(nodeId) {
    return traceDefinitions.find(([id]) => id === normalizeTraceNodeId(nodeId));
  }

  function normalizeTraceNodeId(nodeId) {
    return legacyTraceNodeAliases[nodeId] ?? nodeId;
  }

  function traceActivity(nodeId, state) {
    const output = state.output ?? {};
    if (nodeId === "context") {
      return output.recentExchangeCount !== undefined
        ? `최근 ${output.recentExchangeCount}턴과 회상 detail ${output.recalledEpisodeCount ?? 0}건을 정렬하고 페이지 힌트를 결합했습니다.`
        : "최근 대화 → 장기 기억 후보 → 현재 프로젝트 힌트 순으로 검색 문맥을 구성하고 있습니다.";
    }
    if (nodeId === "query-understanding") {
      if (output.scopeAuthority) {
        return `scope 후보 ${output.scopeAuthority.scope}와 대조 ${output.scopeAuthority.contrastScope ?? "없음"}을 비교해 ${output.scopeAuthority.confidence} 신뢰도로 판정했습니다.`;
      }
      return output.plans
        ? `${output.plans.length}개 anchor를 비교하고 scope·강한 anchor·충돌·필수 슬롯을 O/X로 판정했습니다.`
        : output.intent
          ? `의도 ${output.intent} · 범위 ${output.queryScope?.kind ?? output.queryScope ?? "global"}로 분류했습니다.`
          : "질문의 목적, 명시 프로젝트, 현재 페이지 지시어와 답변 상세도 신호를 분류하고 있습니다.";
    }
    if (nodeId === "preset") {
      return output.preset
        ? `${output.preset} workflow와 필요한 공개 근거·Gold 슬롯을 확정했습니다.`
        : "O/X 판정 결과로 가장 작은 workflow preset을 선택하고 있습니다.";
    }
    if (nodeId === "evidence") {
      const seedCount = output.publicEvidenceCount ?? output.seeds?.length;
      const titles = Array.isArray(output.sourceTitles) ? output.sourceTitles.slice(0, 2).join(" · ") : "";
      return Number.isFinite(seedCount)
        ? `어휘·dense 후보를 결합하고 중복을 축약해 ${seedCount}개의 공개 근거를 선택했습니다.${titles ? ` ${titles}` : ""}`
        : "어휘 seed 검색 → BGE-M3 후보 검색 → RRF 결합 → 상위 공개 근거 선택을 수행하고 있습니다.";
    }
    if (nodeId === "judgment") {
      return output.gold?.used
        ? "승인된 판단 렌즈 한 개를 이유·조건·반례 보강에만 적용했고 citation에서는 제외했습니다."
        : state.status === "skipped"
          ? "이 질문은 프로젝트 공개 사실만으로 답하므로 Gold 판단 렌즈를 사용하지 않습니다."
          : "질문에 필요한 판단 이유·적용 조건을 보강할 승인 Gold passage를 확인하고 있습니다.";
    }
    if (nodeId === "response-ready") {
      if (state.status === "complete") {
        return output.generationMode === "prepared-cache"
          ? "검토된 준비 답변을 공개 근거와 다시 결속해 반환했습니다. 모델 추론은 실행하지 않았습니다."
          : output.streamComplete
            ? `${output.outputTokens ?? "—"} tokens의 실제 스트리밍을 완료하고 생성 지표를 기록했습니다.`
            : "첫 응답 토큰을 준비했습니다. Trace를 완료하고 본문 스트리밍을 시작합니다.";
      }
      if (streamedAnswerCharacters > 0) {
        return `첫 토큰을 수신했습니다. Trace 완료 직후 근거 범위 안에서 답변 스트리밍을 시작합니다.`;
      }
      return "선택 근거와 답변 계획을 bounded prompt로 구성했습니다. 로컬 AI의 첫 응답 토큰을 기다리고 있습니다.";
    }
    if (nodeId === "source-admission") {
      const sourceCount = output.sourceIds?.length;
      return Number.isFinite(sourceCount)
        ? `${sourceCount}개의 공개 source ID를 allowlist로 허용하고 Gold citation을 차단했습니다.`
        : "모델 호출 전에 source ID를 공개 allowlist와 대조하고 Gold 비인용 경계를 확인하고 있습니다.";
    }
    return state.detail ?? "현재 작업을 수행하고 있습니다.";
  }

  function updateAnswerPreview(answer) {
    streamedAnswerPreview = String(answer ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
    scheduleTraceRender();
  }

  function traceProgressState() {
    const completed = traceDefinitions.filter(([id]) => ["complete", "fallback", "skipped", "unavailable"].includes(traceNodes.get(id)?.status)).length;
    const runningIndex = traceDefinitions.findIndex(([id]) => traceNodes.get(id)?.status === "running");
    const currentIndex = runningIndex >= 0 ? runningIndex : Math.min(completed, traceDefinitions.length - 1);
    const pipelineComplete = completed === traceDefinitions.length && runningIndex < 0;
    const progress = finalTrace || pipelineComplete
      ? 100
      : Math.min(96, ((completed + (runningIndex >= 0 ? 0.42 : 0.08)) / traceDefinitions.length) * 100);
    return { completed, currentIndex, progress };
  }

  function appendWorkingVisual(root, nodeId, status) {
    const visual = createElement("span", `trace-working-mark${nodeId === "response-ready" ? " trace-working-mark--generate" : ""}`);
    visual.setAttribute("aria-hidden", "true");
    visual.dataset.status = status;
    visual.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    root.append(visual);
  }

  function renderPendingResponse(bodyElement, label = "에이전트가 응답을 생성하고 있습니다.") {
    const shell = createElement("span", "response-generating");
    const visual = createElement("span", "response-generating__visual");
    visual.setAttribute("aria-hidden", "true");
    visual.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    shell.append(visual, createElement("span", "response-generating__label", label));
    bodyElement.replaceChildren(shell);
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function scheduleTraceRender() {
    if (traceRenderFrame) return;
    traceRenderFrame = requestAnimationFrame(() => {
      traceRenderFrame = 0;
      renderLiveTrace();
      renderInlineTrace();
    });
  }

  function startTraceClock() {
    traceStartedAt = Date.now();
    if (traceClockTimer) window.clearInterval(traceClockTimer);
    traceClockTimer = window.setInterval(scheduleTraceRender, 500);
  }

  function stopTraceClock() {
    if (traceClockTimer) window.clearInterval(traceClockTimer);
    traceClockTimer = null;
    if (traceRenderFrame) cancelAnimationFrame(traceRenderFrame);
    traceRenderFrame = 0;
  }

  function traceStageFacts(nodeId, state) {
    const output = state.output ?? {};
    if (nodeId === "context") {
      return [
        ["RECENT", `${output.recentExchangeCount ?? 0} turns`],
        ["RECALLED", `${output.recalledEpisodeCount ?? 0} details`],
        ["CONTEXT", output.pageContext?.title ?? "none"]
      ];
    }
    if (nodeId === "query-understanding") {
      return [
        ["SCOPE", output.scopeAuthority?.scope ?? output.semantic?.scope ?? "pending"],
        ["CONTRAST", output.scopeAuthority?.contrastScope ?? "—"],
        ["ANCHORS", String(output.plans?.length ?? 0)],
        ["EMBEDDING", `${output.queryEmbeddingCalls ?? 0} call`],
        ["CONTRACT", finalTrace?.agentContract ?? "v2 preset"]
      ];
    }
    if (nodeId === "preset") return [
      ["WORKFLOW", output.preset ?? finalTrace?.preset ?? "pending"],
      ["GOLD", output.checks?.allowsGold ? "allowed" : "not needed"]
    ];
    if (nodeId === "evidence") {
      return [
        ["MODE", output.retrieval?.effectiveMode ?? output.retrieval?.requestedMode ?? "lexical + graph"],
        ["CONFIDENCE", output.confidence ?? "—"],
        ["PUBLIC", String(output.publicEvidenceCount ?? output.seeds?.length ?? 0)],
        ["LATENCY", Number.isFinite(output.durationMs) ? `${output.durationMs} ms` : "—"]
      ];
    }
    if (nodeId === "judgment") return [
      ["GOLD LENS", output.gold?.used ? "1 passage" : "0"],
      ["CITATION", "none"]
    ];
    if (nodeId === "response-ready") {
      return [
        ["MODE", output.generationMode ?? finalTrace?.generationMode ?? "model"],
        ["STYLE", output.answerStyle ?? finalTrace?.answerStyle ?? "balanced"],
        ["CEILING", Number.isFinite(output.tokenCeiling ?? finalTrace?.tokenCeiling) ? `${output.tokenCeiling ?? finalTrace.tokenCeiling} tok` : "—"],
        ["TTFT", Number.isFinite(output.timeToFirstTokenMs) ? `${output.timeToFirstTokenMs} ms` : "—"],
        ["OUTPUT", Number.isFinite(output.outputTokens) ? `${output.outputTokens} tok` : "—"],
        ["SPEED", Number.isFinite(output.tokensPerSecond) ? `${output.tokensPerSecond} tok/s` : "—"]
      ];
    }
    if (nodeId === "source-admission") return [
      ["PUBLIC SOURCES", String(output.sourceIds?.length ?? 0)],
      ["GOLD CITATIONS", String(output.goldCitationCount ?? 0)],
      ["REJECTED", String(output.rejectedSourceCount ?? 0)]
    ];
    return [];
  }

  function ensureInlineTraceView() {
    if (!activeInlineTrace || activeInlineTrace.view) return activeInlineTrace?.view;
    const list = createElement("ol", "message-live-trace__steps");
    const item = createElement("li");
    const progress = createElement("div", "message-live-trace__progress");
    const progressBar = document.createElement("i");
    progress.append(progressBar);
    const heading = createElement("div", "message-live-trace__current");
    const visual = createElement("span", "trace-working-mark");
    visual.setAttribute("aria-hidden", "true");
    visual.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    const index = createElement("span", "message-live-trace__index", "—");
    const label = createElement("strong", "", "실행 경로 준비 중");
    const timing = createElement("em", "", "WAITING");
    const activity = createElement("p");
    const answerPreview = createElement("p", "message-live-trace__answer-preview");
    answerPreview.hidden = true;
    heading.append(visual, index, label, timing);
    item.append(progress, heading, activity, answerPreview);
    list.append(item);
    activeInlineTrace.content.append(list);
    activeInlineTrace.view = { item, progressBar, visual, index, label, timing, activity, answerPreview };
    return activeInlineTrace.view;
  }

  function renderInlineTrace() {
    if (!activeInlineTrace?.details?.isConnected) return;
    const { details, status, count } = activeInlineTrace;
    if (finalTrace) {
      details.hidden = true;
      return;
    }
    const view = ensureInlineTraceView();
    const entries = [...traceNodes.entries()];
    const current = entries.find(([, state]) => state.status === "running") ?? entries.at(-1);
    details.hidden = false;
    if (!current) {
      count.textContent = "준비";
      status.textContent = "실행 경로 준비 중";
      view.item.dataset.status = "pending";
      view.timing.textContent = "WAITING";
      return;
    }
    const [id, state] = current;
    const definition = traceDefinition(id) ?? [id, "—", id, "실행 중입니다."];
    const progressState = traceProgressState();
    count.textContent = `${progressState.currentIndex + 1} / ${traceDefinitions.length}`;
    status.textContent = ["error", "cancelled", "unavailable"].includes(state.status)
      ? `실행 ${traceStatusLabel(state.status).toLocaleLowerCase()}`
      : `${definition[2]} ${state.status === "running" ? "실행 중" : "완료"}`;
    view.item.dataset.status = state.status;
    view.item.dataset.traceNode = id;
    view.progressBar.style.setProperty("--trace-progress-scale", String(progressState.progress / 100));
    view.visual.dataset.status = state.status;
    view.visual.classList.toggle("trace-working-mark--generate", id === "response-ready");
    view.index.textContent = definition[1];
    view.label.textContent = definition[2];
    view.timing.textContent = state.status === "running" && traceStartedAt
      ? `${Math.max(0, Math.round((Date.now() - traceStartedAt) / 1000))}s`
      : Number.isFinite(state.elapsedMs) ? `${state.elapsedMs} ms` : traceStatusLabel(state.status);
    view.activity.textContent = traceActivity(id, state);
    view.answerPreview.hidden = !streamedAnswerPreview;
    view.answerPreview.textContent = streamedAnswerPreview ? `생성 중인 답변 · ${streamedAnswerPreview}` : "";
  }

  function settleInlineTrace() {
    renderInlineTrace();
  }

  function applyTraceEvent(payload) {
    const nodeId = normalizeTraceNodeId(payload.node);
    if (nodeId === "evidence" && payload.node === "retrieve" && !traceNodes.has("preset")) {
      traceNodes.set("preset", { status: "skipped", detail: "legacy v1 경로에는 별도 preset 단계가 없습니다." });
    }
    const previous = traceNodes.get(nodeId);
    const startedAtMs = payload.status === "running"
      ? payload.atMs ?? previous?.startedAtMs
      : previous?.startedAtMs;
    const elapsedMs = payload.output?.durationMs ?? (
      ["complete", "fallback", "unavailable"].includes(payload.status) && Number.isFinite(payload.atMs) && Number.isFinite(startedAtMs)
        ? Math.max(0, payload.atMs - startedAtMs)
        : undefined
    );
    traceNodes.set(nodeId, {
      status: payload.status ?? "running",
      detail: payload.detail,
      output: payload.output,
      startedAtMs,
      elapsedMs
    });
    scheduleTraceRender();
    if (payload.status === "running") setStage(nodeId.toUpperCase(), payload.detail);
  }

  function queueTraceEvent(payload) {
    const version = tracePresentationVersion;
    const nodeId = normalizeTraceNodeId(payload.node);
    const definition = traceDefinition(nodeId);
    const isTerminal = ["complete", "fallback", "skipped", "unavailable"].includes(payload.status);
    const needsRunningPrelude = isTerminal && !presentedTraceNodes.has(nodeId);
    presentedTraceNodes.add(nodeId);
    tracePresentationChain = tracePresentationChain.then(async () => {
      if (version !== tracePresentationVersion) return;
      if (needsRunningPrelude) {
        applyTraceEvent({
          ...payload,
          status: "running",
          detail: definition?.[3] ?? payload.detail,
          output: undefined
        });
        await waitForTracePresentation(tracePresentationDelay(payload, nodeId), version);
        if (version !== tracePresentationVersion) return;
      }
      applyTraceEvent(payload);
      if (payload.status === "running") {
        await waitForTracePresentation(tracePresentationDelay(payload, nodeId), version);
      }
    });
  }

  function cancelTraceTransitions() {
    tracePresentationVersion += 1;
    tracePresentationChain = Promise.resolve();
    presentedTraceNodes.clear();
  }

  async function finishTraceTransitions() {
    const deadline = Date.now() + 12_000;
    while (true) {
      const pending = tracePresentationChain;
      await pending;
      await Promise.resolve();
      const allTerminal = traceDefinitions.every(([id]) =>
        ["complete", "fallback", "skipped", "unavailable"].includes(traceNodes.get(id)?.status)
      );
      if (allTerminal && pending === tracePresentationChain) return;
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
  }

  function tracePresentationDelay(payload, nodeId) {
    const stageDuration = tracePresentationDuration[nodeId] ?? 1000;
    const requestedDelay = payload.output?.presentationDelayMs;
    return Number.isFinite(requestedDelay)
      ? Math.max(stageDuration, Math.min(3000, requestedDelay))
      : stageDuration;
  }

  function waitForTracePresentation(duration, version) {
    if (prefersReducedMotion() || duration <= 0 || version !== tracePresentationVersion) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.setTimeout(resolve, duration);
    });
  }

  function createFactSlots(count = 6) {
    const grid = createElement("dl", "trace-node__facts");
    const slots = Array.from({ length: count }, () => {
      const item = document.createElement("div");
      const label = document.createElement("dt");
      const value = document.createElement("dd");
      item.hidden = true;
      item.append(label, value);
      grid.append(item);
      return { item, label, value };
    });
    return { grid, slots };
  }

  function ensureLiveTraceView() {
    if (liveTraceView) return liveTraceView;
    const summary = createElement("header", "live-trace__summary");
    const signal = createElement("span", "live-trace__signal");
    signal.append(createElement("i"));
    const signalText = document.createTextNode(" TRACE READY");
    signal.append(signalText);
    const eventTotal = createElement("span", "live-trace__event-total", "0 EVENTS");
    summary.append(signal, eventTotal);

    const progress = createElement("section", "live-trace__progress");
    const progressHeader = createElement("div", "live-trace__progress-header");
    const progressTitle = createElement("strong", "", `파이프라인 1 / ${traceDefinitions.length}`);
    const progressPercent = createElement("span", "", "0%");
    progressHeader.append(progressTitle, progressPercent);
    const progressTrack = createElement("div", "live-trace__progress-track");
    const progressFill = document.createElement("i");
    progressTrack.append(progressFill);
    const now = createElement("section", "trace-now");
    now.hidden = true;
    const nowVisual = createElement("span", "trace-working-mark");
    nowVisual.setAttribute("aria-hidden", "true");
    nowVisual.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    const nowCopy = createElement("div", "trace-now__copy");
    const nowIndex = createElement("span", "mono", "NOW · 01");
    const nowLabel = createElement("strong", "", "Context");
    const nowActivity = createElement("p");
    nowCopy.append(nowIndex, nowLabel, nowActivity);
    now.append(nowVisual, nowCopy);
    const answerPreview = createElement("section", "live-trace__answer-preview");
    const answerPreviewLabel = createElement("span", "mono", "생성 중인 답변");
    const answerPreviewText = createElement("p");
    answerPreview.hidden = true;
    answerPreview.append(answerPreviewLabel, answerPreviewText);
    progress.append(progressHeader, progressTrack, now, answerPreview);

    const list = createElement("div", "live-trace__nodes");
    const nodes = new Map();
    traceDefinitions.forEach(([id, index, label, caption]) => {
      const node = createElement("article", "trace-node");
      node.dataset.status = "pending";
      node.dataset.traceNode = id;
      const rail = createElement("div", "trace-node__rail");
      rail.append(createElement("span", "trace-node__index", index), createElement("i"));
      const content = createElement("div", "trace-node__content");
      const header = document.createElement("header");
      const statusGroup = createElement("div", "trace-node__status-group");
      const duration = createElement("span", "trace-node__duration");
      duration.hidden = true;
      const status = createElement("span", "trace-node__status", "WAITING");
      statusGroup.append(duration, status);
      header.append(createElement("strong", "", label), statusGroup);
      const detail = createElement("p", "", caption);
      const activity = createElement("p", "trace-node__activity");
      activity.hidden = true;
      const facts = createFactSlots();
      facts.grid.hidden = true;
      content.append(header, detail, activity, facts.grid);
      node.append(rail, content);
      list.append(node);
      nodes.set(id, { node, duration, status, detail, activity, facts });
    });

    const metrics = createElement("section", "live-trace__metrics");
    metrics.hidden = true;
    const metricsTitle = createElement("strong", "live-trace__metrics-title", "Inference metrics");
    const metricsGrid = createElement("div", "trace-metrics");
    const metricSlots = Array.from({ length: 9 }, () => {
      const metric = createElement("div", "trace-metric");
      const label = createElement("span");
      const value = createElement("strong");
      metric.append(label, value);
      metricsGrid.append(metric);
      return { label, value };
    });
    metrics.append(metricsTitle, metricsGrid);
    traceRoot.append(summary, progress, list, metrics);
    liveTraceView = {
      signalText,
      eventTotal,
      progressTitle,
      progressPercent,
      progressFill,
      now,
      nowVisual,
      nowIndex,
      nowLabel,
      nowActivity,
      answerPreview,
      answerPreviewText,
      nodes,
      metrics,
      metricsTitle,
      metricSlots
    };
    return liveTraceView;
  }

  function updateFactSlots(refs, facts, visible) {
    refs.grid.hidden = !visible || facts.length === 0;
    refs.slots.forEach((slot, index) => {
      const fact = facts[index];
      slot.item.hidden = !fact;
      if (!fact) return;
      slot.label.textContent = fact[0];
      slot.value.textContent = fact[1];
    });
  }

  function renderLiveTrace() {
    const view = ensureLiveTraceView();
    const progressState = traceProgressState();
    const wasCancelled = [...traceNodes.values()].some((state) => state.status === "cancelled");
    view.signalText.nodeValue = finalTrace
      ? " TRACE COMPLETE"
      : wasCancelled
        ? " TRACE CANCELLED"
        : isResponding ? " STREAM CONNECTED" : " TRACE READY";
    view.eventTotal.textContent = `${activeTraceId ? `TRACE ${activeTraceId.slice(0, 8)} · ` : ""}${traceEvents} EVENTS`;
    view.progressTitle.textContent = finalTrace
      ? "응답 경로 완료"
      : `파이프라인 ${progressState.currentIndex + 1} / ${traceDefinitions.length}`;
    view.progressPercent.textContent = `${Math.round(progressState.progress)}%`;
    view.progressFill.style.setProperty("--trace-progress-scale", String(progressState.progress / 100));
    view.answerPreview.hidden = !streamedAnswerPreview;
    view.answerPreviewText.textContent = streamedAnswerPreview;

    const runningEntry = [...traceNodes.entries()].find(([, state]) => state.status === "running");
    view.now.hidden = !runningEntry;
    if (runningEntry) {
      const [nodeId, state] = runningEntry;
      const definition = traceDefinition(nodeId) ?? [nodeId, "—", nodeId, state.detail];
      view.now.dataset.traceNode = nodeId;
      view.now.dataset.status = state.status;
      view.nowVisual.dataset.status = state.status;
      view.nowVisual.classList.toggle("trace-working-mark--generate", nodeId === "response-ready");
      view.nowIndex.textContent = `NOW · ${definition[1]}`;
      view.nowLabel.textContent = definition[2];
      view.nowActivity.textContent = traceActivity(nodeId, state);
    }

    traceDefinitions.forEach(([id, , , caption]) => {
      const refs = view.nodes.get(id);
      const state = traceNodes.get(id) ?? { status: "pending", detail: caption };
      refs.node.dataset.status = state.status;
      refs.status.textContent = traceStatusLabel(state.status);
      refs.duration.hidden = !Number.isFinite(state.elapsedMs);
      refs.duration.textContent = Number.isFinite(state.elapsedMs) ? `${state.elapsedMs} ms` : "";
      refs.detail.textContent = state.detail ?? caption;
      refs.activity.hidden = state.status !== "running";
      refs.activity.textContent = state.status === "running" ? traceActivity(id, state) : "";
      updateFactSlots(refs.facts, traceStageFacts(id, state).filter(([, value]) => value !== undefined), Boolean(state.output));
    });

    const metrics = finalTrace ? [
      ["Preset", finalTrace.preset ?? finalTrace.generationMode ?? "model"],
      ["TTFT", Number.isFinite(finalTrace.timeToFirstTokenMs) ? formatLatency({ totalMs: finalTrace.timeToFirstTokenMs }) : "—"],
      ["Last token", Number.isFinite(finalTrace.lastTokenMs) ? formatLatency({ totalMs: finalTrace.lastTokenMs }) : "—"],
      ["UI complete", Number.isFinite(finalTrace.uiCompleteMs) ? formatLatency({ totalMs: finalTrace.uiCompleteMs }) : "—"],
      ["Prompt", Number.isFinite(finalTrace.promptTokens) ? `${finalTrace.promptTokens} tok` : "—"],
      ["Output", Number.isFinite(finalTrace.outputTokens) ? `${finalTrace.outputTokens} tok` : "—"],
      ["Style", finalTrace.answerStyle ?? "balanced"],
      ["Model calls", String(finalTrace.modelCalls ?? (finalTrace.provider === "ollama" ? 1 : 0))],
      ["Embedding", `${finalTrace.queryEmbeddingCalls ?? 0} call`]
    ] : [];
    view.metrics.hidden = !finalTrace;
    view.metricsTitle.textContent = finalTrace?.generationMode === "prepared-cache" ? "Prepared response metrics" : "Inference metrics";
    view.metricSlots.forEach((slot, index) => {
      slot.label.textContent = metrics[index]?.[0] ?? "";
      slot.value.textContent = metrics[index]?.[1] ?? "";
    });
  }

  function resetLiveTrace() {
    cancelTraceTransitions();
    traceNodes.clear();
    traceEvents = 0;
    finalTrace = null;
    activeTraceId = null;
    activeInlineTrace = null;
    streamedAnswerCharacters = 0;
    streamedAnswerPreview = "";
    stopTraceClock();
    traceEventCount.textContent = "0";
    renderLiveTrace();
  }

  function handleAgentEvent(event, payload) {
    if (event === "generation-status" && payload?.phase === "continuation") {
      renderGenerationStatus(payload);
      return;
    }
    if (event !== "stage" || !payload?.node) return;
    if (payload.traceId) activeTraceId = payload.traceId;
    traceEvents += 1;
    traceEventCount.textContent = String(traceEvents);
    const definition = traceDefinition(payload.node);
    updatePeekPreview({
      role: "AI",
      status: `${definition?.[2] ?? payload.node} · ${payload.status ?? "running"}`.toUpperCase(),
      message: payload.detail ?? "공개 포트폴리오 근거를 확인하고 있습니다."
    });
    queueTraceEvent(payload);
  }

  function finalizeLiveTrace(trace) {
    finalTrace = trace ?? null;
    if (trace?.traceId) activeTraceId = trace.traceId;
    if (Array.isArray(trace?.stages)) {
      trace.stages.forEach((stage) => {
        traceNodes.set(normalizeTraceNodeId(stage.node), {
          status: stage.status,
          detail: stage.detail,
          output: stage.output
        });
      });
    } else if (trace) {
      traceNodes.set("context", {
        status: "complete",
        detail: trace.memory
          ? `최근 ${trace.memory.recentExchangeCount ?? 0}턴 · 과거 detail ${trace.memory.recalledEpisodeCount ?? 0}건`
          : "이번 요청에는 저장된 대화 맥락이 없습니다."
      });
      traceNodes.set("query-understanding", {
        status: "complete",
        detail: `intent: ${trace.intent ?? "general"}`
      });
      traceNodes.set("preset", {
        status: "skipped",
        detail: "이 응답 경로에는 별도 preset 기록이 없습니다."
      });
      traceNodes.set("evidence", {
        status: "complete",
        detail: `${trace.retrieved?.length ?? 0}개의 후보 근거를 검색했습니다.`
      });
      traceNodes.set("judgment", {
        status: "complete",
        detail: `${trace.retrieved?.filter((match) => match.via).length ?? 0}개의 관계 경로를 연결했습니다.`
      });
      traceNodes.set("source-admission", {
        status: "complete",
        detail: "source ID와 공개 범위 allowlist admission을 완료했습니다."
      });
      traceNodes.set("response-ready", {
        status: trace.provider === "mock" ? "fallback" : "complete",
        detail: trace.note ?? `${trace.provider ?? "provider"} 응답을 생성했습니다.`
      });
    }
    renderLiveTrace();
    renderInlineTrace();
  }

  function markTraceError(message) {
    const running = [...traceNodes.entries()].find(([, state]) => state.status === "running");
    const node = running?.[0] ?? "response-ready";
    traceNodes.set(node, { status: "error", detail: message });
    renderLiveTrace();
    renderInlineTrace();
  }

  function updateOpenControls(expanded) {
    $$('[data-open-agent]').forEach((button) => {
      button.setAttribute("aria-expanded", String(expanded));
    });
  }

  function setWorkspaceMode(mode) {
    workspace.dataset.mode = mode;
    document.body.dataset.interviewState = mode === "peek" ? "peek" : isResponding ? "responding" : activeSourceId ? "result" : "open";
    peekButton.hidden = mode === "peek";
    peekButton.setAttribute("aria-label", "AI 대화 최소화");
    peekButton.textContent = "−";
    workspace.tabIndex = mode === "peek" ? 0 : -1;
    workspace.setAttribute("aria-label", mode === "peek" ? "AI에게 질문하기 열기" : "AI에게 질문하기");
    workspace.setAttribute("role", mode === "peek" ? "button" : "region");
    if (mode === "peek") workspace.setAttribute("aria-expanded", "false");
    else workspace.removeAttribute("aria-expanded");
  }

  function openWorkspace(opener) {
    if (opener) lastOpener = opener;
    workspace.hidden = false;
    updateOpenControls(true);
    setWorkspaceMode("full");
    requestAnimationFrame(updateSuggestionOverflow);
    window.setTimeout(() => {
      updateSuggestionOverflow();
      input.focus({ preventScroll: true });
    }, prefersReducedMotion() ? 0 : 90);
  }

  function togglePeek() {
    if (workspace.dataset.mode === "peek") {
      setWorkspaceMode("full");
      window.setTimeout(() => input.focus({ preventScroll: true }), 80);
      return;
    }

    setWorkspaceMode("peek");
  }

  function clearSourceHighlight() {
    $$(".source-highlight").forEach((element) => element.classList.remove("source-highlight"));
  }

  function openSource(source) {
    if (onOpenSource?.(source.id)) {
      setWorkspaceMode("peek");
      return;
    }
    const target = $(source.href);
    if (!target) return;

    setWorkspaceMode("peek");
    clearSourceHighlight();
    window.history.replaceState(null, "", source.href);
    window.setTimeout(() => {
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center"
      });
      target.classList.add("source-highlight");
      window.setTimeout(() => target.classList.remove("source-highlight"), 2100);
    }, prefersReducedMotion() ? 0 : 180);
  }

  function selectEvidence(sourceId, { scroll = true, activate = true } = {}) {
    activeSourceId = sourceId;
    if (activate) activateInspectorTab("evidence");
    $$(".evidence-card", evidenceRoot).forEach((card) => {
      const active = card.dataset.sourceId === sourceId;
      card.classList.toggle("is-focused", active);
      if (active && scroll) {
        card.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest"
        });
      }
    });
    $$(".message__source", transcript).forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.sourceId === sourceId));
    });
  }

  function renderMessageSources(container, sources) {
    container.replaceChildren();
    container.hidden = sources.length === 0;
    if (!sources.length) return;

    container.append(createElement("span", "message__source-label", "EVIDENCE"));
    sources.forEach((source) => {
      if (!source.id && typeof source.href === "string" && source.href.startsWith("#")) {
        const link = createElement("a", "message__source", `↗ ${source.label}`);
        link.href = source.href;
        container.append(link);
        return;
      }
      const button = createElement("button", "message__source", `↗ ${source.label}`);
      button.type = "button";
      button.dataset.sourceId = source.id;
      button.setAttribute("aria-controls", "evidence-panel");
      button.setAttribute("aria-pressed", String(source.id === activeSourceId));
      button.addEventListener("click", () => selectEvidence(source.id));
      container.append(button);
    });
  }

  function formatLatency(trace) {
    const elapsed = trace.totalMs ?? trace.elapsedMs;
    if (!Number.isFinite(elapsed)) return "—";
    return elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)} s` : `${elapsed} ms`;
  }

  function renderEvidenceEmpty() {
    evidenceRoot.replaceChildren();
    const empty = createElement("div", "evidence-empty");
    empty.append(createElement("span", "", "01"));
    empty.append(createElement("strong", "", "질문을 선택해보세요."));
    empty.append(
      createElement(
        "p",
        "",
        "답변이 생성되면 사용된 프로젝트 근거가 여기에 표시됩니다."
      )
    );
    evidenceRoot.append(empty);
    evidenceCount.textContent = "0";
    activeSourceId = null;
  }

  function renderEvidencePanel(response) {
    const sources = response.sources ?? [];
    evidenceRoot.replaceChildren();
    evidenceCount.textContent = String(sources.length);

    if (!sources.length) {
      const empty = createElement("div", "evidence-empty");
      empty.append(createElement("span", "", "00"));
      empty.append(createElement("strong", "", "연결할 근거가 부족합니다."));
      empty.append(
        createElement(
          "p",
          "",
          "공개된 자료에서 확인할 수 없는 내용은 추측하지 않습니다. 다른 질문을 선택해보세요."
        )
      );
      evidenceRoot.append(empty);
      evidenceCount.textContent = "0";
      activeSourceId = null;
      return;
    }

    const list = createElement("div", "evidence-list");
    sources.forEach((source, index) => {
      const card = createElement("article", "evidence-card");
      card.dataset.sourceId = source.id;

      const header = createElement("header", "evidence-card__header");
      const indexNode = createElement(
        "span",
        "evidence-card__index",
        String(index + 1).padStart(2, "0")
      );
      const title = createElement("div");
      title.append(
        createElement("h4", "", source.title ?? source.label),
        createElement("span", "evidence-card__label", source.label)
      );
      header.append(indexNode, title);
      card.append(header);

      if (source.summary) card.append(createElement("p", "", source.summary));
      const metadata = createElement("div", "evidence-card__meta");
      if (source.kind) metadata.append(createElement("span", "", source.kind));
      if (source.status) metadata.append(createElement("span", "", source.status));
      if (source.authority) metadata.append(createElement("span", "", source.authority));
      if (metadata.children.length) card.append(metadata);

      const provenance = source.provenance?.sources?.[0];
      if (provenance) {
        const sourceLine = createElement("div", "evidence-card__provenance");
        sourceLine.append(
          createElement("span", "", "SOURCE"),
          createElement("strong", "", provenance.label),
          createElement("small", "", provenance.locator)
        );
        card.append(sourceLine);
      }

      const retrievalPath = createRetrievalPath(source);
      if (retrievalPath) card.append(retrievalPath);
      if (source.tags?.length) {
        const tags = createElement("div", "evidence-card__tags");
        source.tags.forEach((tag) => tags.append(createElement("span", "", tag)));
        card.append(tags);
      }

      const openLink = createElement("a", "source-open-button");
      openLink.href = routeForEvidence(source.id);
      openLink.append(
        document.createTextNode("포트폴리오에서 근거 보기"),
        createElement("span", "", "↗")
      );
      openLink.addEventListener("click", (event) => {
        event.preventDefault();
        openSource(source);
      });
      card.append(openLink);
      list.append(card);
    });
    evidenceRoot.append(list);
    selectEvidence(sources[0].id, { scroll: false, activate: false });
  }

  function scrollToLatest() {
    requestAnimationFrame(() => {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    });
  }

  function appendMessage({ role, body = "", sources = [], pending = false }) {
    const fragment = messageTemplate.content.cloneNode(true);
    const article = $(".message", fragment);
    const roleLabel = $("[data-message-role]", fragment);
    const time = $("[data-message-time]", fragment);
    const bodyElement = $("[data-message-body]", fragment);
    const sourcesElement = $("[data-message-sources]", fragment);
    const attachmentsElement = $("[data-message-attachments]", fragment);
    const traceElement = $("[data-message-trace]", fragment);
    const traceStatus = $("[data-message-trace-status]", fragment);
    const traceCount = $("[data-message-trace-count]", fragment);
    const traceContent = $("[data-message-trace-content]", fragment);
    const avatar = $("[data-message-avatar]", fragment);

    article.classList.add(`message--${role}`);
    if (pending) article.classList.add("is-pending");
    roleLabel.textContent = role === "user" ? "YOU" : "PORTFOLIO AI";
    if (avatar) avatar.hidden = role === "user";
    time.textContent = formatTime();
    if (role === "assistant") renderMarkdown(bodyElement, body);
    else bodyElement.textContent = body;

    renderMessageSources(sourcesElement, sources);
    diagramAttachments?.render(attachmentsElement, sources);

    if (pending) {
      renderPendingResponse(bodyElement);
      traceElement.hidden = false;
      traceElement.dataset.autoToggle = "true";
      traceElement.open = true;
      traceElement.addEventListener("toggle", () => {
        if (traceElement.dataset.autoToggle === "true") return;
        traceElement.dataset.userToggled = "true";
      });
      window.setTimeout(() => delete traceElement.dataset.autoToggle, 0);
    }

    updatePeekPreview(pending
      ? {
          role: "AI",
          status: "RESPONSE STARTED",
          message: "공개 포트폴리오 근거를 확인하고 있습니다."
        }
      : {
          role: role === "user" ? "YOU" : "AI",
          status: role === "user" ? "QUESTION SENT" : "READY",
          message: body
        });

    transcript.append(fragment);
    scrollToLatest();

    return {
      article: transcript.lastElementChild,
      body: $("[data-message-body]", transcript.lastElementChild),
      sources: $("[data-message-sources]", transcript.lastElementChild),
      attachments: $("[data-message-attachments]", transcript.lastElementChild),
      trace: {
        details: $("[data-message-trace]", transcript.lastElementChild),
        status: $("[data-message-trace-status]", transcript.lastElementChild),
        count: $("[data-message-trace-count]", transcript.lastElementChild),
        content: $("[data-message-trace-content]", transcript.lastElementChild)
      }
    };
  }

  function renderSuggestions(items) {
    suggestionsRoot.replaceChildren();
    suggestionsRoot.scrollLeft = 0;
    items.slice(0, 2).forEach((question) => {
      const button = createElement("button", "suggestion", question);
      button.type = "button";
      button.addEventListener("click", () => submitQuestion(question));
      suggestionsRoot.append(button);
    });
    requestAnimationFrame(updateSuggestionOverflow);
  }

  function renderClarificationChoices(article, clarification) {
    article?.querySelector(".message-clarification")?.remove();
    if (!article || !clarification || !Array.isArray(clarification.options) || clarification.options.length !== 2) return;
    const root = createElement("div", "message-clarification");
    root.setAttribute("aria-label", "질문 의미 확인 선택지");
    clarification.options.forEach((option) => {
      const button = createElement("button", "message-clarification__option", option.label);
      button.type = "button";
      button.addEventListener("click", () => {
        root.querySelectorAll("button").forEach((item) => { item.disabled = true; });
        pendingClarification = null;
        submitQuestion(option.label, {
          clarificationReply: { id: clarification.id, optionId: option.id }
        });
      }, { once: true });
      root.append(button);
    });
    article.append(root);
  }

  function renderGenerationStatus(payload) {
    if (!activeGenerationArticle) return;
    let root = activeGenerationArticle.querySelector(".message-generation-status");
    if (payload.status === "complete") {
      if (continuationTimer) window.clearInterval(continuationTimer);
      continuationTimer = 0;
      root?.remove();
      return;
    }
    if (!root) {
      root = createElement("div", "message-generation-status");
      root.setAttribute("role", "status");
      root.setAttribute("aria-live", "polite");
      root.append(
        createElement("span", "message-generation-status__pulse"),
        createElement("span", "message-generation-status__label", "답변의 남은 결론을 마무리하고 있습니다"),
        createElement("span", "message-generation-status__elapsed", "0초")
      );
      activeGenerationArticle.append(root);
      continuationStartedAt = Date.now();
      continuationTimer = window.setInterval(() => {
        const elapsed = root.querySelector(".message-generation-status__elapsed");
        if (elapsed) elapsed.textContent = `${Math.max(0, Math.floor((Date.now() - continuationStartedAt) / 1_000))}초`;
      }, 1_000);
    }
    root.dataset.status = payload.status;
  }

  function updateSuggestionOverflow() {
    const maxScrollLeft = suggestionsRoot.scrollWidth - suggestionsRoot.clientWidth;
    suggestionsShell.classList.toggle("is-scrollable", maxScrollLeft > 2);
    suggestionsShell.classList.toggle(
      "is-at-end",
      maxScrollLeft <= 2 || suggestionsRoot.scrollLeft >= maxScrollLeft - 2
    );
  }

  function resetConversation({ clearSession = true } = {}) {
    conversationVersion += 1;
    navigationTimers.forEach((cancel) => cancel());
    navigationTimers.clear();
    activeController?.abort();
    activeController = null;
    setBusy(false);
    if (clearSession) {
      void agentService.resetSession();
      conversationStore.clear();
      followUpCache.clear();
    }
    conversationTurns = [];
    pendingClarification = null;
    document.body.dataset.interviewState = workspace.dataset.mode === "peek" ? "peek" : "open";
    renderEvidenceEmpty();
    resetLiveTrace();
    activateInspectorTab("trace");
    setStage("READY", "대화를 초기화했습니다.");
    transcript.replaceChildren();
    appendMessage({
      role: "assistant",
      body:
        "안녕하세요. 공개된 포트폴리오 자료를 바탕으로 프로젝트, 기술적 판단, 담당 범위와 일하는 기준에 대해 답변드릴게요. 아래 질문을 고르거나 직접 질문해보세요."
    });
    renderSuggestions(questions);
    input.value = "";
    input.style.height = "auto";
  }

  function persistCompletedConversation(question, response) {
    conversationTurns.push(
      { role: "user", body: question, sources: [] },
      { role: "assistant", body: response.answer, sources: response.sources ?? [] }
    );
    conversationTurns = conversationTurns.slice(-40);
    pendingClarification = response.needsClarification ? response.clarification : null;
    const identity = agentService.browserSessionIdentity;
    conversationStore.save({ ...identity, turns: conversationTurns, pendingClarification });
  }

  function createAnswerRevealController({ pending, controller, requestVersion, pendingLabel }) {
    let received = "";
    let displayedCharacters = 0;
    let sourceComplete = false;
    let revealStarted = false;
    let revealReady = false;
    let frameId = 0;
    let resolveFinished;
    const finished = new Promise((resolve) => { resolveFinished = resolve; });
    controller.signal.addEventListener("abort", () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      resolveFinished();
    }, { once: true });

    function isCurrent() {
      return !controller.signal.aborted && requestVersion === conversationVersion;
    }

    function startReveal() {
      if (revealStarted) return;
      revealStarted = true;
      void (async () => {
        if (pendingLabel) pendingLabel.textContent = "첫 토큰 준비 · Trace 완료 후 스트리밍";
        await finishTraceTransitions();
        if (!isCurrent()) return resolveFinished();
        await nextAnimationFrame();
        if (!isCurrent()) return resolveFinished();
        revealReady = true;
        scheduleFrame();
      })();
    }

    function scheduleFrame() {
      if (frameId || !revealReady || !isCurrent()) return;
      frameId = requestAnimationFrame(renderFrame);
    }

    function renderFrame() {
      frameId = 0;
      if (!isCurrent()) return resolveFinished();
      const backlog = received.length - displayedCharacters;
      if (backlog > 0) {
        const step = backlog > 600 ? 8 : backlog > 240 ? 6 : backlog > 80 ? 4 : 2;
        displayedCharacters = Math.min(received.length, displayedCharacters + step);
        pending.article.classList.remove("is-pending");
        renderMarkdown(pending.body, received.slice(0, displayedCharacters));
      }
      if (sourceComplete && displayedCharacters >= received.length) return resolveFinished();
      if (backlog > 0) scheduleFrame();
    }

    return Object.freeze({
      push(token) {
        if (!isCurrent() || typeof token !== "string") return;
        received += token;
        streamedAnswerCharacters = received.length;
        updateAnswerPreview(received);
        startReveal();
        scheduleFrame();
      },
      async finish() {
        sourceComplete = true;
        startReveal();
        scheduleFrame();
        await finished;
        return received;
      },
      value() {
        return received;
      }
    });
  }

  function setBusy(busy) {
    isResponding = busy;
    input.disabled = busy;
    submit.disabled = false;
    submit.type = busy ? "button" : "submit";
    submit.textContent = busy ? "\u00d7" : "\u2191";
    submit.setAttribute("aria-label", busy ? "답변 생성 취소" : "질문 보내기");
    transcript.setAttribute("aria-busy", String(busy));
    if (!workspace.hidden) {
      if (busy) {
        document.body.dataset.interviewState = "responding";
      } else if (document.body.dataset.interviewState !== "error") {
        document.body.dataset.interviewState = activeSourceId ? "result" : "open";
      }
    }
  }

  function navigationHref(action) {
    if (action.target.kind === "landing") return `#${action.target.anchor}`;
    return projectDetailRoute(action.target.projectId, action.target.sectionId);
  }

  function renderResponseActions(article, actions, requestVersion) {
    const validActions = (Array.isArray(actions) ? actions : [])
      .map((action) => validateNavigationAction(action, projects))
      .filter(Boolean);
    if (!validActions.length) return;

    const root = createElement("div", "message-actions");
    validActions.forEach((action) => {
      const card = createElement("section", "navigation-action");
      const copy = createElement("div", "navigation-action__copy");
      const status = createElement("span", "navigation-action__status");
      const countdown = createElement("strong", "navigation-action__countdown");
      const cancelButton = createElement("button", "navigation-action__cancel", "이동 취소");
      cancelButton.type = "button";
      const delayMs = action.delayMs;
      const startedAt = Date.now();
      let timeoutId;
      let intervalId;
      let settled = false;

      copy.append(
        createElement("span", "", "VERIFIED NAVIGATION"),
        createElement("strong", "", action.label),
        createElement("small", "", "허용된 포트폴리오 내부 경로만 실행합니다.")
      );
      status.append(countdown, cancelButton);
      card.append(copy, status);
      root.append(card);

      function stopTimers() {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (intervalId) window.clearInterval(intervalId);
      }

      function cancel({ silent = false } = {}) {
        if (settled) return;
        settled = true;
        stopTimers();
        navigationTimers.delete(cancel);
        card.dataset.status = "cancelled";
        countdown.textContent = silent ? "중단됨" : "이동 취소됨";
        cancelButton.remove();
      }

      function updateCountdown() {
        const remaining = Math.max(0, delayMs - (Date.now() - startedAt));
        countdown.textContent = `${Math.max(1, Math.ceil(remaining / 1000))}초 후 이동`;
      }

      function navigate() {
        if (settled || requestVersion !== conversationVersion || !article.isConnected) {
          cancel({ silent: true });
          return;
        }
        settled = true;
        stopTimers();
        navigationTimers.delete(cancel);
        card.dataset.status = "complete";
        countdown.textContent = "이동 중";
        cancelButton.remove();
        setWorkspaceMode("peek");
        window.location.hash = navigationHref(action);
      }

      cancelButton.addEventListener("click", () => cancel());
      updateCountdown();
      intervalId = window.setInterval(updateCountdown, 200);
      timeoutId = window.setTimeout(navigate, delayMs);
      navigationTimers.add(cancel);
    });
    article.append(root);
  }

  async function submitQuestion(rawQuestion, { clarificationReply = null } = {}) {
    const question = rawQuestion.trim();
    if (!question || isResponding) return;

    const requestVersion = conversationVersion;
    const uiTurnStartedAt = performance.now();
    const controller = new AbortController();
    activeController = controller;
    setBusy(true);
    resetLiveTrace();
    activateInspectorTab("trace");
    setStage("RETRIEVING", "포트폴리오 근거를 찾는 중입니다.");
    appendMessage({ role: "user", body: question });
    input.value = "";
    input.style.height = "auto";
    suggestionsRoot.replaceChildren();
    requestAnimationFrame(updateSuggestionOverflow);

    const pending = appendMessage({ role: "assistant", pending: true });
    activeGenerationArticle = pending.article;
    const pendingLabel = pending.body.querySelector(".response-generating__label");
    activeInlineTrace = pending.trace;
    startTraceClock();
    renderInlineTrace();
    const reveal = createAnswerRevealController({ pending, controller, requestVersion, pendingLabel });
    const pageContext = currentContext();
    const queryScope = classifyQueryScope(question, pageContext, projects);
    let cacheKey = null;
    let cachedFollowUps = null;

    try {
      const identity = agentService.followUpCacheIdentity;
      if (identity.agentContract === "portfolio-agent-v2-preset") throw new Error("v2 evidence follow-ups are not browser-cached");
      const rememberedModel = window.sessionStorage.getItem("portfolio-followup-model");
      cacheKey = await createFollowUpCacheKey({
        question,
        queryScope,
        publicBundleDigest: identity.publicBundleDigest,
        goldCorpusDigest: identity.goldCorpusDigest,
        queryIndexDigest: identity.queryIndexDigest,
        presetDigest: identity.presetDigest,
        model: rememberedModel ?? identity.model,
        agentContract: identity.agentContract,
        clientRelease: identity.clientRelease,
        pageContext,
        conversationDigest: identity.conversationDigest
      });
      cachedFollowUps = followUpCache.get(cacheKey);
    } catch {
      // Cache lookup never blocks an answer.
    }

    try {
      const responsePromise = agentService.ask(question, (token) => {
        reveal.push(token);
        updatePeekPreview({
          role: "AI",
          status: "RESPONSE READY",
          message: "첫 토큰을 준비했습니다. Trace 완료 후 실제 답변 스트리밍을 시작합니다."
        });
      }, controller.signal, (event, payload) => {
        handleAgentEvent(event, payload);
      }, pageContext, { cachedFollowUps, clarificationReply });
      const response = await responsePromise;
      await reveal.finish();

      if (controller.signal.aborted || requestVersion !== conversationVersion) return;
      pending.article.classList.remove("is-pending");
      renderMarkdown(pending.body, response.answer);
      updatePeekPreview({ role: "AI", status: "ANSWER READY", message: response.answer });

      renderMessageSources(pending.sources, response.sources);
      diagramAttachments?.render(pending.attachments, response.sources);
      renderResponseActions(pending.article, response.actions, requestVersion);
      persistCompletedConversation(question, response);
      renderClarificationChoices(pending.article, response.clarification);

      if (response.trace) response.trace.uiCompleteMs = Math.round(performance.now() - uiTurnStartedAt);
      finalizeLiveTrace(response.trace);
      settleInlineTrace();
      renderEvidencePanel(response);
      setStage(
        response.insufficientEvidence ? "LIMITED EVIDENCE" : "EVIDENCE LINKED",
        response.insufficientEvidence
          ? "공개 자료에서 확인할 수 있는 범위가 제한적입니다."
          : "답변 생성과 근거 연결을 완료했습니다."
      );
      if (response.sessionReplaced) {
        setStage("NEW SESSION", "화면 기록은 유지했지만 서버 문맥은 만료되어 새 세션으로 이어갑니다.");
      }

      if (response.trace?.provider === "mock") {
        setProviderState({
          label: "SAFE FALLBACK",
          status: "LOCAL MODEL OFF · FALLBACK ACTIVE",
          notice: "이번 답변은 로컬 모델 연결 실패로 검증된 포트폴리오 답변 엔진에서 생성했습니다.",
          provider: "fallback"
        });
      } else if (response.trace?.provider === "prepared-cache") {
        setProviderState({
          label: "PREPARED · VERIFIED",
          status: "PUBLIC SOURCES · VERIFIED",
          notice: "검토된 준비 질문을 공개 근거와 다시 결속해 모델 호출 없이 반환했습니다.",
          provider: "prepared-cache"
        });
      } else if (response.trace?.provider === "ollama") {
        setProviderState({
          label: `LOCAL AI · ${response.trace.model ?? "OLLAMA"}`,
          status: "LOCAL AGENT · READY",
          provider: "ollama"
        });
      }

      if (response.trace?.model) {
        try {
          window.sessionStorage.setItem("portfolio-followup-model", response.trace.model);
        } catch {
          // The current response remains usable without persistence.
        }
      }
      if (response.trace?.followUpMode === "generated" && response.followUps.length >= 2) {
        try {
          const identity = agentService.followUpCacheIdentity;
          const generatedKey = await createFollowUpCacheKey({
            question,
            queryScope,
            publicBundleDigest: identity.publicBundleDigest,
            goldCorpusDigest: identity.goldCorpusDigest,
            queryIndexDigest: identity.queryIndexDigest,
            presetDigest: identity.presetDigest,
            model: response.trace?.model ?? identity.model,
            agentContract: identity.agentContract,
            clientRelease: identity.clientRelease,
            pageContext,
            conversationDigest: identity.conversationDigest
          });
          followUpCache.set(generatedKey, response.followUps);
        } catch {
          // Follow-up persistence never blocks rendering.
        }
      }
      renderSuggestions(response.followUps);
    } catch (error) {
      if (requestVersion !== conversationVersion) return;
      cancelTraceTransitions();
      if (error?.name === "AbortError") {
        pending.article.classList.remove("is-pending");
        pending.article.classList.add("message--cancelled");
        const partialAnswer = reveal.value().trim();
        pending.body.textContent = partialAnswer
          ? `${partialAnswer}\n\n(답변 생성이 취소되었습니다.)`
          : "답변 생성을 취소했습니다.";
        updatePeekPreview({ role: "AI", status: "CANCELLED", message: pending.body.textContent });
        const runningNode = [...traceNodes.entries()].find(([, state]) => state.status === "running")?.[0];
        if (runningNode) {
          traceNodes.set(runningNode, {
            status: "cancelled",
            detail: "사용자가 답변 생성을 취소했습니다."
          });
          renderLiveTrace();
          renderInlineTrace();
        }
        settleInlineTrace();
        setStage("CANCELLED", "답변 생성을 취소했습니다.");
        renderSuggestions(questions);
        return;
      }
      pending.article.classList.remove("is-pending");
      pending.article.classList.add("message--error");
      pending.body.textContent =
        "응답 엔진에 연결하지 못했습니다. 일반 포트폴리오는 계속 살펴볼 수 있습니다. 잠시 후 다시 시도해주세요.";
      updatePeekPreview({ role: "AI", status: "ERROR", message: pending.body.textContent });
      markTraceError(error instanceof Error ? error.message : String(error));
      settleInlineTrace();
      setStage("ERROR", "답변 생성 중 오류가 발생했습니다.");
      if (!workspace.hidden) document.body.dataset.interviewState = "error";
      renderSuggestions(questions);
      console.error(error);
    } finally {
      if (activeController === controller) {
        activeController = null;
        stopTraceClock();
        setBusy(false);
        if (!workspace.hidden && workspace.dataset.mode !== "peek") input.focus();
        scrollToLatest();
      }
      if (continuationTimer) window.clearInterval(continuationTimer);
      continuationTimer = 0;
      activeGenerationArticle = null;
    }
  }

  $$('[data-open-agent]').forEach((button) => {
    button.addEventListener("click", () => {
      openWorkspace(button);
      const question = button.dataset.question;
      if (conversationTurns.length === 0 && !isResponding && typeof question === "string" && question.trim()) {
        input.value = question.slice(0, input.maxLength);
        input.dispatchEvent(new Event("input"));
        submitQuestion(input.value);
      }
    });
  });

  document.addEventListener("portfolio:open-agent", (event) => {
    openWorkspace();
    const question = event.detail?.question;
    if (typeof question === "string") {
      input.value = question.slice(0, input.maxLength);
      input.dispatchEvent(new Event("input"));
      if (event.detail?.submit) submitQuestion(input.value);
      else input.focus({ preventScroll: true });
    }
  });

  window.addEventListener("hashchange", () => {
    updateContextLabel();
    setWorkspaceMode("peek");
  });

  peekButton.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePeek();
  });
  workspace.addEventListener("click", () => {
    if (workspace.dataset.mode === "peek") openWorkspace(workspace);
  });
  workspace.addEventListener("keydown", (event) => {
    if (workspace.dataset.mode !== "peek" || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openWorkspace(workspace);
  });
  $("[data-reset-agent]").addEventListener("click", () => resetConversation());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion(input.value);
  });

  submit.addEventListener("click", (event) => {
    if (!isResponding) return;
    event.preventDefault();
    activeController?.abort(new DOMException("User cancelled", "AbortError"));
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  });

  suggestionsRoot.addEventListener("scroll", updateSuggestionOverflow, { passive: true });
  window.addEventListener("resize", updateSuggestionOverflow, { passive: true });
  inspectorTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateInspectorTab(tab.dataset.agentTab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = inspectorTabs[(index + direction + inspectorTabs.length) % inspectorTabs.length];
      activateInspectorTab(next.dataset.agentTab, { focus: true });
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !diagramAttachments?.isOpen() && !workspace.hidden) {
      setWorkspaceMode("peek");
      lastOpener?.focus({ preventScroll: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (workspace.dataset.mode !== "full") return;
    if (workspace.contains(event.target) || event.target.closest?.("[data-open-agent], dialog")) return;
    setWorkspaceMode("peek");
  });

  if (restoredConversation?.turns.length) {
    transcript.replaceChildren();
    let lastMessage = null;
    restoredConversation.turns.forEach((turn) => {
      lastMessage = appendMessage({ role: turn.role, body: turn.body, sources: turn.sources });
    });
    if (pendingClarification && lastMessage) renderClarificationChoices(lastMessage.article, pendingClarification);
    renderEvidenceEmpty();
    resetLiveTrace();
    setStage("RESTORED", "새로고침 전 대화와 서버 세션을 복원했습니다.");
    renderSuggestions(questions);
  } else {
    resetConversation({ clearSession: false });
  }
  workspace.hidden = false;
  setWorkspaceMode("peek");
  updateContextLabel();
  refreshProviderHealth();
}

function showLoadError(error, message) {
  const notice = createElement(
    "div",
    "load-error",
    message
  );
  document.body.append(notice);
  console.error(error);
}

function disableAgent(error) {
  $$("[data-open-agent]").forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  });

  const navButton = $(".site-nav [data-open-agent]");
  if (navButton) navButton.textContent = "AI unavailable";

  const sectionCopy = $("[data-agent-section-copy]");
  if (sectionCopy) {
    sectionCopy.textContent =
      "AI 인터뷰 데이터를 불러오지 못했습니다. 일반 포트폴리오의 프로젝트와 설계 판단은 그대로 살펴볼 수 있습니다.";
  }

  console.error(error);
}

async function main() {
  let portfolioContent;

  try {
    portfolioContent = await loadPortfolioContent();
    renderProfile(portfolioContent.site);
    renderProjects(portfolioContent.projects);
    initializeContextualAgentCta(portfolioContent.projects);
    initializeHeader();
    initializeReveals();
  } catch (error) {
    showLoadError(
      error,
      "포트폴리오 콘텐츠를 불러오지 못했습니다. README에 안내된 로컬 서버로 실행했는지 확인해주세요."
    );
    return;
  }

  let knowledge = { metadata: {}, ontology: {}, nodes: [], edges: [] };
  let knowledgeError = null;
  try {
    knowledge = await loadPortfolioKnowledge(portfolioContent);
  } catch (error) {
    knowledgeError = error;
    console.error("Portfolio evidence could not be loaded:", error);
  }

  const diagramAttachments = initializeDiagramAttachments({
    projects: portfolioContent.projects,
    dialog: $("[data-diagram-dialog]"),
    renderDiagram: renderMermaid,
    fallbackFocus: () => $("[data-agent-input]")
  });
  const explorer = initializePortfolioExplorer({
    projects: portfolioContent.projects,
    knowledge,
    openDiagram: diagramAttachments.openById,
    renderDiagram(target, source, options) {
      void renderMermaid(target, source, options);
    }
  });

  try {
    if (knowledgeError) throw knowledgeError;
    const agentContent = await loadAgentContent({ ...portfolioContent, knowledge });
    const projectsById = new Map(
      portfolioContent.projects.map((project) => [project.id, project])
    );
    const knowledgeNodesById = new Map(
      agentContent.knowledge.nodes.map((node) => [node.id, node])
    );
    const agentService = new AgentService({
      knowledge: agentContent.knowledge,
      projects: portfolioContent.projects,
      systemPrompt: agentContent.systemPrompt
    });
    initializeAgent({
      agentService,
      projects: portfolioContent.projects,
      questions: agentContent.questions,
      onOpenSource: explorer.openEvidence,
      diagramAttachments,
      getPageContext: () => readCurrentPageContext({
        projectsById,
        knowledgeNodesById
      })
    });
  } catch (error) {
    disableAgent(error);
  }
}

main();
