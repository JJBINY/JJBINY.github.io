import { renderKnowledgeFocusMap } from "./graph/knowledge-focus-map.js";
import { enhanceProjectDocument } from "./document-visualizations.js";

const KNOWLEDGE_CATEGORIES = [
  {
    id: "projects",
    label: "Projects",
    title: "프로젝트와 전달 범위",
    description: "어떤 문제를 맡았고 어디까지 구현했는지 프로젝트 단위로 확인합니다.",
    kinds: ["project", "personal-project"]
  },
  {
    id: "architecture",
    label: "Architecture & flow",
    title: "아키텍처와 실행 흐름",
    description: "LLM, 런타임, 도구와 배포 경계를 어떤 기준으로 나눴는지 확인합니다.",
    kinds: ["architecture-decision", "implementation", "deployment", "platform-capability"]
  },
  {
    id: "knowledge",
    label: "Knowledge & retrieval",
    title: "지식 모델과 검색",
    description: "문서 구조, 검색, 그래프와 지식 신뢰 상태를 다루는 설계 근거입니다.",
    kinds: ["knowledge-model", "document-ai", "knowledge-system", "safety-architecture", "capability"]
  },
  {
    id: "reliability",
    label: "Reliability & evaluation",
    title: "신뢰성과 평가",
    description: "출처 검증, 실패 상태, 평가 방법과 공개 가능한 결과를 분리해 봅니다.",
    kinds: ["reliability-pattern", "evaluation", "evidence", "outcome"]
  },
  {
    id: "principles",
    label: "Profile & principles",
    title: "배경, 원칙과 한계",
    description: "경력 사실과 개인 원칙, 아직 검증하지 못한 경계를 함께 공개합니다.",
    kinds: ["profile", "background", "principle", "limitation"]
  }
];

const LANDING_ANCHORS = new Set(["", "profile", "experience", "work", "interview"]);

const RECORD_LABELS = Object.freeze({
  "architecture-decision": "아키텍처 판단",
  implementation: "구현 기록",
  deployment: "배포 구조",
  "platform-capability": "플랫폼 역량",
  "knowledge-model": "지식 모델",
  "document-ai": "Document AI",
  "knowledge-system": "지식 시스템",
  "safety-architecture": "안전 경계",
  "reliability-pattern": "신뢰성 설계",
  evaluation: "평가 방법",
  evidence: "검증 자료",
  outcome: "확인된 결과",
  limitation: "한계",
  capability: "역량",
  principle: "설계 원칙",
  project: "프로젝트"
});

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createLink(className, text, href) {
  const link = createElement("a", className, text);
  link.href = href;
  return link;
}

function categoryForNode(node) {
  return KNOWLEDGE_CATEGORIES.find((category) => category.kinds.includes(node?.kind))
    ?? KNOWLEDGE_CATEGORIES[2];
}

function routeForCase(projectId, tab = "overview") {
  return `#case/${encodeURIComponent(projectId)}/${encodeURIComponent(tab)}`;
}

function routeForCaseRecord(projectId, tab, nodeId) {
  return `${routeForCase(projectId, tab)}/record/${encodeURIComponent(nodeId)}`;
}

export function routeForEvidence(nodeId) {
  return `#evidence/${encodeURIComponent(nodeId)}`;
}

function projectIdForRootNode(node) {
  const projectId = node?.kind === "project" || node?.kind === "personal-project"
    ? node.projectIds?.[0]
    : null;
  return typeof projectId === "string" ? projectId : null;
}

function isProjectRootNode(node, projects) {
  return projects.some(({ knowledgeNodeId }) => knowledgeNodeId === node?.id);
}

function routeForNode(node) {
  const projectId = projectIdForRootNode(node);
  return projectId ? routeForCase(projectId, "overview") : routeForEvidence(node.id);
}

function routeForKnowledge(categoryId = "projects") {
  return `#knowledge/${encodeURIComponent(categoryId)}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseRoute(hash = window.location.hash) {
  const raw = hash.replace(/^#/, "");
  const parts = raw.split("/").map(safeDecode);

  if (parts[0] === "case") {
    return {
      type: "case",
      projectId: parts[1] ?? "",
      tab: parts[2] ?? "overview",
      recordId: parts[3] === "record" ? parts.slice(4).join("/") : ""
    };
  }
  if (parts[0] === "knowledge") {
    return { type: "knowledge", categoryId: parts[1] ?? "projects" };
  }
  if (parts[0] === "evidence") {
    return { type: "evidence", nodeId: parts.slice(1).join("/") };
  }

  return { type: "landing", anchor: LANDING_ANCHORS.has(raw) ? raw : "profile" };
}

function sourceProjectId(node, projects, edges) {
  const explicitProject = projects.find((project) => node?.projectIds?.includes?.(project.id));
  if (explicitProject) return explicitProject.id;
  const href = node?.source?.href ?? "";
  const hrefProject = projects.find((project) => href.startsWith(`#${project.id}`));
  if (hrefProject) return hrefProject.id;

  const rootProject = projects.find(({ knowledgeNodeId }) => knowledgeNodeId === node?.id);
  if (rootProject) return rootProject.id;
  for (const edge of edges) {
    const targetProject = projects.find(({ knowledgeNodeId }) => knowledgeNodeId === edge.to);
    if (edge.from === node?.id && targetProject) {
      return targetProject.id;
    }
    const sourceProject = projects.find(({ knowledgeNodeId }) => knowledgeNodeId === edge.from);
    if (edge.to === node?.id && sourceProject) {
      return sourceProject.id;
    }
  }
  return null;
}

