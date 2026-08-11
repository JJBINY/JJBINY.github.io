const INTENT_RULES = [
  { intent: "background", terms: ["학력", "학교", "전공", "자격", "교육", "세종대"] },
  { intent: "harness", terms: ["하네스", "codex", "claude code", "개인 지식", "skill", "스킬", "mcp 관리"] },
  { intent: "document", terms: ["문서", "멀티모달", "ocr", "vlm", "docling", "표", "이미지", "인덱싱"] },
  { intent: "evaluation", terms: ["평가", "지표", "정확도", "성능", "회귀", "테스트", "측정", "점수"] },
  { intent: "data", terms: ["nl2sql", "sql", "데이터베이스", "digital twin", "디지털 트윈", "queryspec"] },
  { intent: "knowledge", terms: ["지식 그래프", "온톨로지", "hyperedge", "하이퍼엣지", "용어", "taxonomy", "glossary"] },
  { intent: "retrieval", terms: ["검색", "rag", "bm25", "임베딩", "bge", "rerank", "리랭크", "opensearch"] },
  { intent: "llmops", terms: ["llmops", "gateway", "게이트웨이", "litellm", "vllm", "bedrock", "모델 서빙"] },
  { intent: "deployment", terms: ["배포", "폐쇄망", "air gap", "로컬 llm", "ollama", "kubernetes", "docker"] },
  { intent: "reliability", terms: ["근거", "출처", "인용", "trace", "트레이스", "hitl", "승인", "신뢰", "검증", "실패"] },
  { intent: "routing", terms: ["라우팅", "workflow", "워크플로", "react", "fallback", "폴백", "계획", "도구 호출"] },
  { intent: "architecture", terms: ["구조", "아키텍처", "멀티", "에이전트", "오케스트레이션", "책임", "경계"] },
  { intent: "limitations", terms: ["한계", "아쉬", "부족", "미완", "못한", "다음 과제", "약점"] },
  { intent: "experience", terms: ["담당", "역할", "기여", "경험", "책임", "무엇을 했", "맡"] },
  { intent: "values", terms: ["가치관", "성격", "강점", "약점", "일하는 방식", "원칙", "중요하게"] },
  { intent: "evidence", terms: ["성과", "수치", "특허", "대회", "결과", "증명"] },
  { intent: "project", terms: ["프로젝트", "철강", "뷰티", "상담", "만들", "포트폴리오"] },
  { intent: "profile", terms: ["누구", "소개", "엔지니어", "자기소개"] }
];

const RELATION_BONUS = {
  part_of: 4,
  supports: 3.5,
  demonstrates: 3,
  applies_to: 2.5,
  derived_from: 2,
  contrasts_with: 1.5
};

// Conversational verbs can appear in almost any question. They may add a small
// lexical hint, but must never become a medium-confidence portfolio seed alone.
const LOW_INFORMATION_KEYWORDS = new Set(["설명", "소개", "방법", "이유", "궁금"]);

export function normalizeKnowledgeBundle(knowledge) {
  if (Array.isArray(knowledge)) {
    return { metadata: {}, ontology: {}, nodes: knowledge, edges: [] };
  }
  return {
    metadata: knowledge?.metadata ?? {},
    ontology: knowledge?.ontology ?? {},
    nodes: Array.isArray(knowledge?.nodes) ? knowledge.nodes : [],
    edges: Array.isArray(knowledge?.edges) ? knowledge.edges : []
  };
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}\s.+#-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function terms(value) {
  return [...new Set(normalize(value).split(" ").filter((term) => term.length > 1))];
}

export function classifyIntent(question) {
  const normalized = normalize(question);
  let best = { intent: "general", score: 0, index: Number.POSITIVE_INFINITY };

  INTENT_RULES.forEach((rule, index) => {
    const score = rule.terms.reduce((total, term) => {
      const normalizedTerm = normalize(term);
      return total + (normalized.includes(normalizedTerm) ? Math.max(1, normalizedTerm.split(" ").length) : 0);
    }, 0);

    if (score > best.score || (score === best.score && score > 0 && index < best.index)) {
      best = { intent: rule.intent, score, index };
    }
  });

  return best.intent;
}

