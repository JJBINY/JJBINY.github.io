import { runtimeConfig } from "./config.js";

async function fetchResource(path, type = "json") {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`콘텐츠를 불러오지 못했습니다: ${path} (${response.status})`);
  }

  return type === "text" ? response.text() : response.json();
}

function resolveContentReference(reference, site, projects) {
  if (!reference?.type) {
    throw new Error("knowledge 항목에 contentRef가 필요합니다.");
  }

  if (reference.type === "profile") {
    return {
      answer: `저는 ${site.profile.summary}`,
      summary: site.profile.summary
    };
  }

  if (reference.type === "approach") {
    return {
      answer: `${site.approachCopy} ${site.principles.map((item) => item.body).join(" ")}`,
      summary: site.approachCopy
    };
  }

  const project = projects.find((item) => item.id === reference.projectId);
  if (!project) {
    throw new Error(`contentRef의 프로젝트를 찾을 수 없습니다: ${reference.projectId}`);
  }

  if (reference.type === "projectOverview") {
    return {
      answer: `${project.title}은 ${project.subtitle}입니다. ${project.description}`,
      summary: project.subtitle
    };
  }

  if (reference.type === "projectScope") {
    return {
      answer: `제가 공개 자료에서 제시하는 담당 범위는 ${project.scope.join(", ")}입니다. 확인되지 않은 팀 전체 성과를 개인 성과처럼 말하지 않는 것을 원칙으로 합니다.`,
      summary: project.scope.join(", ")
    };
  }

  if (reference.type === "projectDecision") {
    const decision = project.decisions.find((item) => item.anchor === reference.anchor);
    if (!decision) {
      throw new Error(`contentRef의 설계 판단을 찾을 수 없습니다: ${reference.anchor}`);
    }
    return {
      answer: `“${decision.title}” 판단의 핵심은 다음과 같습니다. ${decision.body}`,
      summary: decision.body
    };
  }

  throw new Error(`지원하지 않는 contentRef 타입입니다: ${reference.type}`);
}

function hydrateKnowledgeEntry(entry, site, projects) {
  if (typeof entry.answer === "string" && typeof entry.summary === "string") return entry;
  if (!entry.contentRef?.type) {
    throw new Error(`knowledge 항목에 answer/summary 또는 contentRef가 필요합니다: ${entry.id}`);
  }
  return {
    ...entry,
    ...resolveContentReference(entry.contentRef, site, projects)
  };
}

function hydrateKnowledge(knowledge, site, projects) {
  if (Array.isArray(knowledge)) {
    return {
      metadata: {},
      ontology: {},
      nodes: knowledge.map((entry) => hydrateKnowledgeEntry(entry, site, projects)),
      edges: []
    };
  }
  if (!Array.isArray(knowledge?.nodes) || !Array.isArray(knowledge?.edges)) {
    throw new Error("knowledge bundle에는 nodes와 edges가 필요합니다.");
  }
  return {
    ...knowledge,
    nodes: knowledge.nodes.map((entry) => hydrateKnowledgeEntry(entry, site, projects))
  };
}

export async function loadPortfolioContent() {
  const paths = runtimeConfig.content;
  const [site, projects] = await Promise.all([
    fetchResource(paths.site),
    fetchResource(paths.projects)
  ]);
  const documentHtml = await Promise.all(projects.map((project) => (
    fetchResource(project.documentHtmlPath, "text")
  )));

  return {
    site,
    projects: projects.map((project, index) => ({
      ...project,
      documentHtml: documentHtml[index]
    }))
  };
}

export async function loadPortfolioKnowledge({ site, projects }) {
  const knowledge = await fetchResource(runtimeConfig.content.knowledge);
  return hydrateKnowledge(knowledge, site, projects);
}

export async function loadAgentContent({ site, projects, knowledge: providedKnowledge }) {
  const paths = runtimeConfig.content;
  const [knowledge, questions, systemPrompt] = await Promise.all([
    providedKnowledge ?? fetchResource(paths.knowledge),
    fetchResource(paths.questions),
    fetchResource(paths.systemPrompt, "text")
  ]);

  return {
    knowledge: providedKnowledge ?? hydrateKnowledge(knowledge, site, projects),
    questions,
    systemPrompt
  };
}