function evidenceForProject(project, nodes, edges, projects) {
  return nodes.filter((node) => (
    sourceProjectId(node, projects, edges) === project.id
    && !isProjectRootNode(node, projects)
  ));
}

function projectTabForNode(node) {
  if (["evidence", "outcome", "evaluation", "reliability-pattern"].includes(node.kind)) return "evidence";
  if (["limitation"].includes(node.kind)) return "limits";
  if ([
    "architecture-decision",
    "implementation",
    "deployment",
    "platform-capability",
    "knowledge-model",
    "document-ai",
    "safety-architecture",
    "knowledge-system"
  ].includes(node.kind)) return "architecture";
  return "overview";
}

function appendTags(root, tags = []) {
  if (!tags.length) return;
  const container = createElement("div", "detail-tags");
  tags.forEach((tag) => container.append(createElement("span", "", tag)));
  root.append(container);
}

function appendBreadcrumb(root, items) {
  const nav = createElement("nav", "detail-breadcrumb");
  nav.setAttribute("aria-label", "현재 위치");
  items.forEach((item, index) => {
    if (index > 0) nav.append(createElement("span", "detail-breadcrumb__separator", "›"));
    if (item.href) nav.append(createLink("", item.label, item.href));
    else {
      const current = createElement("span", "detail-breadcrumb__current", item.label);
      current.setAttribute("aria-current", "page");
      nav.append(current);
    }
  });
  root.append(nav);
}

function appendRouteTabs(root, tabs, activeId, label) {
  const nav = createElement("nav", "case-nav");
  nav.setAttribute("aria-label", label);
  let activeLink = null;
  tabs.forEach((tab) => {
    const link = createLink("case-nav__item", "", tab.href);
    const active = tab.id === activeId;
    if (active) {
      link.setAttribute("aria-current", "page");
      activeLink = link;
    }
    link.append(
      createElement("strong", "", tab.label),
      createElement("span", "", tab.description)
    );
    nav.append(link);
  });
  root.append(nav);
  if (activeLink) {
    window.requestAnimationFrame(() => {
      const left = activeLink.offsetLeft - ((nav.clientWidth - activeLink.clientWidth) / 2);
      nav.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    });
  }
}

function appendEvidenceCard(root, node, {
  compact = false,
  projectId = null,
  tab = projectTabForNode(node)
} = {}) {
  const href = projectId
    ? routeForCaseRecord(projectId, tab, node.id)
    : routeForNode(node);
  const link = createLink("knowledge-record", "", href);
  if (compact) link.classList.add("knowledge-record--compact");

  const header = createElement("header", "knowledge-record__header");
  header.append(
    createElement("span", "knowledge-record__kind", RECORD_LABELS[node.kind] ?? node.kind),
    createElement("span", "knowledge-record__status", node.status ?? "source-backed")
  );
  link.append(header, createElement("h3", "", node.title));
  link.append(createElement("p", "", node.summary ?? node.answer));
  const footer = createElement("footer");
  footer.append(
    createElement("span", "", node.authority ?? "supporting"),
    createElement("span", "", projectIdForRootNode(node) ? "프로젝트 열기 ↗" : "기록 열기 ↗")
  );
  link.append(footer);
  root.append(link);
}

function createEvidenceAskButton(node) {
  const button = createElement("button", "button button--secondary", "AI에게 이 근거 질문하기 ↗");
  button.type = "button";
  button.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("portfolio:open-agent", {
      detail: { question: `${node.title}에 대해 구체적으로 설명해주세요.` }
    }));
  });
  return button;
}

