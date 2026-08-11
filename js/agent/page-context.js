const ROUTE_TYPES = Object.freeze({
  landing: "landing",
  project: "project-detail",
  knowledge: "knowledge-index",
  evidence: "evidence-detail"
});

const LANDING_SECTIONS = new Map([
  ["profile", "Profile"],
  ["experience", "Experience"],
  ["work", "Selected work"],
  ["approach", "Approach"],
  ["interview", "AI interview"]
]);

const PROJECT_TABS = new Map([
  ["overview", "요약"],
  ["architecture", "구조와 흐름"],
  ["evidence", "근거 기록"],
  ["limits", "결과와 한계"]
]);

const KNOWLEDGE_CATEGORIES = new Map([
  ["projects", {
    title: "프로젝트와 전달 범위",
    kinds: new Set(["project", "personal-project"])
  }],
  ["architecture", {
    title: "아키텍처와 실행 흐름",
    kinds: new Set(["architecture-decision", "implementation", "deployment", "platform-capability"])
  }],
  ["knowledge", {
    title: "지식 모델과 검색",
    kinds: new Set(["knowledge-model", "document-ai", "knowledge-system", "safety-architecture", "capability"])
  }],
  ["reliability", {
    title: "신뢰성과 평가",
    kinds: new Set(["reliability-pattern", "evaluation", "evidence", "outcome"])
  }],
  ["principles", {
    title: "배경, 원칙과 한계",
    kinds: new Set(["profile", "background", "principle", "limitation"])
  }]
]);

const PROJECT_ARCHITECTURE_KINDS = new Set([
  "architecture-decision",
  "implementation",
  "deployment",
  "platform-capability",
  "knowledge-model",
  "document-ai",
  "knowledge-system",
  "safety-architecture"
]);

const MAX_KNOWLEDGE_NODE_IDS = 32;

