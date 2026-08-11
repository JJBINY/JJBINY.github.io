import {
  loadAgentContent,
  loadPortfolioContent,
  loadPortfolioKnowledge
} from "./content.js";
import { AgentService } from "./agent/service.js";
import { readCurrentPageContext } from "./agent/page-context.js";
import { initializeDiagramAttachments } from "./agent/diagram-attachments.js";
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
    version = "beta:0.0.1",
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

  projects.forEach((project, index) => {
    const article = createElement("article", "project-card reveal-on-scroll");
    article.classList.add(index < 2 ? "project-card--flagship" : "project-card--supporting");
    article.dataset.projectId = project.id;

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
    project.scope.slice(0, index < 2 ? 3 : 2).forEach((item) => {
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
  let isResponding = false;
  let conversationVersion = 0;
  let activeController = null;
  let activeSourceId = null;
  let lastOpener = null;
  let traceEvents = 0;
  let finalTrace = null;
  let activeTraceId = null;
  const traceNodes = new Map();
  const traceDefinitions = [
    ["memory", "01", "Memory", "최근 대화와 관련 있는 과거 detail을 불러옵니다."],
    ["classify", "02", "Classify", "질문의 의도와 공개 범위를 판별합니다."],
    ["retrieve", "03", "Retrieve", "공개 지식 번들에서 어휘 seed를 찾습니다."],
    ["connect", "04", "Connect", "허용된 relation을 따라 연관 근거를 확장합니다."],
    ["generate", "05", "Generate", "선택된 근거 안에서 답변을 생성합니다."],
    ["ground", "06", "Source check", "근거 ID와 공개 범위 allowlist를 검증합니다."]
  ];

  providerBadge.textContent = agentService.providerLabel;
  providerNotice.textContent = agentService.providerNotice;
  providerSectionCopy.textContent = agentService.providerSectionCopy;
  document.body.dataset.interviewState = "closed";

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
        setProviderState({
          label: `LOCAL AI · ${model}`,
          status: "LOCAL AGENT · READY",
          notice: `${model} 로컬 모델이 공개 포트폴리오 근거 안에서 답변합니다. 응답 경로와 근거를 오른쪽에서 확인할 수 있습니다.`,
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

  function renderLiveTrace() {
    traceRoot.replaceChildren();

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
      header.append(
        createElement("strong", "", label),
        createElement("span", "trace-node__status", traceStatusLabel(state.status))
      );
      content.append(header, createElement("p", "", state.detail ?? caption));

      if (state.output && Object.keys(state.output).length) {
        const output = document.createElement("details");
        output.className = "trace-node__output";
        output.append(createElement("summary", "", "State output"));
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(state.output, null, 2);
        output.append(pre);
        content.append(output);
      }

      node.append(rail, content);
      list.append(node);
    });

    traceRoot.append(summary, list);

    if (finalTrace) {
      const metrics = createElement("section", "live-trace__metrics");
      metrics.append(createElement("strong", "live-trace__metrics-title", "Inference metrics"));
      const grid = createElement("div", "trace-metrics");
      [
        ["TTFT", Number.isFinite(finalTrace.timeToFirstTokenMs)
          ? formatLatency({ totalMs: finalTrace.timeToFirstTokenMs })
          : "—"],
        ["Total", formatLatency(finalTrace)],
        ["Prompt", Number.isFinite(finalTrace.promptTokens) ? `${finalTrace.promptTokens} tok` : "—"],
        ["Output", Number.isFinite(finalTrace.outputTokens) ? `${finalTrace.outputTokens} tok` : "—"],
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
    traceNodes.clear();
    traceEvents = 0;
    finalTrace = null;
    activeTraceId = null;
    traceEventCount.textContent = "0";
    renderLiveTrace();
  }

  function handleAgentEvent(event, payload) {
    if (event !== "stage" || !payload?.node) return;
    if (payload.traceId) activeTraceId = payload.traceId;
    traceEvents += 1;
    traceEventCount.textContent = String(traceEvents);
    traceNodes.set(payload.node, {
      status: payload.status ?? "running",
      detail: payload.detail,
      output: payload.output
    });
    renderLiveTrace();

    if (payload.status === "running") {
      setStage(payload.node.toUpperCase(), payload.detail);
    }
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
  }

  function markTraceError(message) {
    const running = [...traceNodes.entries()].find(([, state]) => state.status === "running");
    const node = running?.[0] ?? "generate";
    traceNodes.set(node, { status: "error", detail: message });
    renderLiveTrace();
  }

  function updateOpenControls(expanded) {
    $$('[data-open-agent]').forEach((button) => {
      button.setAttribute("aria-expanded", String(expanded));
    });
  }

  function setWorkspaceMode(mode) {
    workspace.dataset.mode = mode;
    document.body.dataset.interviewState = mode === "peek" ? "peek" : isResponding ? "responding" : activeSourceId ? "result" : "open";
    peekButton.setAttribute("aria-label", mode === "peek" ? "인터뷰 펼치기" : "인터뷰 최소화");
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

  function closeWorkspace() {
    workspace.hidden = true;
    workspace.dataset.mode = "full";
    document.body.dataset.interviewState = "closed";
    updateOpenControls(false);
    lastOpener?.focus({ preventScroll: true });
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

  function selectEvidence(sourceId, { scroll = true } = {}) {
    activeSourceId = sourceId;
    activateInspectorTab("evidence");
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
    selectEvidence(sources[0].id, { scroll: false });
  }

  function scrollToLatest() {
    requestAnimationFrame(() => {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    });
  }

  function appendMessage({ role, body = "", sources = [], trace = null, pending = false }) {
    const fragment = messageTemplate.content.cloneNode(true);
    const article = $(".message", fragment);
    const roleLabel = $("[data-message-role]", fragment);
    const time = $("[data-message-time]", fragment);
    const bodyElement = $("[data-message-body]", fragment);
    const sourcesElement = $("[data-message-sources]", fragment);
    const attachmentsElement = $("[data-message-attachments]", fragment);
    const traceElement = $("[data-message-trace]", fragment);

    article.classList.add(`message--${role}`);
    if (pending) article.classList.add("is-pending");
    roleLabel.textContent = role === "user" ? "YOU" : "JUBIN / AI";
    time.textContent = formatTime();
    bodyElement.textContent = body;

    renderMessageSources(sourcesElement, sources);
    diagramAttachments?.render(attachmentsElement, sources);

    if (trace) {
      $("pre", traceElement).textContent = JSON.stringify(trace, null, 2);
    } else {
      traceElement.hidden = true;
    }

    transcript.append(fragment);
    scrollToLatest();

    return {
      article: transcript.lastElementChild,
      body: $("[data-message-body]", transcript.lastElementChild),
      sources: $("[data-message-sources]", transcript.lastElementChild),
      attachments: $("[data-message-attachments]", transcript.lastElementChild),
      trace: $("[data-message-trace]", transcript.lastElementChild)
    };
  }

  function renderSuggestions(items) {
    suggestionsRoot.replaceChildren();
    suggestionsRoot.scrollLeft = 0;
    items.slice(0, 5).forEach((question) => {
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
    activeController?.abort();
    activeController = null;
    setBusy(false);
    if (clearSession) void agentService.resetSession();
    document.body.dataset.interviewState = workspace.hidden ? "closed" : "open";
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
    let streamed = "";

    try {
      const responsePromise = agentService.ask(question, (token) => {
        if (controller.signal.aborted || requestVersion !== conversationVersion) return;
        streamed += token;
        pending.body.textContent = streamed;
        pending.article.classList.remove("is-pending");
        scrollToLatest();
      }, controller.signal, handleAgentEvent, getPageContext?.());
      const response = await responsePromise;

      if (controller.signal.aborted || requestVersion !== conversationVersion) return;

      pending.article.classList.remove("is-pending");
      pending.body.textContent = response.answer;

      renderMessageSources(pending.sources, response.sources);
      diagramAttachments?.render(pending.attachments, response.sources);

      pending.trace.hidden = false;
      $("pre", pending.trace).textContent = JSON.stringify(response.trace, null, 2);
      finalizeLiveTrace(response.trace);
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
      } else if (response.trace?.provider === "ollama") {
        setProviderState({
          label: `LOCAL AI · ${response.trace.model ?? "OLLAMA"}`,
          status: "LOCAL AGENT · READY",
          provider: "ollama"
        });
      }

      renderSuggestions(response.followUps.length ? response.followUps : questions);
    } catch (error) {
      if (requestVersion !== conversationVersion) return;
      if (error?.name === "AbortError") {
        pending.article.classList.remove("is-pending");
        pending.article.classList.add("message--cancelled");
        pending.body.textContent = streamed.trim()
          ? `${streamed.trim()}\n\n(답변 생성이 취소되었습니다.)`
          : "답변 생성을 취소했습니다.";
        const runningNode = [...traceNodes.entries()].find(([, state]) => state.status === "running")?.[0];
        if (runningNode) {
          traceNodes.set(runningNode, {
            status: "cancelled",
            detail: "사용자가 답변 생성을 취소했습니다."
          });
          renderLiveTrace();
        }
        setStage("CANCELLED", "답변 생성을 취소했습니다.");
        renderSuggestions(questions);
        return;
      }
      pending.article.classList.remove("is-pending");
      pending.article.classList.add("message--error");
      pending.body.textContent =
        "응답 엔진에 연결하지 못했습니다. 일반 포트폴리오는 계속 살펴볼 수 있습니다. 잠시 후 다시 시도해주세요.";
      pending.trace.hidden = false;
      $("pre", pending.trace).textContent = error instanceof Error ? error.message : String(error);
      markTraceError(error instanceof Error ? error.message : String(error));
      setStage("ERROR", "답변 생성 중 오류가 발생했습니다.");
      if (!workspace.hidden) document.body.dataset.interviewState = "error";
      renderSuggestions(questions);
      console.error(error);
    } finally {
      if (activeController === controller) {
        activeController = null;
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
        input.focus({ preventScroll: true });
      }
    });
  });

  document.addEventListener("portfolio:open-agent", (event) => {
    openWorkspace();
    const question = event.detail?.question;
    if (typeof question === "string") {
      input.value = question.slice(0, input.maxLength);
      input.dispatchEvent(new Event("input"));
      input.focus({ preventScroll: true });
    }
  });

  $("[data-close-agent]").addEventListener("click", closeWorkspace);
  peekButton.addEventListener("click", togglePeek);
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
      closeWorkspace();
    }
  });

  resetConversation({ clearSession: false });
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

  const explorer = initializePortfolioExplorer({
    projects: portfolioContent.projects,
    knowledge,
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
      systemPrompt: agentContent.systemPrompt
    });
    const diagramAttachments = initializeDiagramAttachments({
      projects: portfolioContent.projects,
      dialog: $("[data-diagram-dialog]"),
      renderDiagram: renderMermaid,
      fallbackFocus: () => $("[data-agent-input]")
    });
    initializeAgent({
      agentService,
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