function renderProjectOverview(panel, project, evidence) {
  const layout = createElement("div", "project-overview-grid");
  const responsibility = createElement("section", "detail-surface");
  responsibility.append(createElement("p", "detail-kicker", "RESPONSIBILITY"));
  const list = document.createElement("ol");
  project.scope.forEach((item, index) => {
    const row = document.createElement("li");
    row.append(
      createElement("span", "", String(index + 1).padStart(2, "0")),
      document.createTextNode(item)
    );
    list.append(row);
  });
  responsibility.append(list);

  const evidenceMap = createElement("section", "detail-surface detail-evidence-map");
  evidenceMap.append(
    createElement("p", "detail-kicker", "CASE READING PATH"),
    createElement("strong", "", "이 사례를 읽는 순서"),
    createElement("p", "", "전체 구조를 먼저 이해한 뒤 필요한 주장과 출처만 깊게 확인할 수 있습니다.")
  );
  const path = createElement("ol", "case-reading-path");
  [
    ["01", "요약", "문제와 담당 범위"],
    ["02", "구조와 흐름", "전체 아키텍처와 읽는 순서"],
    ["03", "근거 기록", `${evidence.length}개 주장·출처 기록`],
    ["04", "결과와 한계", "현재 말할 수 있는 범위"]
  ].forEach(([step, title, description]) => {
    const item = document.createElement("li");
    item.append(
      createElement("span", "", step),
      createElement("strong", "", title),
      createElement("small", "", description)
    );
    path.append(item);
  });
  evidenceMap.append(path);
  layout.append(responsibility, evidenceMap);

  const outcome = createElement("aside", "project-detail-outcome");
  outcome.append(
    createElement("p", "detail-kicker", project.resultLabel),
    createElement("blockquote", "", project.result),
    createElement("small", "", project.note)
  );
  panel.append(layout, outcome);
}

function renderProjectArchitecture(panel, project, renderDiagram) {
  const diagrams = project.diagrams ?? [];
  diagrams.forEach((diagram) => {
    const article = createElement("article", "diagram-section");
    const header = createElement("header", "diagram-section__header");
    const copy = createElement("div");
    copy.append(
      createElement("p", "detail-kicker", "SYSTEM VIEW"),
      createElement("h2", "", diagram.title),
      createElement("p", "diagram-section__question", diagram.question ?? diagram.description)
    );
    const takeaway = createElement("aside", "diagram-takeaway");
    takeaway.append(
      createElement("span", "", "핵심"),
      createElement("strong", "", diagram.takeaway ?? diagram.description)
    );
    header.append(copy, takeaway);
    const figure = createElement("figure", "mermaid-surface mermaid-surface--architecture");
    figure.dataset.diagramId = `${project.id}-${diagram.id}`;
    figure.setAttribute("aria-label", diagram.title);
    const caption = createElement("figcaption", "diagram-caption", diagram.description);
    const guide = createElement("section", "diagram-reading-guide");
    guide.append(createElement("h3", "", "그림을 읽는 순서"));
    const guideList = createElement("ol", "");
    (diagram.readingGuide ?? []).forEach((step) => {
      const item = document.createElement("li");
      item.append(
        createElement("span", "", step.step),
        createElement("strong", "", step.title),
        createElement("p", "", step.body)
      );
      guideList.append(item);
    });
    guide.append(guideList);
    if (diagram.scopeNote) {
      const scope = createElement("aside", "diagram-scope-note");
      scope.append(
        createElement("strong", "", "이 그림의 범위"),
        createElement("p", "", diagram.scopeNote)
      );
      guide.append(scope);
    }
    article.append(header, figure, caption, guide);
    panel.append(article);
    renderDiagram(figure, diagram.source, {
      id: `${project.id}-${diagram.id}`,
      label: diagram.title
    });
  });

  const decisions = createElement("section", "project-decision-list");
  decisions.append(createElement("p", "detail-kicker", "DESIGN DECISIONS"));
  const grid = createElement("div");
  project.decisions.forEach((decision) => {
    const item = createElement("article", "project-decision-record");
    item.id = decision.anchor;
    item.append(
      createElement("span", "", decision.step),
      createElement("h3", "", decision.title),
      createElement("p", "", decision.body)
    );
    grid.append(item);
  });
  decisions.append(grid);
  panel.append(decisions);
}

function evidenceChapter(node) {
  if (["architecture-decision", "implementation", "deployment", "platform-capability"].includes(node.kind)) {
    return { id: "system", title: "구조와 실행", description: "시스템 경계와 실행 흐름을 설명하는 기록" };
  }
  if (["knowledge-model", "document-ai", "knowledge-system", "safety-architecture", "capability"].includes(node.kind)) {
    return { id: "knowledge", title: "지식과 검색", description: "문서·검색·그래프의 구조를 설명하는 기록" };
  }
  return { id: "assurance", title: "검증과 한계", description: "신뢰성, 평가 방식과 아직 검증하지 못한 범위" };
}

function renderProjectEvidence(panel, project, evidence) {
  const intro = createElement("header", "detail-panel-heading");
  intro.append(
    createElement("p", "detail-kicker", "CLAIMS & SOURCES"),
    createElement("h2", "", "필요한 주장만 골라 깊게 확인하세요."),
    createElement("p", "", "각 기록은 답할 수 있는 주장과 출처를 보여줍니다. 지식그래프 연결은 기록 내부의 선택형 탐색 도구로 분리했습니다.")
  );
  panel.append(intro);
  const groups = new Map();
  evidence.forEach((node) => {
    const chapter = evidenceChapter(node);
    const group = groups.get(chapter.id) ?? { chapter, nodes: [] };
    group.nodes.push(node);
    groups.set(chapter.id, group);
  });
  groups.forEach(({ chapter, nodes }) => {
    const section = createElement("section", "evidence-chapter");
    const heading = createElement("header", "evidence-chapter__heading");
    heading.append(
      createElement("h3", "", chapter.title),
      createElement("p", "", chapter.description),
      createElement("span", "", `${nodes.length}개 기록`)
    );
    const grid = createElement("div", "knowledge-record-grid");
    nodes.forEach((node) => appendEvidenceCard(grid, node, {
      projectId: project.id,
      tab: "evidence"
    }));
    section.append(heading, grid);
    panel.append(section);
  });
}