export const PAGE_CONTEXT_ROUTE_TYPES = ROUTE_TYPES;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHash(hash) {
  const raw = typeof hash === "string" ? hash.replace(/^#/, "") : "";
  const parts = raw.split("/").map(safeDecode);

  if (parts[0] === "case") {
    return {
      type: "project",
      entityId: parts[1] ?? "",
      tab: PROJECT_TABS.has(parts[2]) ? parts[2] : "overview",
      recordId: parts[3] === "record" ? parts.slice(4).join("/") : ""
    };
  }

  if (parts[0] === "evidence") {
    return {
      type: "evidence",
      entityId: parts.slice(1).join("/")
    };
  }

  if (parts[0] === "knowledge") {
    return {
      type: "knowledge",
      entityId: KNOWLEDGE_CATEGORIES.has(parts[1]) ? parts[1] : "projects"
    };
  }

  return {
    type: "landing",
    entityId: LANDING_SECTIONS.has(raw) ? raw : "profile"
  };
}

function isMap(value) {
  return value instanceof Map;
}

function isAllowlistedEntity(map, id) {
  if (!isMap(map) || !map.has(id)) return false;
  const entity = map.get(id);
  return entity?.id === id && typeof entity.title === "string" && entity.title.trim().length > 0;
}

function freezeContext({ routeType, entityId, title, knowledgeNodeIds }) {
  return Object.freeze({
    routeType,
    entityId,
    title,
    knowledgeNodeIds: Object.freeze([...knowledgeNodeIds])
  });
}

function nodeIdsMatching(knowledgeNodesById, predicate) {
  if (!isMap(knowledgeNodesById)) return [];

  const ids = [];
  for (const [id, node] of knowledgeNodesById) {
    if (ids.length >= MAX_KNOWLEDGE_NODE_IDS) break;
    if (!isAllowlistedEntity(knowledgeNodesById, id)) continue;
    if (predicate(node)) ids.push(id);
  }
  return ids;
}

function belongsToProject(node, projectId) {
  if (node?.projectId === projectId) return true;
  if (Array.isArray(node?.projectIds) && node.projectIds.includes(projectId)) return true;

  const sourceHref = node?.source?.href;
  return typeof sourceHref === "string"
    && (sourceHref === `#${projectId}` || sourceHref.startsWith(`#${projectId}-`));
}

function explicitProjectNodeIds(project, knowledgeNodesById) {
  if (!Array.isArray(project?.knowledgeNodeIds) || !isMap(knowledgeNodesById)) return [];
  return project.knowledgeNodeIds.filter((id) => (
    typeof id === "string" && isAllowlistedEntity(knowledgeNodesById, id)
  ));
}

function projectKnowledgeNodeIds(project, tab, knowledgeNodesById) {
  const explicitIds = explicitProjectNodeIds(project, knowledgeNodesById);
  const derivedIds = nodeIdsMatching(
    knowledgeNodesById,
    (node) => belongsToProject(node, project.id)
  );
  const allIds = [...new Set([...explicitIds, ...derivedIds])];

  if (tab === "architecture") {
    return allIds
      .filter((id) => PROJECT_ARCHITECTURE_KINDS.has(knowledgeNodesById.get(id)?.kind))
      .slice(0, MAX_KNOWLEDGE_NODE_IDS);
  }

  if (tab === "limits") {
    const limitId = "limitation.explicit-claim-boundaries";
    return isAllowlistedEntity(knowledgeNodesById, limitId) ? [limitId] : [];
  }

  return allIds.slice(0, MAX_KNOWLEDGE_NODE_IDS);
}

/**
 * Resolves a portfolio hash to a prompt-safe context projection.
 *
 * The returned value contains only identifiers and titles selected from the
 * supplied public maps. Unknown entity IDs return null; fragment text and URLs
 * are never copied into the result.
 */
export function resolvePageContext({
  hash = "",
  projectsById = new Map(),
  knowledgeNodesById = new Map()
} = {}) {
  const route = parseHash(hash);

  if (route.type === "project") {
    if (!isAllowlistedEntity(projectsById, route.entityId)) return null;
    if (route.recordId) {
      if (!isAllowlistedEntity(knowledgeNodesById, route.recordId)) return null;
      const record = knowledgeNodesById.get(route.recordId);
      return freezeContext({
        routeType: ROUTE_TYPES.evidence,
        entityId: record.id,
        title: record.title,
        knowledgeNodeIds: [record.id]
      });
    }
    const project = projectsById.get(route.entityId);
    const tabTitle = PROJECT_TABS.get(route.tab);
    return freezeContext({
      routeType: ROUTE_TYPES.project,
      entityId: project.id,
      title: `${project.title} · ${tabTitle}`,
      knowledgeNodeIds: projectKnowledgeNodeIds(project, route.tab, knowledgeNodesById)
    });
  }

  if (route.type === "evidence") {
    if (!isAllowlistedEntity(knowledgeNodesById, route.entityId)) return null;
    const node = knowledgeNodesById.get(route.entityId);
    return freezeContext({
      routeType: ROUTE_TYPES.evidence,
      entityId: node.id,
      title: node.title,
      knowledgeNodeIds: [node.id]
    });
  }

  if (route.type === "knowledge") {
    const category = KNOWLEDGE_CATEGORIES.get(route.entityId);
    return freezeContext({
      routeType: ROUTE_TYPES.knowledge,
      entityId: route.entityId,
      title: category.title,
      knowledgeNodeIds: nodeIdsMatching(
        knowledgeNodesById,
        (node) => category.kinds.has(node.kind)
      )
    });
  }

  const title = LANDING_SECTIONS.get(route.entityId);
  return freezeContext({
    routeType: ROUTE_TYPES.landing,
    entityId: route.entityId,
    title,
    knowledgeNodeIds: nodeIdsMatching(
      knowledgeNodesById,
      (node) => node?.source?.href === `#${route.entityId}`
    )
  });
}

/** Reads only location.hash, then delegates to the pure resolver above. */
export function readCurrentPageContext({
  location = globalThis.location,
  projectsById = new Map(),
  knowledgeNodesById = new Map()
} = {}) {
  const locationHash = location?.hash;
  const hash = typeof locationHash === "string" ? locationHash : "";
  return resolvePageContext({ hash, projectsById, knowledgeNodesById });
}