function scoreEntry(question, intent, entry) {
  const normalizedQuestion = normalize(question);
  const questionTerms = terms(question);
  const keywordHits = [];
  let lexical = 0;

  for (const keyword of entry.keywords ?? []) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword || !normalizedQuestion.includes(normalizedKeyword)) continue;
    keywordHits.push(keyword);
    lexical += LOW_INFORMATION_KEYWORDS.has(normalizedKeyword)
      ? 1
      : normalizedQuestion === normalizedKeyword
        ? 20
        : normalizedKeyword.length >= 4
          ? 12
          : 8;
  }

  for (const tag of entry.tags ?? []) {
    const normalizedTag = normalize(tag);
    if (normalizedTag && normalizedQuestion.includes(normalizedTag)) lexical += 4;
  }

  const searchable = normalize([
    entry.title,
    entry.summary,
    entry.answer,
    entry.kind,
    ...(entry.keywords ?? []),
    ...(entry.tags ?? [])
  ].join(" "));
  const termHits = questionTerms.filter((term) => searchable.includes(term));
  lexical += termHits.length * 1.5;

  const intentScore = intent !== "general" && entry.intent === intent ? 9 : 0;
  return {
    score: lexical + intentScore,
    lexical,
    intentScore,
    keywordHits,
    termHits
  };
}

function rankLexical(question, intent, nodes) {
  return nodes
    .map((entry) => ({ entry, ...scoreEntry(question, intent, entry), matchType: "lexical" }))
    .filter((match) => match.score > 0)
    .sort(compareMatches);
}

function expandGraph(seedMatches, lexicalMatches, bundle) {
  const allowedRelations = new Set(
    bundle.ontology?.exploration?.allowedRelations ?? Object.keys(RELATION_BONUS)
  );
  const nodesById = new Map(bundle.nodes.map((node) => [node.id, node]));
  const lexicalById = new Map(lexicalMatches.map((match) => [match.entry.id, match]));
  const candidates = new Map();

  for (const seed of seedMatches) {
    if (seed.score < 8) continue;
    for (const edge of bundle.edges) {
      if (!allowedRelations.has(edge.type)) continue;
      const neighborId = edge.from === seed.entry.id
        ? edge.to
        : edge.to === seed.entry.id
          ? edge.from
          : null;
      if (!neighborId || !nodesById.has(neighborId)) continue;

      const base = lexicalById.get(neighborId);
      const graphBonus = (RELATION_BONUS[edge.type] ?? 1) * Math.min(1, seed.score / 20);
      const candidate = {
        entry: nodesById.get(neighborId),
        score: (base?.score ?? 0) + graphBonus,
        lexical: base?.lexical ?? 0,
        intentScore: base?.intentScore ?? 0,
        keywordHits: base?.keywordHits ?? [],
        termHits: base?.termHits ?? [],
        matchType: base ? "lexical+graph" : "graph",
        via: {
          seedId: seed.entry.id,
          from: edge.from,
          type: edge.type,
          to: edge.to
        }
      };
      const current = candidates.get(neighborId);
      if (!current || candidate.score > current.score) candidates.set(neighborId, candidate);
    }
  }

  return [...candidates.values()].sort(compareMatches);
}

function compareMatches(left, right) {
  return right.score - left.score
    || matchPriority(right.matchType) - matchPriority(left.matchType)
    || left.entry.id.localeCompare(right.entry.id, "ko-KR");
}

function matchPriority(type) {
  return { lexical: 3, "lexical+graph": 2, graph: 1 }[type] ?? 0;
}

export function retrieveKnowledge(question, knowledge, maxItems = 5) {
  const bundle = normalizeKnowledgeBundle(knowledge);
  const intent = classifyIntent(question);
  const lexicalMatches = rankLexical(question, intent, bundle.nodes);
  const seedMatches = lexicalMatches.slice(0, Math.min(3, maxItems));
  const graphMatches = expandGraph(seedMatches, lexicalMatches, bundle);
  const combined = new Map();

  for (const match of [...lexicalMatches, ...graphMatches]) {
    const current = combined.get(match.entry.id);
    if (!current || match.score > current.score) combined.set(match.entry.id, match);
  }

  const relevant = [...combined.values()].sort(compareMatches).slice(0, maxItems);
  const primary = relevant[0];
  const fallback = bundle.nodes.find((entry) => entry.id === "profile.applied-ai-engineer")
    ?? bundle.nodes.find((entry) => entry.id === "profile-summary");
  const confidence = primary?.score >= 12 ? "high" : primary?.score >= 8 ? "medium" : "low";

  return {
    intent,
    matches: relevant.length ? relevant : fallback ? [{ entry: fallback, score: 0, matchType: "fallback" }] : [],
    seedMatches,
    graphMatches: graphMatches.filter((match) => match.via),
    confidence,
    bundle: {
      digest: bundle.metadata?.bundleDigest,
      nodeCount: bundle.nodes.length,
      edgeCount: bundle.edges.length
    }
  };
}