const LEGACY_PROJECT_SECTIONS = Object.freeze({
  overview: "overview",
  architecture: "architecture",
  evidence: "evidence",
  limits: "implementation",
  verification: "implementation"
});

function resolveProjectSection(project, requestedId) {
  const sectionId = LEGACY_PROJECT_SECTIONS[requestedId] ?? requestedId;
  return project.sections.find(({ id }) => id === sectionId) ?? project.sections[0];
}

function appendTextList(root, items, className = "project-story-list") {
  if (!Array.isArray(items) || items.length === 0) return;
  const list = createElement("ul", className);
  items.forEach((item) => list.append(createElement("li", "", item)));
  root.append(list);
}

function appendProjectDiagram(root, project, diagram, renderDiagram) {
  const article = createElement("article", "project-story-diagram");
  const header = createElement("header", "project-story-diagram__header");
  header.append(
    createElement("p", "detail-kicker", diagram.label),
    createElement("h3", "", diagram.title),
    createElement("p", "", diagram.question)
  );
  const takeaway = createElement("aside", "diagram-takeaway");
  takeaway.append(
    createElement("span", "", "핵심"),
    createElement("strong", "", diagram.takeaway)
  );
  header.append(takeaway);

  const figure = createElement(
    "figure",
    diagram.type === "svg"
      ? "project-svg-surface"
      : "mermaid-surface mermaid-surface--architecture"
  );
  figure.dataset.diagramId = `${project.id}-${diagram.id}`;
  figure.setAttribute("aria-label", diagram.alt ?? diagram.title);
  if (diagram.type === "svg") {
    const image = document.createElement("img");
    image.src = diagram.src;
    image.alt = diagram.alt;
    image.loading = "lazy";
    image.decoding = "async";
    figure.append(image);
  } else {
    renderDiagram(figure, diagram.source, {
      id: `${project.id}-${diagram.id}`,
      label: diagram.title
    });
  }
  figure.append(createElement("figcaption", "diagram-caption", diagram.caption ?? diagram.description));

  const guide = createElement("ol", "project-diagram-guide");
  diagram.readingGuide.forEach((step) => {
    const item = document.createElement("li");
    item.append(
      createElement("span", "", step.step),
      createElement("strong", "", step.title),
      createElement("p", "", step.body)
    );
    guide.append(item);
  });
  const scope = createElement("aside", "diagram-scope-note");
  scope.append(
    createElement("strong", "", "이 그림의 범위"),
    createElement("p", "", diagram.scopeNote)
  );
  article.append(header, figure, guide, scope);
  root.append(article);
}

function appendTechnologyGroups(root, technologies = []) {
  if (!technologies.length) return;
  const section = createElement("section", "project-technology-groups");
  section.append(createElement("h3", "", "기술 구성"));
  const grid = createElement("div", "");
  technologies.forEach((group) => {
    const item = createElement("article", "");
    item.append(createElement("span", "", group.label));
    appendTextList(item, group.items, "project-technology-list");
    grid.append(item);
  });
  section.append(grid);
  root.append(section);
}

function renderProjectStorySection(root, project, section, evidence, context) {
  const article = createElement("article", "project-story-section");
  article.id = `project-section-${section.id}`;
  article.dataset.projectSectionId = section.id;

  const header = createElement("header", "project-story-section__header");
  header.append(
    createElement("p", "detail-kicker", section.eyebrow),
    createElement("h2", "", section.title)
  );
  if (section.summary) header.append(createElement("p", "project-story-section__summary", section.summary));
  article.append(header);

  (section.paragraphs ?? []).forEach((paragraph) => {
    article.append(createElement("p", "project-story-section__paragraph", paragraph));
  });

  if (section.facts?.length) {
    const facts = createElement("dl", "project-story-facts");
    section.facts.forEach((fact) => {
      const item = createElement("div", "");
      item.append(createElement("dt", "", fact.label), createElement("dd", "", fact.value));
      facts.append(item);
    });
    article.append(facts);
  }

  appendTextList(article, section.bullets);

  if (section.designDetails?.length) {
    const details = createElement("aside", "project-design-details");
    details.append(createElement("h3", "", "설계 문서에서 확인한 세부 기준"));
    appendTextList(details, section.designDetails);
    article.append(details);
  }

  const diagramById = new Map(project.diagrams.map((diagram) => [diagram.id, diagram]));
  (section.diagramIds ?? []).forEach((diagramId) => {
    const diagram = diagramById.get(diagramId);
    if (diagram) appendProjectDiagram(article, project, diagram, context.renderDiagram);
  });

  const sectionEvidence = (section.evidenceNodeIds ?? [])
    .map((id) => context.nodeById.get(id))
    .filter((node) => node && evidence.includes(node));
  if (sectionEvidence.length) {
    const evidenceSection = createElement("section", "project-story-evidence");
    const heading = createElement("header", "project-story-evidence__header");
    heading.append(
      createElement("span", "", "PUBLIC CLAIMS"),
      createElement("h3", "", "이 섹션의 공개 근거 기록"),
      createElement("p", "", "답변과 설계 판단을 지지하는 공개 portfolio·design 근거입니다.")
    );
    const grid = createElement("div", "knowledge-record-grid");
    sectionEvidence.forEach((node) => appendEvidenceCard(grid, node, {
      projectId: project.id,
      tab: section.id
    }));
    evidenceSection.append(heading, grid);
    article.append(evidenceSection);
  }

  if (section.id === "implementation") appendTechnologyGroups(article, project.technologies);
  root.append(article);
}

