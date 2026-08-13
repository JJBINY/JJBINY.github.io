const CURRENT_PAGE_TERMS = /(?:이|해당|현재|지금\s*보는)\s*(?:프로젝트|페이지|섹션)|여기(?:에서|의)?/;
const NAVIGATION_TERMS = /(?:이동|열어|보여|가고\s*싶|살펴보)/;
const PROJECT_LIST_TERMS = /(?:다른\s*)?프로젝트(?:\s*(?:목록|리스트))?/;

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function projectAliases(project) {
  const aliases = [project.title, project.id, project.subtitle];
  if (project.id === "steel-domain-agent") aliases.push("철강", "steel", "스틸");
  if (project.id === "multimodal-document-intelligence") aliases.push("멀티모달", "multimodal", "rag 검색", "문서 검색");
  if (project.id === "personal-agent-harness") aliases.push("하네스", "harness", "personal agent");
  if (project.id === "portfolio-interview-agent") aliases.push("포트폴리오 에이전트", "interview agent");
  return aliases.map(normalize).filter((alias) => alias.length >= 2);
}

export function classifyQueryScope(question, pageContext, projects = []) {
  const normalized = normalize(question);
  const explicitProject = projects.find((project) => projectAliases(project).some((alias) => normalized.includes(alias)));
  if (explicitProject) return Object.freeze({ kind: "explicit-project", projectId: explicitProject.id });
  if (CURRENT_PAGE_TERMS.test(normalized) && pageContext) {
    return Object.freeze({ kind: "current-page", projectId: pageContext.routeType === "project-detail" ? pageContext.entityId : null });
  }
  return Object.freeze({ kind: "global", projectId: null });
}

export function createNavigationAction(question, projects = []) {
  const normalized = normalize(question);
  if (!NAVIGATION_TERMS.test(normalized)) return null;
  const explicitProject = projects.find((project) => projectAliases(project).some((alias) => normalized.includes(alias)));
  if (explicitProject) {
    return Object.freeze({
      type: "navigate",
      target: Object.freeze({ kind: "project", projectId: explicitProject.id, sectionId: "overview" }),
      label: `${explicitProject.title}로 이동`,
      delayMs: 3_000,
      cancellable: true
    });
  }
  if (!PROJECT_LIST_TERMS.test(normalized)) return null;
  return Object.freeze({
    type: "navigate",
    target: Object.freeze({ kind: "landing", anchor: "work" }),
    label: "프로젝트 목록으로 이동",
    delayMs: 3_000,
    cancellable: true
  });
}

export function validateNavigationAction(action, projects = []) {
  if (action?.type !== "navigate" || !Number.isInteger(action.delayMs) || action.delayMs < 0 || action.delayMs > 10_000) return null;
  if (action.target?.kind === "landing" && action.target.anchor === "work") {
    return Object.freeze({ ...action, target: Object.freeze({ kind: "landing", anchor: "work" }) });
  }
  if (action.target?.kind === "project") {
    const project = projects.find(({ id }) => id === action.target.projectId);
    if (!project) return null;
    const sectionId = project.sections?.some(({ id }) => id === action.target.sectionId) ? action.target.sectionId : "overview";
    return Object.freeze({ ...action, target: Object.freeze({ kind: "project", projectId: project.id, sectionId }) });
  }
  return null;
}
