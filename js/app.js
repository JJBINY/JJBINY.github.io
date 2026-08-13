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
import { renderMermaid } from "./diagrams/mermaid-renderer.js";
import { formatReleaseStamp } from "./release-stamp.js";
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
    version = "beta:0.0.3",
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
    timeZone: release.timeZone
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
  const traceNodes = new Map();
  const queuedTraceNodes = new Set();
  let traceTransitionVersion = 0;
  let traceTransitionChain = Promise.resolve();
  const navigationTimers = new Set();
  let peekPreviewState = Object.freeze({
    role: "AI READY",
    status: "PUBLIC KNOWLEDGE",
    message: "포트폴리오의 프로젝트와 설계 판단을 질문해보세요."
  });
  const traceDefinitions = [
    ["memory", "01", "Context", "최근 대화와 현재 페이지 힌트를 검색 문맥으로 정리합니다."],
    ["classify", "02", "Intent", "질문 유형, 지칭 대상과 공개 범위를 판별합니다."],
    ["retrieve", "03", "Retrieval", "어휘·dense 후보를 결합해 답변 근거 seed를 선택합니다."],
    ["connect", "04", "Evidence graph", "허용된 relation을 따라 관련 근거와 claim 경로를 연결합니다."],
    ["generate", "05", "Synthesis", "선택된 근거와 답변 계획 안에서 문장을 스트리밍합니다."],
    ["ground", "06", "Source check", "공개 source allowlist와 인용 결속을 최종 검증합니다."]
  ];
  const traceTransitionDuration = Object.freeze({
    memory: 900,
    classify: 1100,
    retrieve: 1800,
    connect: 1300,
    generate: 1400,
    ground: 900
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
      fallback: "FALLBACK",
      cancelled: "CANCELLED",
      error: "ERROR"
    }[status] ?? String(status).toUpperCase();
  }

  function traceDefinition(nodeId) {
    return traceDefinitions.find(([id]) => id === nodeId);
  }

  function traceActivity(nodeId, state) {
    const output = state.output ?? {};
    if (nodeId === "memory") {
      return output.recentExchangeCount !== undefined
        ? `최근 ${output.recentExchangeCount}턴과 회상 detail ${output.recalledEpisodeCount ?? 0}건을 정렬하고 페이지 힌트를 결합했습니다.`
        : "최근 대화 → 장기 기억 후보 → 현재 프로젝트 힌트 순으로 검색 문맥을 구성하고 있습니다.";
    }
    if (nodeId === "classify") {
      return output.intent
        ? `의도 ${output.intent} · 범위 ${output.queryScope?.kind ?? output.queryScope ?? "global"}로 분류했습니다.`
        : "질문의 목적, 명시 프로젝트, 현재 페이지 지시어와 답변 상세도 신호를 분류하고 있습니다.";
    }
    if (nodeId === "retrieve") {
      const seedCount = output.seeds?.length;
      return Number.isFinite(seedCount)
        ? `어휘·dense 후보를 결합하고 중복을 축약해 ${seedCount}개의 seed 근거를 선택했습니다.`
        : "어휘 seed 검색 → BGE-M3 후보 검색 → RRF 결합 → 상위 공개 근거 선택을 수행하고 있습니다.";
    }
    if (nodeId === "connect") {
      const pathCount = output.paths?.length;
      return Number.isFinite(pathCount)
        ? `${pathCount}개의 허용 relation 경로를 claim 후보와 연결했습니다.`
        : "seed에서 1-hop 관계를 확장하고 중복 경로와 비공개 source 노출 가능성을 제거하고 있습니다.";
    }
    if (nodeId === "generate") {
      if (state.status === "complete") {
        return output.generationMode === "prepared-cache"
          ? "검토된 준비 답변을 공개 근거와 다시 결속해 반환했습니다. 모델 추론은 실행하지 않았습니다."
          : `${output.outputTokens ?? "—"} tokens을 생성하고 응답 깊이와 출력 상한을 기록했습니다.`;
      }
      if (streamedAnswerCharacters > 0) {
        return `첫 토큰을 수신했습니다. 근거 범위 안에서 답변 문장을 스트리밍 중이며 현재 ${streamedAnswerCharacters.toLocaleString()}자를 전달했습니다.`;
      }
      return "선택 근거와 답변 계획을 bounded prompt로 구성했습니다. 로컬 AI의 첫 응답 토큰을 기다리고 있습니다.";
    }
    if (nodeId === "ground") {
      const sourceCount = output.sourceIds?.length;
      return Number.isFinite(sourceCount)
        ? `${sourceCount}개의 공개 source ID와 인용 위치를 검증하고 후속 질문 모드를 확정했습니다.`
        : "답변의 source ID를 공개 allowlist와 대조하고 인용·후속 질문 결속을 확인하고 있습니다.";
    }
    return state.detail ?? "현재 작업을 수행하고 있습니다.";
  }

  function traceProgressState() {
    const completed = traceDefinitions.filter(([id]) => ["complete", "fallback", "skipped"].includes(traceNodes.get(id)?.status)).length;
    const runningIndex = traceDefinitions.findIndex(([id]) => traceNodes.get(id)?.status === "running");
    const currentIndex = runningIndex >= 0 ? runningIndex : Math.min(completed, traceDefinitions.length - 1);
    const progress = finalTrace
      ? 100
      : Math.min(96, ((completed + (runningIndex >= 0 ? 0.42 : 0.08)) / traceDefinitions.length) * 100);
    return { completed, currentIndex, progress };
  }

  function appendWorkingVisual(root, nodeId, status) {
    const visual = createElement("span", `trace-working-mark${nodeId === "generate" ? " trace-working-mark--generate" : ""}`);
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
    if (nodeId === "memory") {
      return [
        ["RECENT", `${output.recentExchangeCount ?? 0} turns`],
        ["RECALLED", `${output.recalledEpisodeCount ?? 0} details`],
        ["CONTEXT", output.pageContext?.title ?? "none"]
      ];
    }
    if (nodeId === "classify") {
      return [
        ["INTENT", output.intent ?? "general"],
        ["SCOPE", output.queryScope?.kind ?? output.queryScope ?? "global"]
      ];
    }
    if (nodeId === "retrieve") {
      return [
        ["MODE", output.retrieval?.effectiveMode ?? output.retrieval?.requestedMode ?? "lexical + graph"],
        ["CONFIDENCE", output.confidence ?? "—"],
        ["SEEDS", String(output.seeds?.length ?? 0)],
        ["LATENCY", Number.isFinite(output.durationMs) ? `${output.durationMs} ms` : "—"]
      ];
    }
    if (nodeId === "connect") return [["PATHS", String(output.paths?.length ?? 0)]];
    if (nodeId === "generate") {
      return [
        ["MODE", output.generationMode ?? finalTrace?.generationMode ?? "model"],
        ["DEPTH", output.responseDepth ?? finalTrace?.responseDepth ?? "—"],
        ["CEILING", Number.isFinite(output.tokenCeiling ?? finalTrace?.tokenCeiling) ? `${output.tokenCeiling ?? finalTrace.tokenCeiling} tok` : "—"],
        ["TTFT", Number.isFinite(output.timeToFirstTokenMs) ? `${output.timeToFirstTokenMs} ms` : "—"],
        ["OUTPUT", Number.isFinite(output.outputTokens) ? `${output.outputTokens} tok` : "—"],
        ["SPEED", Number.isFinite(output.tokensPerSecond) ? `${output.tokensPerSecond} tok/s` : "—"]
      ];
    }
    if (nodeId === "ground") return [
      ["PUBLIC SOURCES", String(output.sourceIds?.length ?? 0)],
      ["FOLLOW-UPS", finalTrace?.followUpMode ?? output.followUpMode ?? "pending"]
    ];
    return [];
  }

  function appendTraceFacts(content, nodeId, state) {
    const facts = traceStageFacts(nodeId, state).filter(([, value]) => value !== undefined);
    if (!facts.length || !state.output) return;
    const grid = createElement("dl", "trace-node__facts");
    facts.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.append(createElement("dt", "", label), createElement("dd", "", value));
      grid.append(item);
    });
    content.append(grid);
  }

  function renderInlineTrace() {
    if (!activeInlineTrace?.details?.isConnected) return;
    const { details, status, count, content } = activeInlineTrace;
    if (finalTrace) {
      details.hidden = true;
      return;
    }
    const entries = [...traceNodes.entries()];
    const current = entries.find(([, state]) => state.status === "running") ?? entries.at(-1);
    details.hidden = false;
    details.open = true;
    if (!current) {
      count.textContent = "준비";
      status.textContent = "실행 경로 준비 중";
      content.replaceChildren();
      return;
    }
    const [id, state] = current;
    const definition = traceDefinition(id) ?? [id, "—", id, "실행 중입니다."];
    const progressState = traceProgressState();
    count.textContent = `${progressState.currentIndex + 1} / ${traceDefinitions.length}`;
    status.textContent = ["error", "cancelled"].includes(state.status)
      ? `실행 ${traceStatusLabel(state.status).toLocaleLowerCase()}`
      : `${definition[2]} ${state.status === "running" ? "실행 중" : "완료"}`;
    content.replaceChildren();
    const list = createElement("ol", "message-live-trace__steps");
    const item = createElement("li", "");
    item.dataset.status = state.status;
    item.dataset.traceNode = id;
    const progress = createElement("div", "message-live-trace__progress");
    const progressBar = document.createElement("i");
    progressBar.style.setProperty("--trace-progress-scale", String(progressState.progress / 100));
    progress.append(progressBar);
    const heading = createElement("div", "message-live-trace__current");
    appendWorkingVisual(heading, id, state.status);
    heading.append(
      createElement("span", "message-live-trace__index", definition[1]),
      createElement("strong", "", definition[2]),
      createElement("em", "", state.status === "running" && traceStartedAt
        ? `${Math.max(0, Math.round((Date.now() - traceStartedAt) / 1000))}s`
        : Number.isFinite(state.elapsedMs) ? `${state.elapsedMs} ms` : traceStatusLabel(state.status))
    );
    item.append(progress, heading, createElement("p", "", traceActivity(id, state)));
    list.append(item);
    content.append(list);
  }

  function settleInlineTrace() {
    renderInlineTrace();
  }

  function applyTraceEvent(payload) {
    const previous = traceNodes.get(payload.node);
    const startedAtMs = payload.status === "running"
      ? payload.atMs ?? previous?.startedAtMs
      : previous?.startedAtMs;
    const elapsedMs = payload.output?.durationMs ?? (
      payload.status === "complete" && Number.isFinite(payload.atMs) && Number.isFinite(startedAtMs)
        ? Math.max(0, payload.atMs - startedAtMs)
        : undefined
    );
    traceNodes.set(payload.node, {
      status: payload.status ?? "running",
      detail: payload.detail,
      output: payload.output,
      startedAtMs,
      elapsedMs
    });
    renderLiveTrace();
    renderInlineTrace();
    if (payload.status === "running") setStage(payload.node.toUpperCase(), payload.detail);
  }

  function waitForTraceTransition(duration, version) {
    if (prefersReducedMotion() || duration <= 0 || version !== traceTransitionVersion) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.setTimeout(resolve, duration);
    });
  }

  function queueTraceEvent(payload) {
    const version = traceTransitionVersion;
    const definition = traceDefinition(payload.node);
    const needsRunningPrelude = payload.status === "complete" && !queuedTraceNodes.has(payload.node);
    queuedTraceNodes.add(payload.node);
    traceTransitionChain = traceTransitionChain.then(async () => {
      if (version !== traceTransitionVersion) return;
      if (needsRunningPrelude) {
        applyTraceEvent({
          ...payload,
          status: "running",
          detail: definition?.[3] ?? payload.detail,
          output: undefined
        });
        await waitForTraceTransition(traceTransitionDuration[payload.node] ?? 1000, version);
        if (version !== traceTransitionVersion) return;
      }
      applyTraceEvent(payload);
      if (payload.status === "running") {
        const requestedDelay = payload.output?.presentationDelayMs;
        const stageDuration = traceTransitionDuration[payload.node] ?? 1000;
        const delay = Number.isFinite(requestedDelay)
          ? Math.max(stageDuration, Math.min(3_000, requestedDelay))
          : stageDuration;
        await waitForTraceTransition(delay, version);
      }
    });
  }

  function cancelTraceTransitions() {
    traceTransitionVersion += 1;
    traceTransitionChain = Promise.resolve();
    queuedTraceNodes.clear();
  }

  async function finishTraceTransitions() {
    await traceTransitionChain;
  }

  function renderLiveTrace() {
    traceRoot.replaceChildren();

    const progressState = traceProgressState();

    const summary = createElement("header", "live-trace__summary");
    const signal = createElement("span", "live-trace__signal");
    const wasCancelled = [...traceNodes.values()].some((state) => state.status === "cancelled");
    const signalLabel = finalTrace
      ? " TRACE COMPLETE"
      : wasCancelled
        ? " TRACE CANCELLED"
        : isResponding
          ? " STREAM CONNECTED"
          : " TRACE READY";
    signal.append(createElement("i"), document.createTextNode(signalLabel));
    summary.append(
      signal,
      createElement(
        "span",
        "live-trace__event-total",
        `${activeTraceId ? `TRACE ${activeTraceId.slice(0, 8)} · ` : ""}${traceEvents} EVENTS`
      )
    );

    const progress = createElement("section", "live-trace__progress");
    const progressHeader = createElement("div", "live-trace__progress-header");
    progressHeader.append(
      createElement("strong", "", finalTrace ? "응답 경로 완료" : `파이프라인 ${progressState.currentIndex + 1} / ${traceDefinitions.length}`),
      createElement("span", "", `${Math.round(progressState.progress)}%`)
    );
    const progressTrack = createElement("div", "live-trace__progress-track");
    const progressFill = document.createElement("i");
    progressFill.style.setProperty("--trace-progress-scale", String(progressState.progress / 100));
    progressTrack.append(progressFill);
    progress.append(progressHeader, progressTrack);

    const runningEntry = [...traceNodes.entries()].find(([, state]) => state.status === "running");
    if (runningEntry) {
      const [nodeId, state] = runningEntry;
      const definition = traceDefinition(nodeId) ?? [nodeId, "—", nodeId, state.detail];
      const now = createElement("section", "trace-now");
      now.dataset.traceNode = nodeId;
      now.dataset.status = state.status;
      appendWorkingVisual(now, nodeId, state.status);
      const copy = createElement("div", "trace-now__copy");
      copy.append(
        createElement("span", "mono", `NOW · ${definition[1]}`),
        createElement("strong", "", definition[2]),
        createElement("p", "", traceActivity(nodeId, state))
      );
      now.append(copy);
      progress.append(now);
    }

    const list = createElement("div", "live-trace__nodes");
    traceDefinitions.forEach(([id, index, label, caption]) => {
      const state = traceNodes.get(id) ?? { status: "pending", detail: caption };
      const node = createElement("article", "trace-node");
      node.dataset.status = state.status;
      node.dataset.traceNode = id;

      const rail = createElement("div", "trace-node__rail");
      rail.append(createElement("span", "trace-node__index", index), createElement("i"));

      const content = createElement("div", "trace-node__content");
      const header = createElement("header");
      const status = createElement("div", "trace-node__status-group");
      if (Number.isFinite(state.elapsedMs)) {
        status.append(createElement("span", "trace-node__duration", `${state.elapsedMs} ms`));
      }
      status.append(createElement("span", "trace-node__status", traceStatusLabel(state.status)));
      header.append(
        createElement("strong", "", label),
        status
      );
      content.append(header, createElement("p", "", state.detail ?? caption));
      if (state.status === "running") content.append(createElement("p", "trace-node__activity", traceActivity(id, state)));
      appendTraceFacts(content, id, state);

      node.append(rail, content);
      list.append(node);
    });

    traceRoot.append(summary, progress, list);

    if (finalTrace) {
      const metrics = createElement("section", "live-trace__metrics");
      metrics.append(createElement(
        "strong",
        "live-trace__metrics-title",
        finalTrace.generationMode === "prepared-cache" ? "Prepared response metrics" : "Inference metrics"
      ));
      const grid = createElement("div", "trace-metrics");
      [
        ["Mode", finalTrace.generationMode ?? "model"],
        ["TTFT", Number.isFinite(finalTrace.timeToFirstTokenMs)
          ? formatLatency({ totalMs: finalTrace.timeToFirstTokenMs })
          : "—"],
        ["Total", formatLatency(finalTrace)],
        ["Prompt", Number.isFinite(finalTrace.promptTokens) ? `${finalTrace.promptTokens} tok` : "—"],
        ["Output", Number.isFinite(finalTrace.outputTokens) ? `${finalTrace.outputTokens} tok` : "—"],
        ["Depth", finalTrace.responseDepth ?? "—"],
        ["Ceiling", Number.isFinite(finalTrace.tokenCeiling) ? `${finalTrace.tokenCeiling} tok` : "—"],
        ["Speed", Number.isFinite(finalTrace.tokensPerSecond)
          ? `${finalTrace.tokensPerSecond} tok/s`
          : "—"]
      ].forEach(([label, value]) => {
        const metric = createElement("div", "trace-metric");
        metric.append(createElement("span", "", label), createElement("strong", "", value));
        grid.append(metric);
      });
      metrics.append(grid);
      traceRoot.append(metrics);
    }
  }

  function resetLiveTrace() {
    cancelTraceTransitions();
    traceNodes.clear();
    traceEvents = 0;
    finalTrace = null;
    activeTraceId = null;
    activeInlineTrace = null;
    streamedAnswerCharacters = 0;
    stopTraceClock();
    traceEventCount.textContent = "0";
    renderLiveTrace();
  }

  function handleAgentEvent(event, payload) {
    if (event !== "stage" || !payload?.node) return;
    if (payload.traceId) activeTraceId = payload.traceId;
    traceEvents += 1;
    traceEventCount.textContent = String(traceEvents);
    const definition = traceDefinitions.find(([id]) => id === payload.node);
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
        traceNodes.set(stage.node, {
          status: stage.status,
          detail: stage.detail,
          output: stage.output
        });
      });
    } else if (trace) {
      traceNodes.set("memory", {
        status: "complete",
        detail: trace.memory
          ? `최근 ${trace.memory.recentExchangeCount ?? 0}턴 · 과거 detail ${trace.memory.recalledEpisodeCount ?? 0}건`
          : "이번 요청에는 저장된 대화 맥락이 없습니다."
      });
      traceNodes.set("classify", {
        status: "complete",
        detail: `intent: ${trace.intent ?? "general"}`
      });
      traceNodes.set("retrieve", {
        status: "complete",
        detail: `${trace.retrieved?.length ?? 0}개의 후보 근거를 검색했습니다.`
      });
      traceNodes.set("connect", {
        status: "complete",
        detail: `${trace.retrieved?.filter((match) => match.via).length ?? 0}개의 관계 경로를 연결했습니다.`
      });
      traceNodes.set("generate", {
        status: trace.provider === "mock" ? "fallback" : "complete",
        detail: trace.note ?? `${trace.provider ?? "provider"} 응답을 생성했습니다.`
      });
      traceNodes.set("ground", {
        status: "complete",
        detail: "source ID와 공개 범위 allowlist 검증을 완료했습니다."
      });
    }
    renderLiveTrace();
    renderInlineTrace();
  }

  function markTraceError(message) {
    const running = [...traceNodes.entries()].find(([, state]) => state.status === "running");
    const node = running?.[0] ?? "generate";
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
    bodyElement.textContent = body;

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
    items.slice(0, 3).forEach((question) => {
      const button = createElement("button", "suggestion", question);
      button.type = "button";
      button.addEventListener("click", () => submitQuestion(question));
      suggestionsRoot.append(button);
    });
    requestAnimationFrame(updateSuggestionOverflow);
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
    if (clearSession) void agentService.resetSession();
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

  async function submitQuestion(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || isResponding) return;

    const requestVersion = conversationVersion;
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
    activeInlineTrace = pending.trace;
    startTraceClock();
    renderInlineTrace();
    let streamed = "";
    const pageContext = currentContext();
    const queryScope = classifyQueryScope(question, pageContext, projects);
    let cacheKey = null;
    let cachedFollowUps = null;

    try {
      const identity = agentService.followUpCacheIdentity;
      const rememberedModel = window.sessionStorage.getItem("portfolio-followup-model");
      cacheKey = await createFollowUpCacheKey({
        question,
        queryScope,
        publicBundleDigest: identity.publicBundleDigest,
        model: rememberedModel ?? identity.model
      });
      cachedFollowUps = followUpCache.get(cacheKey);
    } catch {
      // Cache lookup never blocks an answer.
    }

    try {
      const responsePromise = agentService.ask(question, (token) => {
        if (controller.signal.aborted || requestVersion !== conversationVersion) return;
        streamed += token;
        streamedAnswerCharacters = streamed.length;
        pending.body.textContent = streamed;
        pending.article.classList.remove("is-pending");
        updatePeekPreview({ role: "AI", status: "ANSWERING", message: streamed });
        scrollToLatest();
        scheduleTraceRender();
      }, controller.signal, handleAgentEvent, pageContext, { cachedFollowUps });
      const response = await responsePromise;

      if (controller.signal.aborted || requestVersion !== conversationVersion) return;
      await finishTraceTransitions();
      if (controller.signal.aborted || requestVersion !== conversationVersion) return;

      pending.article.classList.remove("is-pending");
      pending.body.textContent = response.answer;
      updatePeekPreview({ role: "AI", status: "ANSWER READY", message: response.answer });

      renderMessageSources(pending.sources, response.sources);
      diagramAttachments?.render(pending.attachments, response.sources);
      renderResponseActions(pending.article, response.actions, requestVersion);

      finalizeLiveTrace(response.trace);
      settleInlineTrace();
      renderEvidencePanel(response);
      setStage(
        response.insufficientEvidence ? "LIMITED EVIDENCE" : "EVIDENCE LINKED",
        response.insufficientEvidence
          ? "공개 자료에서 확인할 수 있는 범위가 제한적입니다."
          : "답변 생성과 근거 연결을 완료했습니다."
      );

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
            model: response.trace?.model ?? identity.model
          });
          followUpCache.set(generatedKey, response.followUps);
        } catch {
          // Follow-up persistence never blocks rendering.
        }
      }
      renderSuggestions(response.followUps.length ? response.followUps : questions);
    } catch (error) {
      if (requestVersion !== conversationVersion) return;
      cancelTraceTransitions();
      if (error?.name === "AbortError") {
        pending.article.classList.remove("is-pending");
        pending.article.classList.add("message--cancelled");
        pending.body.textContent = streamed.trim()
          ? `${streamed.trim()}\n\n(답변 생성이 취소되었습니다.)`
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
    }
  }

  $$('[data-open-agent]').forEach((button) => {
    button.addEventListener("click", () => {
      openWorkspace(button);
      const question = button.dataset.question;
      if (typeof question === "string" && question.trim()) {
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

  resetConversation({ clearSession: false });
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