function parseProjectDocument(project) {
  if (typeof project.documentHtml !== "string" || !project.documentHtml.trim()) return null;
  const template = document.createElement("template");
  template.innerHTML = project.documentHtml;
  const article = template.content.querySelector("article.project-document");
  const unsafe = template.content.querySelector(
    "script, iframe, object, embed, foreignObject, [onload], [onclick], [onerror]"
  );
  if (!article || unsafe || article.dataset.projectDocumentId !== project.id) return null;
  return article;
}

function insertDocumentMermaid(article, project, renderDiagram) {
  const diagram = project.diagrams.find(({ type }) => type === "mermaid");
  if (!diagram) return;
  const section = project.sections.find(({ diagramIds }) => diagramIds?.includes(diagram.id));
  const heading = section ? article.querySelector(`#project-section-${section.id}`) : null;
  if (!heading) return;

  const figure = createElement("figure", "project-document__figure project-document__figure--mermaid");
  const canvas = createElement("div", "project-document__mermaid");
  const caption = createElement("figcaption", "", diagram.caption ?? diagram.description);
  figure.append(canvas, caption);
  heading.insertAdjacentElement("afterend", figure);
  renderDiagram(canvas, diagram.source, {
    id: `${project.id}-${diagram.id}`,
    label: diagram.alt ?? diagram.title
  });
}

function renderProjectDocument(root, project, activeSection, context) {
  const article = parseProjectDocument(project);
  if (!article) {
    renderNotFound(root, "프로젝트 문서를 불러오지 못했습니다.", "Selected work에서 다른 사례를 선택해주세요.");
    return;
  }

  const toolbar = createElement("div", "project-document-toolbar");
  toolbar.append(createElement("span", "", "PORTFOLIO.MD · PUBLIC DOCUMENT"));

  const layout = createElement("div", "project-route-shell");
  const toc = createElement("nav", "project-document-toc");
  toc.setAttribute("aria-label", "프로젝트 문서 목차");
  toc.append(createElement("p", "", "이 문서에서"));
  const list = document.createElement("ol");
  project.sections.forEach((section, index) => {
    const item = document.createElement("li");
    const link = createLink("", "", routeForCase(project.id, section.id));
    if (section.id === activeSection.id) link.setAttribute("aria-current", "page");
    link.append(
      createElement("span", "", String(index + 1).padStart(2, "0")),
      createElement("strong", "", section.documentHeading)
    );
    item.append(link);
    list.append(item);
  });
  toc.append(list);

  const content = createElement("div", "project-route-content");
  const paper = createElement("div", "project-document-paper");
  paper.append(article);
  content.append(toolbar, paper);
  layout.append(toc, content);
  root.append(layout);
  insertDocumentMermaid(article, project, context.renderDiagram);
  enhanceProjectDocument(article, project);
  window.requestAnimationFrame(() => {
    const activeLink = toc.querySelector("[aria-current='page']");
    if (!activeLink || list.scrollWidth <= list.clientWidth) return;
    const left = activeLink.offsetLeft - ((list.clientWidth - activeLink.clientWidth) / 2);
    list.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  });
}

function renderProjectDetail(root, project, requestedSectionId, context, recordId = "") {
  const activeSection = resolveProjectSection(project, requestedSectionId);

  const breadcrumb = [
    { label: "포트폴리오", href: "#profile" },
    { label: "Selected work", href: "#work" },
    activeSection.id === "overview"
      ? { label: project.title }
      : { label: project.title, href: routeForCase(project.id, "overview") }
  ];
  if (activeSection.id !== "overview") breadcrumb.push({ label: activeSection.documentHeading });
  appendBreadcrumb(root, breadcrumb);

  const panel = createElement("div", "detail-panel");
  if (recordId) {
    panel.classList.add("detail-panel--record");
    const record = context.nodeById.get(recordId);
    if (record) {
      renderEvidenceDetail(panel, record, context, {
        embeddedProject: project,
        returnTab: activeSection.id,
        showBreadcrumb: false
      });
    } else {
      renderNotFound(panel, "기록을 찾을 수 없습니다.", "프로젝트 챕터로 돌아가 다른 기록을 선택해주세요.");
    }
  } else {
    panel.classList.add("detail-panel--document");
    renderProjectDocument(panel, project, activeSection, context);
  }
  root.append(panel);
  appendProjectPager(root, project, context.projects);
}

function appendProjectPager(root, project, projects) {
  const index = projects.findIndex((item) => item.id === project.id);
  const previous = index > 0 ? projects[index - 1] : null;
  const next = index >= 0 && index < projects.length - 1 ? projects[index + 1] : null;
  const pager = createElement("nav", "project-pager");
  pager.setAttribute("aria-label", "다른 프로젝트 탐색");

  if (previous) {
    const link = createLink("project-pager__project", "", routeForCase(previous.id, "overview"));
    link.append(
      createElement("span", "", "← 이전 사례"),
      createElement("strong", "", previous.title)
    );
    pager.append(link);
  } else {
    pager.append(createLink("project-pager__home", "← Selected work", "#work"));
  }

  if (next) {
    const link = createLink("project-pager__project project-pager__project--next", "", routeForCase(next.id, "overview"));
    link.append(
      createElement("span", "", "다음 사례 →"),
      createElement("strong", "", next.title)
    );
    pager.append(link);
  } else {
    pager.append(createLink("project-pager__home project-pager__home--next", "Selected work로 돌아가기 →", "#work"));
  }
  root.append(pager);
}

function renderKnowledgeExplorer(root, activeCategoryId, context) {
  const activeCategory = KNOWLEDGE_CATEGORIES.find((category) => category.id === activeCategoryId)
    ?? KNOWLEDGE_CATEGORIES[0];
  const visibleNodes = context.nodes.filter((node) => activeCategory.kinds.includes(node.kind));

  appendBreadcrumb(root, [
    { label: "Home", href: "#profile" },
    { label: "Knowledge explorer" }
  ]);

  const hero = createElement("header", "knowledge-hero");
  const copy = createElement("div");
  copy.append(
    createElement("p", "detail-kicker", "PUBLIC KNOWLEDGE BASE"),
    createElement("h1", "", activeCategory.title),
    createElement("p", "", activeCategory.description)
  );
  const stats = createElement("aside", "knowledge-hero__stats");
  stats.append(
    createElement("strong", "", String(context.nodes.length).padStart(2, "0")),
    createElement("span", "", "PUBLIC NODES"),
    createElement("strong", "", String(context.edges.length).padStart(2, "0")),
    createElement("span", "", "TYPED RELATIONS")
  );
  hero.append(copy, stats);
  root.append(hero);

  appendRouteTabs(
    root,
    KNOWLEDGE_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      description: category.title,
      href: routeForKnowledge(category.id)
    })),
    activeCategory.id,
    "지식 유형"
  );

  const panel = createElement("div", "detail-panel");
  const groups = new Map();
  visibleNodes.forEach((node) => {
    const list = groups.get(node.kind) ?? [];
    list.push(node);
    groups.set(node.kind, list);
  });
  groups.forEach((nodes, kind) => {
    const group = createElement("section", "knowledge-kind-group");
    const heading = createElement("header");
    heading.append(
      createElement("h2", "", RECORD_LABELS[kind] ?? kind.replaceAll("-", " ")),
      createElement("span", "", String(nodes.length).padStart(2, "0"))
    );
    const grid = createElement("div", "knowledge-record-grid");
    nodes.forEach((node) => appendEvidenceCard(grid, node));
    group.append(heading, grid);
    panel.append(group);
  });
  root.append(panel);
}

function diagramContextForNode(project, nodeId) {
  for (const diagram of project?.diagrams ?? []) {
    const record = diagram.contextByNodeId?.[nodeId];
    if (record) return { diagram, ...record };
  }
  return null;
}

function appendProvenance(root, node) {
  const provenance = createElement("section", "evidence-record-detail__provenance");
  provenance.append(
    createElement("p", "detail-kicker", "출처 확인"),
    createElement("h2", "", "어디에서 확인한 내용인가요?")
  );
  const sources = node.provenance?.sources ?? [];
  sources.forEach((source) => {
    const item = createElement("div", "provenance-record");
    item.append(
      createElement("strong", "", source.label),
      createElement("span", "", source.locator)
    );
    if (source.digest) {
      const integrity = document.createElement("details");
      integrity.append(
        createElement("summary", "", "무결성 식별자 보기"),
        createElement("code", "", `digest ${source.digest.slice(0, 12)}`)
      );
      item.append(integrity);
    }
    provenance.append(item);
  });
  if (!sources.length) {
    provenance.append(createElement("p", "provenance-empty", "공개 projection에 연결된 출처 기록이 없습니다."));
  }
  root.append(provenance);
}

function renderEvidenceDetail(root, node, context, {
  embeddedProject = null,
  returnTab = projectTabForNode(node),
  showBreadcrumb = true
} = {}) {
  const category = categoryForNode(node);
  const neighborRecords = context.edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .map((edge) => ({
      edge,
      node: context.nodeById.get(edge.from === node.id ? edge.to : edge.from)
    }))
    .filter((record) => record.node && !isProjectRootNode(record.node, context.projects));
  const projectId = embeddedProject?.id ?? sourceProjectId(node, context.projects, context.edges);
  const project = embeddedProject ?? context.projects.find((item) => item.id === projectId);
  const returnSectionLabel = project?.sections?.find(({ id }) => id === returnTab)?.title
    ?? LEGACY_PROJECT_SECTIONS[returnTab]
    ?? returnTab;
  const visualContext = diagramContextForNode(project, node.id);

  if (showBreadcrumb) {
    const items = [
      { label: "포트폴리오", href: "#profile" },
      { label: "Selected work", href: "#work" }
    ];
    if (project) {
      items.push(
        { label: project.title, href: routeForCase(project.id, "overview") },
        { label: returnSectionLabel, href: routeForCase(project.id, returnTab) }
      );
    } else {
      items.push({ label: category.title, href: routeForKnowledge(category.id) });
    }
    items.push({ label: node.title });
    appendBreadcrumb(root, items);
  }

  if (project) {
    const returnBar = createElement("aside", "route-context-bar");
    returnBar.append(createLink(
      "route-context-bar__back",
      `← ${project.title} · ${returnSectionLabel}`,
      routeForCase(project.id, returnTab)
    ));
    const location = createElement("div");
    location.append(
      createElement("span", "", "현재 위치"),
      createElement("strong", "", `${returnSectionLabel} / ${node.title}`)
    );
    returnBar.append(location);
    root.append(returnBar);
  }

  const record = createElement("article", "evidence-record-detail");
  const header = createElement("header", "evidence-record-detail__header");
  const meta = createElement("div", "evidence-record-detail__meta");
  [node.kind, node.status, node.authority].filter(Boolean).forEach((value) => {
    meta.append(createElement("span", "", RECORD_LABELS[value] ?? value));
  });
  header.append(
    createElement("p", "detail-kicker", RECORD_LABELS[node.kind] ?? "검토 가능한 기록"),
    createElement("h1", "", node.title),
    createElement("p", "evidence-record-detail__summary", node.summary ?? ""),
    meta
  );
  const claim = createElement("section", "evidence-record-detail__claim");
  claim.append(
    createElement("p", "detail-kicker", "이 기록으로 답할 수 있는 것"),
    createElement("h2", "", "확인 가능한 주장"),
    createElement("p", "", node.answer),
    createEvidenceAskButton(node)
  );
  record.append(header, claim);
  appendProvenance(record, node);

  if (project && visualContext) {
    const contextCard = createElement("section", "evidence-project-context");
    contextCard.append(
      createElement("p", "detail-kicker", "프로젝트 안에서의 위치"),
      createElement("span", "evidence-project-context__stage", visualContext.stage),
      createElement("h2", "", visualContext.diagram.title),
      createElement("p", "", visualContext.body),
      createLink("quiet-link", "전체 아키텍처와 설명 보기 →", routeForCase(project.id, "architecture"))
    );
    record.append(contextCard);
  }
  root.append(record);

  if (!neighborRecords.length) return;
  const related = createElement("section", "related-evidence");
  const relatedHeader = createElement("header", "related-evidence__header");
  relatedHeader.append(
    createElement("h2", "", "함께 읽으면 좋은 기록"),
    createElement("p", "", "같은 프로젝트나 설계 판단을 이해하는 데 도움이 되는 인접 기록입니다.")
  );
  const grid = createElement("div", "knowledge-record-grid");
  neighborRecords.slice(0, 4).forEach(({ node: neighbor }) => {
    const neighborProjectId = sourceProjectId(neighbor, context.projects, context.edges);
    appendEvidenceCard(grid, neighbor, {
      compact: true,
      projectId: neighborProjectId === project?.id ? project.id : null,
      tab: returnTab
    });
  });
  related.append(relatedHeader, grid);
  root.append(related);

  const graphSection = createElement("details", "knowledge-map-disclosure");
  const graphSummary = createElement("summary", "");
  graphSummary.append(
    createElement("strong", "", "지식 연결 지도 열기"),
    createElement("span", "", "선택형 2D 탐색 · 근거 본문과 분리")
  );
  const graphIntro = createElement("div", "knowledge-map-disclosure__intro");
  graphIntro.append(
    createElement("h2", "", "현재 기록을 중심으로 연결된 개념"),
    createElement("p", "", "공개 지식그래프의 1단계 연결을 탐색하는 도구입니다. 실제 답변에 사용된 검색 경로는 AI 인터뷰의 실행 관측에서 확인합니다.")
  );
  const graph = createElement("div", "knowledge-focus-map");
  graphSection.append(graphSummary, graphIntro, graph);
  root.append(graphSection);
  graphSection.addEventListener("toggle", () => {
    if (!graphSection.open || graph.dataset.graphState === "rendered") return;
    renderKnowledgeFocusMap(graph, {
      centerNode: node,
      neighborRecords,
      hrefForNode: (targetNode) => {
        if (targetNode.id === node.id) return window.location.hash;
        const targetRecord = context.nodeById.get(targetNode.id) ?? targetNode;
        const targetProjectId = sourceProjectId(targetRecord, context.projects, context.edges);
        return project && targetProjectId === project.id
          ? routeForCaseRecord(project.id, returnTab, targetNode.id)
          : routeForNode(targetRecord);
      }
    });
  });
}

function renderNotFound(root, title, description) {
  const empty = createElement("div", "detail-not-found");
  empty.append(
    createElement("p", "detail-kicker", "NOT FOUND"),
    createElement("h1", "", title),
    createElement("p", "", description),
    createLink("button button--secondary", "포트폴리오 홈으로", "#profile")
  );
  root.append(empty);
}

function fallbackDiagramRenderer(target, source) {
  const pre = createElement("pre", "mermaid-fallback");
  const code = createElement("code", "");
  code.textContent = source;
  pre.append(code);
  target.append(pre);
}

export function initializePortfolioExplorer({ projects, knowledge, renderDiagram = fallbackDiagramRenderer }) {
  const detailRoot = document.querySelector("[data-portfolio-detail]");
  const landingSections = [...document.querySelectorAll("[data-landing-section]")];
  const nodes = knowledge?.nodes ?? [];
  const edges = knowledge?.edges ?? [];
  const context = {
    projects,
    nodes,
    edges,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    renderDiagram
  };
  let lastRouteKey = null;

  function setLandingVisible(visible) {
    landingSections.forEach((section) => {
      section.hidden = !visible;
    });
    detailRoot.hidden = visible;
  }

  function routeKey(route) {
    return JSON.stringify(route);
  }

  function renderCurrentRoute({ preserveScroll = false } = {}) {
    const route = parseRoute();
    const key = routeKey(route);
    const routeChanged = key !== lastRouteKey;
    lastRouteKey = key;

    if (route.type === "landing") {
      setLandingVisible(true);
      document.body.dataset.portfolioRoute = "landing";
      detailRoot.replaceChildren();
      const anchor = route.anchor || "profile";
      window.requestAnimationFrame(() => {
        document.getElementById(anchor)?.scrollIntoView({
          behavior: preserveScroll ? "auto" : "smooth",
          block: "start"
        });
      });
      return;
    }

    setLandingVisible(false);
    detailRoot.replaceChildren();
    document.body.dataset.portfolioRoute = route.type;

    if (route.type === "case") {
      const project = projects.find((item) => item.id === route.projectId);
      if (project) {
        renderProjectDetail(detailRoot, project, route.tab, context, route.recordId);
        if (!route.recordId) {
          const activeSection = resolveProjectSection(project, route.tab);
          window.requestAnimationFrame(() => {
            const target = activeSection.id === "overview"
              ? detailRoot.querySelector(".project-document-paper")
              : document.getElementById(`project-section-${activeSection.id}`);
            target?.scrollIntoView({
              behavior: "auto",
              block: "start"
            });
          });
        }
      }
      else renderNotFound(detailRoot, "프로젝트를 찾을 수 없습니다.", "Selected work에서 다른 사례를 선택해주세요.");
    }

    if (route.type === "knowledge") {
      renderKnowledgeExplorer(detailRoot, route.categoryId, context);
    }

    if (route.type === "evidence") {
      const node = context.nodeById.get(route.nodeId);
      const canonicalProjectId = context.projects.find(({ knowledgeNodeId }) => knowledgeNodeId === node?.id)?.id;
      if (canonicalProjectId) {
        const canonicalRoute = routeForCase(canonicalProjectId, "overview");
        window.history.replaceState(null, "", canonicalRoute);
        renderCurrentRoute({ preserveScroll });
        return;
      }
      if (node) renderEvidenceDetail(detailRoot, node, context);
      else renderNotFound(detailRoot, "근거 기록을 찾을 수 없습니다.", "공개 지식 번들이 갱신됐을 수 있습니다.");
    }

    if (routeChanged && !preserveScroll) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function openEvidence(nodeId) {
    const node = context.nodeById.get(nodeId);
    const canonicalProjectId = context.projects.find(({ knowledgeNodeId }) => knowledgeNodeId === node?.id)?.id;
    const relatedProjectId = node ? sourceProjectId(node, projects, edges) : null;
    const next = canonicalProjectId
      ? routeForCase(canonicalProjectId, "overview")
      : relatedProjectId
        ? routeForCaseRecord(relatedProjectId, projectTabForNode(node), nodeId)
        : routeForEvidence(nodeId);
    if (window.location.hash === next) renderCurrentRoute({ preserveScroll: true });
    else window.location.hash = next;
    return true;
  }

  window.addEventListener("hashchange", () => renderCurrentRoute());
  renderCurrentRoute({ preserveScroll: true });

  return { openEvidence, renderCurrentRoute };
}

export function projectDetailRoute(projectId, tab = "overview") {
  return routeForCase(projectId, tab);
}
