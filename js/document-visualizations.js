const SVG_NS = "http://www.w3.org/2000/svg";
const rendererByShell = new WeakMap();

export const SIMULATION_TRANSITION_TIMINGS = Object.freeze({
  leaveMs: 180,
  enterMs: 280,
  scrollMs: 320
});

function reducedMotionRequested() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function createSimulationTransitionCoordinator() {
  let runVersion = 0;
  const timers = new Set();
  const frames = new Set();

  function clearHandles() {
    timers.forEach((timer) => window.clearTimeout(timer));
    frames.forEach((frame) => window.cancelAnimationFrame(frame));
    timers.clear();
    frames.clear();
  }

  function invalidate() {
    runVersion += 1;
    clearHandles();
    return runVersion;
  }

  function schedule(callback, delay, version) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (version === runVersion) callback();
    }, delay);
    timers.add(timer);
  }

  function nextFrame(callback, version) {
    const frame = window.requestAnimationFrame(() => {
      frames.delete(frame);
      if (version === runVersion) callback();
    });
    frames.add(frame);
  }

  function transitionViews(views, previousIndex, nextIndex) {
    const version = invalidate();
    const entering = views[nextIndex];
    const leaving = views[previousIndex];
    if (!entering) return;

    views.forEach((view, index) => {
      if (![previousIndex, nextIndex].includes(index)) {
        view.hidden = true;
        view.dataset.transitionState = "idle";
        view.setAttribute("aria-hidden", "true");
        view.inert = true;
      }
    });
    entering.hidden = false;
    entering.inert = false;
    entering.setAttribute("aria-hidden", "false");

    if (!leaving || leaving === entering || reducedMotionRequested()) {
      if (leaving && leaving !== entering) leaving.hidden = true;
      entering.dataset.transitionState = "active";
      return;
    }

    leaving.hidden = false;
    leaving.inert = true;
    leaving.setAttribute("aria-hidden", "true");
    leaving.dataset.transitionState = "leaving";
    entering.dataset.transitionState = "entering";
    nextFrame(() => {
      entering.dataset.transitionState = "active";
      schedule(() => {
        leaving.hidden = true;
        leaving.dataset.transitionState = "idle";
      }, SIMULATION_TRANSITION_TIMINGS.enterMs, version);
    }, version);
  }

  return Object.freeze({ invalidate, schedule, nextFrame, transitionViews });
}

const VISUALIZATION_SPECS = Object.freeze({
  "steel-domain-agent": {
    id: "steel-agent-execution",
    sectionId: "architecture",
    label: "EXECUTABLE ARCHITECTURE · 01",
    title: "원문 Agent 구조에서 한 요청이 실행되는 경로",
    description:
      "E2E Agent Loop와 도구–Agent–Orchestrator 도식을 하나의 실행 가능한 topology로 결합했습니다.",
    sourceNote: "원문 topology · steel-e2e-agent-loop.svg + steel-tool-agent-orchestrator.svg",
    kind: "steel-execution",
    intervalMs: 4300,
    durationLabel: "약 30초",
    stages: [
      ["질의", "사용자 질의와 대화 맥락을 turn으로 고정", "Conversation Runtime", "session · turn · original query", "Application Turn"],
      ["이해", "질의를 도메인 의미 계약으로 변환", "Query Understanding", "context · grounding · revision", "Semantic Request"],
      ["HITL", "결과를 바꾸는 중요한 모호성만 확인", "Ambiguity Gate", "typed choice · bounded rounds", "Revised Semantic Request"],
      ["계획", "TaskGraph를 실행 가능한 ActionGraph로 컴파일", "Mission Compiler", "binding · budget · dependency", "ActionGraph"],
      ["실행", "Orchestrator가 전문 Agent에 typed mission을 fan-out", "Executor / Coordinator", "manual · knowhow · digital twin", "Typed receipts"],
      ["채택", "Agent 제안을 source·claim·task와 결합", "Evidence Ledger", "accepted · unavailable · conflict", "Accepted evidence"],
      ["최종화", "답변 계획·인용·입력 digest를 재검증", "Answer Finalizer", "Answer IR · citation · digest", "Production answer"],
      ["응답", "검증된 가이던스 또는 분석 리포트 전달", "Conversation Runtime", "answer + public citations", "Guidance / Report"]
    ].map(([shortLabel, title, owner, contract, output]) => ({
      shortLabel,
      title,
      owner,
      contract,
      output
    }))
  },
  "multimodal-document-intelligence": {
    id: "multimodal-document-workbench",
    sectionId: "architecture",
    label: "DOCUMENT INTELLIGENCE LAB · 02",
    title: "문서 분해부터 seed 탐색과 정확한 인용까지",
    description:
      "설명용 공개 문서 한 장을 실제로 분해하고, 검색 결과에서 seed를 선택해 semantic tree를 복원합니다.",
    sourceNote: "원문 topology · multimodal identity + document-to-retrieval + precision-rag-flow",
    kind: "document-workbench",
    intervalMs: 3400,
    durationLabel: "약 30초",
    stages: [
      ["원본", "원본 페이지와 문서 metadata를 수집", "Source intake", "file · page · source URI", "Document source"],
      ["Layout", "읽기 순서와 page·bbox를 가진 block으로 분석", "Layout / OCR", "order · page · bbox", "Ordered blocks"],
      ["3계층", "Document–Chunk–Element identity를 부여", "Semantic Chunker / Identity", "parent · sequence · modality", "Canonical tree"],
      ["표현", "시각 Element에 D2T를 결합하고 Passage 생성", "D2T / Passage materializer", "context · return_node_id", "Search projections"],
      ["검색", "여러 문서의 Passage를 검색하고 seed 3개 선택", "Hybrid Retrieval", "BM25 · dense · role", "Ranked seeds"],
      ["그래프 탐색", "다중 seed priority queue에서 가장 강한 후보를 순차 확장", "Bounded graph traversal", "priority · pruning · merge", "Converged evidence"],
      ["인용", "선택된 Element에서 정확한 Fragment locator 복원", "Citation resolver", "row · span · page · bbox", "Exact citation"],
      ["활용", "근거형 AI 답변과 원문 Source Review를 함께 제공", "Answer composer", "inline visual · source review", "Grounded answer"]
    ].map(([shortLabel, title, owner, contract, output], index) => ({
      shortLabel,
      title,
      owner,
      contract,
      output,
      durationMs: index === 5 ? 12_000 : 3_400
    }))
  },
  "personal-agent-harness": {
    id: "personal-harness-collaboration",
    sectionId: "architecture",
    label: "REPRESENTATIVE DETERMINISTIC DEMO · 03",
    title: "하나의 요청에 Wiki·Skill·여러 Agent 역할을 조합하는 과정",
    description: "이번 포트폴리오 개편을 대표 시나리오로 삼아 선호 조회, Skill 선택, manifest 권한 검증, 역할 협업과 검수·Outcome 기록을 재현합니다.",
    sourceNote: "문서 근거 기반 대표 시나리오 · 실제 세션 감사 로그가 아닙니다.",
    kind: "harness-collaboration",
    intervalMs: 3600,
    durationLabel: "약 29초",
    stages: [
      ["요청", "포트폴리오 정밀 개편 요청을 변경 단위로 고정", "Task intake", "scope · artifacts · constraints", "Work request"],
      ["Wiki", "검토된 선호·용어·공개 경계를 조회", "Personal Wiki", "authority · freshness · visibility", "Context packet"],
      ["Skills", "현재 과제에 필요한 Skill군만 선택", "Skill router", "trigger · intent · risk", "Skill set"],
      ["Manifest", "Agent 지원 범위와 권한을 실행 전에 검증", "Harness manifest", "capability · directory · permission", "Eligible agents"],
      ["작업 그래프", "콘텐츠·UI·시각화·AI UX 작업 그래프 생성", "Planner", "dependency · artifact · verify", "Work DAG"],
      ["협업", "구현·아키텍처·시각 검토 역할이 shared diff로 협업", "Role collaboration", "planner · implementer · reviewers", "Reviewed diff"],
      ["검증·커밋", "테스트·브라우저·프라이버시 gate 뒤 작업 단위 커밋", "Verification gate", "check · browser · privacy · git", "Verified commits"],
      ["Outcome", "helpful·unused·defect를 기록해 Wiki·Skill 개선 후보 생성", "Outcome recorder", "evidence · outcome · candidate", "Improvement loop"]
    ].map(([shortLabel, title, owner, contract, output]) => ({ shortLabel, title, owner, contract, output }))
  }
});

const STEEL_TRAJECTORY_VIEWBOX = Object.freeze({ width: 440, height: 1240 });

const STEEL_NODES = Object.freeze([
  { id: "question", stage: 0, x: 120, y: 24, w: 200, h: 76, kind: "terminal", tag: "INPUT", label: "사용자 질의", meta: "원질의 · 대화 맥락" },
  { id: "understand", stage: 1, x: 120, y: 124, w: 200, h: 76, tag: "SEMANTIC", label: "질의 이해", meta: "색인 · 그래프 · slot" },
  { id: "ambiguity", stage: 2, cx: 220, cy: 264, rx: 100, ry: 48, kind: "diamond", tag: "GATE", label: "모호성?", meta: "결과 영향 여부" },
  { id: "hitl", stage: 2, x: 24, y: 336, w: 184, h: 76, kind: "optional", tag: "HUMAN", label: "HITL 질문 · 응답", meta: "라인 · 시간 범위 선택" },
  { id: "plan", stage: 3, x: 120, y: 440, w: 200, h: 76, kind: "core", tag: "PLAN", label: "Action Plan DAG", meta: "binding · dependency" },
  { id: "orchestrator", stage: 4, x: 120, y: 540, w: 200, h: 76, kind: "core", tag: "RUNTIME", label: "Orchestrator", meta: "fan-out · fan-in" },
  { id: "manual", stage: 4, x: 20, y: 660, w: 188, h: 76, tag: "AGENT", label: "메뉴얼 Agent", meta: "검색 · Fragment" },
  { id: "knowhow", stage: 4, x: 232, y: 660, w: 188, h: 76, tag: "AGENT", label: "노하우 Agent", meta: "사례 · 적용 조건" },
  { id: "gap", stage: 5, x: 120, y: 764, w: 200, h: 76, kind: "optional", tag: "EVIDENCE", label: "Evidence gap", meta: "현재 상태 누락" },
  { id: "replan", stage: 5, x: 24, y: 864, w: 168, h: 76, kind: "core", tag: "REPLAN", label: "DAG v2", meta: "Digital Twin 추가" },
  { id: "digital-twin", stage: 6, x: 232, y: 864, w: 188, h: 76, tag: "AGENT", label: "Digital Twin Agent", meta: "NL2SQL · chart" },
  { id: "ledger", stage: 6, x: 120, y: 964, w: 200, h: 76, tag: "LEDGER", label: "Evidence Ledger", meta: "source · claim · task" },
  { id: "finalize", stage: 7, x: 120, y: 1064, w: 200, h: 76, kind: "core", tag: "FINALIZE", label: "답변 생성 · 검증", meta: "coverage · citation" },
  { id: "answer", stage: 7, x: 120, y: 1164, w: 200, h: 76, kind: "terminal", tag: "OUTPUT", label: "최종 응답", meta: "guidance · report" }
]);

const STEEL_EDGES = Object.freeze([
  { id: "q-understand", stage: 0, d: "M220 100 V124" },
  { id: "understand-gate", stage: 1, d: "M220 200 V216" },
  { id: "gate-hitl", stage: 2, d: "M120 264 H80 Q72 264 72 272 V336", optional: true, label: "확인", labelX: 84, labelY: 252 },
  { id: "hitl-understand", stage: 2, d: "M24 374 H8 V162 Q8 152 20 152 H120", optional: true, label: "의미 갱신", labelX: 48, labelY: 144 },
  { id: "gate-plan", stage: 3, d: "M220 312 V440", label: "해소", labelX: 244, labelY: 384 },
  { id: "plan-orchestrator", stage: 3, d: "M220 516 V540" },
  { id: "orchestrator-manual", stage: 4, d: "M180 616 V636 Q180 644 172 644 H114 V660" },
  { id: "orchestrator-knowhow", stage: 4, d: "M260 616 V636 Q260 644 268 644 H326 V660" },
  { id: "manual-gap", stage: 4, d: "M114 736 V748 Q114 756 122 756 H180 V764" },
  { id: "knowhow-gap", stage: 4, d: "M326 736 V748 Q326 756 318 756 H260 V764" },
  { id: "gap-replan", stage: 5, d: "M120 802 H108 Q100 802 100 810 V864" },
  { id: "replan-loop", stage: 5, d: "M24 902 H8 V478 Q8 468 20 468 H120", optional: true, label: "DAG 갱신", labelX: 48, labelY: 460 },
  { id: "replan-dt", stage: 6, d: "M192 902 H232", label: "조회 추가", labelX: 212, labelY: 888 },
  { id: "dt-ledger", stage: 6, d: "M326 940 V948 Q326 956 318 956 H260 V964" },
  { id: "ledger-finalize", stage: 7, d: "M220 1040 V1064" },
  { id: "finalize-answer", stage: 7, d: "M220 1140 V1164" }
]);

const SEARCH_RESULTS = Object.freeze([
  { passage: "psg:ws-001-07", document: "WS-001 · 설비 점검 작업표준", excerpt: "진동 항목이 기준을 벗어나면 절차 4.1을 확인…", score: 0.92, seed: true },
  { passage: "psg:mm-014-03", document: "MM-014 · 펌프 유지보수 메뉴얼", excerpt: "진동 점검 시 운전 조건과 측정 위치를 함께 기록…", score: 0.86, seed: true },
  { passage: "psg:kh-032-02", document: "KH-032 · 현장 조치 사례", excerpt: "이상 진동이 확인된 사례에서 적용 조건과 조치…", score: 0.8, seed: true },
  { passage: "psg:ws-001-04", document: "WS-001 · 설비 점검 작업표준", excerpt: "작업 시작 전 안전 상태와 점검 도구를 확인…", score: 0.68, seed: false },
  { passage: "psg:mm-021-11", document: "MM-021 · 회전체 점검 안내", excerpt: "소음과 온도 항목의 기록 방법…", score: 0.61, seed: false },
  { passage: "psg:op-008-05", document: "OP-008 · 일상 점검 기록", excerpt: "교대 점검표 작성과 인계 항목…", score: 0.54, seed: false }
]);

const STEEL_DEMO_QUERY = "출측 소재가 흔들리고 권취가 불안정한데 왜 이러죠?";

const STEEL_DEMO_SCENARIOS = Object.freeze({
  coiler: {
    label: "B라인 · 권취 구간",
    code: "LINE-B / COILING",
    timeRange: "최근 30분",
    manual: ["M-01", "DEMO-WS-COIL · 점검 순서 04", "장력·루퍼·센터링 신호를 같은 시점 기준으로 확인"],
    knowhow: ["K-01", "DEMO-KH-COIL · 적용 조건 4/5", "폭 변경 직후 장력과 루퍼 편차가 함께 커진 유사 패턴"],
    twin: ["D-01", "B라인 · 최근 30분 · synthetic", "장력 편차와 루퍼 각도 변동이 동일 구간에서 확대"]
  }
});

export const STEEL_DEMO_STATUSES = Object.freeze([
  "idle",
  "typing",
  "understanding",
  "awaiting-hitl",
  "resolving",
  "planning",
  "executing",
  "replanning",
  "twin-executing",
  "synthesizing",
  "completed"
]);

const STEEL_AGENT_IDS = Object.freeze(["manual", "knowhow", "twin"]);

export function createInitialSteelDemoState(runVersion = 0) {
  return {
    status: "idle",
    scenarioKey: null,
    queryText: "",
    hitl: null,
    planRevision: 0,
    replanCount: 0,
    activeAgentId: null,
    userExpandedAgentId: null,
    highlightedReceiptId: null,
    agentProgress: Object.freeze({ manual: 0, knowhow: 0, twin: 0 }),
    receipts: Object.freeze([]),
    runVersion,
    notice: ""
  };
}

export function reduceSteelDemoState(state, event) {
  if (!state || !event?.type) return state;
  if (event.type === "reset" || event.type === "cancel") {
    return {
      ...createInitialSteelDemoState(state.runVersion + 1),
      notice: event.type === "cancel" ? "사용자가 실행을 취소했습니다." : ""
    };
  }
  if (event.type === "start" && ["idle", "completed"].includes(state.status)) {
    return {
      ...createInitialSteelDemoState(state.runVersion + 1),
      status: "typing"
    };
  }
  if (event.type === "typing-progress" && state.status === "typing") {
    return { ...state, queryText: String(event.value ?? "").slice(0, STEEL_DEMO_QUERY.length) };
  }
  if (event.type === "typed" && state.status === "typing") {
    return { ...state, status: "understanding", queryText: STEEL_DEMO_QUERY };
  }
  if (event.type === "request-hitl" && state.status === "understanding") {
    return { ...state, status: "awaiting-hitl" };
  }
  if (
    event.type === "resolve-hitl"
    && state.status === "awaiting-hitl"
    && Object.hasOwn(STEEL_DEMO_SCENARIOS, event.scenarioKey)
  ) {
    const scenario = STEEL_DEMO_SCENARIOS[event.scenarioKey];
    return {
      ...state,
      status: "resolving",
      scenarioKey: event.scenarioKey,
      hitl: Object.freeze({ line: scenario.label, timeRange: scenario.timeRange })
    };
  }
  if (event.type === "understood" && state.status === "resolving" && state.scenarioKey) {
    return { ...state, status: "planning", planRevision: 1 };
  }
  if (event.type === "plan-ready" && state.status === "planning" && state.scenarioKey) {
    return { ...state, status: "executing", activeAgentId: "manual" };
  }
  if (
    event.type === "agent-progress"
    && ((state.status === "executing" && ["manual", "knowhow"].includes(event.agentId))
      || (state.status === "twin-executing" && event.agentId === "twin"))
  ) {
    return {
      ...state,
      activeAgentId: event.agentId,
      agentProgress: Object.freeze({
        ...state.agentProgress,
        [event.agentId]: Math.max(state.agentProgress[event.agentId], Math.min(3, event.step ?? 0))
      })
    };
  }
  if (
    event.type === "agent-complete"
    && ((state.status === "executing" && ["manual", "knowhow"].includes(event.agentId))
      || (state.status === "twin-executing" && event.agentId === "twin"))
  ) {
    return {
      ...state,
      activeAgentId: event.agentId === "manual" ? "knowhow" : null,
      agentProgress: Object.freeze({ ...state.agentProgress, [event.agentId]: 4 }),
      receipts: Object.freeze([...new Set([...state.receipts, event.agentId])])
    };
  }
  if (
    event.type === "request-replan"
    && state.status === "executing"
    && ["manual", "knowhow"].every((agentId) => state.receipts.includes(agentId))
    && state.replanCount < 3
  ) {
    return {
      ...state,
      status: "replanning",
      planRevision: state.planRevision + 1,
      replanCount: state.replanCount + 1,
      activeAgentId: null
    };
  }
  if (event.type === "replan-ready" && state.status === "replanning") {
    return { ...state, status: "twin-executing", activeAgentId: "twin" };
  }
  if (
    event.type === "synthesize"
    && state.status === "twin-executing"
    && STEEL_AGENT_IDS.every((agentId) => state.receipts.includes(agentId))
  ) {
    return { ...state, status: "synthesizing", activeAgentId: null };
  }
  if (event.type === "complete" && state.status === "synthesizing") {
    return { ...state, status: "completed" };
  }
  if (event.type === "toggle-agent" && STEEL_AGENT_IDS.includes(event.agentId)) {
    return {
      ...state,
      userExpandedAgentId: state.userExpandedAgentId === event.agentId ? null : event.agentId
    };
  }
  if (event.type === "focus-receipt" && ["M-01", "K-01", "D-01"].includes(event.receiptId)) {
    const agentId = { "M-01": "manual", "K-01": "knowhow", "D-01": "twin" }[event.receiptId];
    return {
      ...state,
      highlightedReceiptId: event.receiptId,
      userExpandedAgentId: agentId
    };
  }
  return state;
}

export function selectDocumentSeeds(results = SEARCH_RESULTS, limit = 3) {
  return [...results]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, limit));
}

const DOCUMENT_FOREST = Object.freeze([
  {
    rank: 1,
    score: 0.92,
    passage: "psg:ws-001-07",
    document: "doc:ws-001",
    title: "설비 점검 작업표준",
    chunks: [
      { id: "chk:3.1", label: "안전 확인" },
      {
        id: "chk:3.2",
        label: "점검 순서",
        visited: true,
        elements: [
          { id: "el:text-02", label: "인접 문맥", visited: true },
          { id: "el:table-01", label: "return_node_id", visited: true, selected: true, fragments: ["row-01", "row-02", "row-03"] }
        ]
      },
      { id: "chk:3.3", label: "측정 위치" }
    ]
  },
  {
    rank: 2,
    score: 0.86,
    passage: "psg:mm-014-03",
    document: "doc:mm-014",
    title: "펌프 유지보수 메뉴얼",
    chunks: [
      {
        id: "chk:5.1",
        label: "진동 점검",
        visited: true,
        elements: [
          { id: "el:text-08", label: "return_node_id", visited: true, selected: true },
          { id: "el:figure-03", label: "측정 위치", visited: true }
        ]
      },
      { id: "chk:5.2", label: "체결 상태" }
    ]
  },
  {
    rank: 3,
    score: 0.8,
    passage: "psg:kh-032-02",
    document: "doc:kh-032",
    title: "현장 조치 사례",
    chunks: [
      {
        id: "chk:case-02",
        label: "이상 진동 사례",
        visited: true,
        elements: [
          { id: "el:case-02", label: "return_node_id", visited: true, selected: true },
          { id: "el:condition-02", label: "적용 조건", visited: true }
        ]
      },
      { id: "chk:case-05", label: "온도 상승 사례" }
    ]
  }
]);

const FOREST_CLUSTER_LAYOUTS = Object.freeze([
  { id: "ws", title: "작업표준", document: "doc:ws-001", origin: [204, 330], mobileOrigin: [190, 230], seed: "psg:ws-001-07", score: 0.92 },
  { id: "mm", title: "유지보수 메뉴얼", document: "doc:mm-014", origin: [560, 278], mobileOrigin: [190, 620], seed: "psg:mm-014-03", score: 0.86 },
  { id: "kh", title: "현장 조치 사례", document: "doc:kh-032", origin: [900, 350], mobileOrigin: [190, 1010], seed: "psg:kh-032-02", score: 0.8 }
]);

const FOREST_LOCAL_NODES_BY_CLUSTER = Object.freeze({
  ws: Object.freeze([
    ["doc", "document", 0, 0, 0, 0], ["chunk-a", "chunk", -72, -72, -72, -60],
    ["chunk-b", "chunk", 64, -80, 72, -64], ["chunk-c", "chunk", 70, 68, 68, 68],
    ["element-a", "element", -128, -132, -124, -116], ["element-b", "element", 118, -140, 126, -116],
    ["element-c", "element", 122, 116, 124, 122], ["passage", "passage", -176, -184, -154, -164],
    ["fragment", "fragment", 172, 168, 150, 174], ["leaf-1", "dot", -148, -30, -146, -12],
    ["leaf-2", "dot", -102, 72, -110, 68], ["leaf-3", "dot", 148, 10, 146, 18],
    ["leaf-4", "dot", 24, -130, 20, -132], ["leaf-5", "dot", -30, 130, -34, 134]
  ]),
  mm: Object.freeze([
    ["doc", "document", 0, 0, 0, 0], ["chunk-a", "chunk", -116, -18, -118, -14],
    ["chunk-b", "chunk", 104, -82, 108, -72], ["chunk-c", "chunk", 98, 78, 108, 76],
    ["element-a", "element", 170, -138, 156, -126], ["element-b", "element", 170, -54, 158, -54],
    ["element-c", "element", 166, 132, 154, 132], ["passage", "passage", 206, -184, 164, -170],
    ["fragment", "fragment", 204, 178, 164, 180], ["leaf-1", "dot", -178, -88, -154, -84],
    ["leaf-2", "dot", -188, 48, -156, 44], ["leaf-3", "dot", 24, -140, 22, -138],
    ["leaf-4", "dot", 28, 136, 26, 140], ["leaf-5", "dot", -90, 116, -94, 116]
  ]),
  kh: Object.freeze([
    ["doc", "document", 0, 0, 0, 0], ["chunk-a", "chunk", -92, -100, -90, -88],
    ["chunk-b", "chunk", 86, -60, 88, -58], ["chunk-c", "chunk", -54, 100, -58, 94],
    ["element-a", "element", 142, -120, 140, -112], ["element-b", "element", -154, -158, -144, -142],
    ["element-c", "element", 22, 154, 22, 148], ["passage", "passage", 194, -164, 158, -160],
    ["fragment", "fragment", 84, 198, 88, 180], ["leaf-1", "dot", -186, -30, -158, -22],
    ["leaf-2", "dot", -152, 68, -142, 64], ["leaf-3", "dot", 158, 26, 148, 30],
    ["leaf-4", "dot", -10, -142, -12, -136], ["leaf-5", "dot", -126, 142, -126, 134]
  ])
});

function forestNodeLabel(cluster, localId) {
  const labels = {
    doc: `${cluster.title} · Document`,
    "chunk-a": cluster.id === "ws" ? "안전 조건" : cluster.id === "mm" ? "측정 위치" : "사례 조건",
    "chunk-b": cluster.id === "ws" ? "점검 순서" : cluster.id === "mm" ? "진동 점검" : "이상 현상",
    "chunk-c": cluster.id === "ws" ? "판정 기준" : cluster.id === "mm" ? "체결 상태" : "적용 범위",
    "element-a": "canonical Element",
    "element-b": "인접 Element",
    "element-c": "semantic neighbor",
    passage: cluster.seed,
    fragment: cluster.id === "ws" ? "fragment:row-02 · exact locator" : `fragment:${cluster.id}-context`,
    "leaf-1": "low relevance", "leaf-2": "low relevance", "leaf-3": "low relevance", "leaf-4": "low relevance", "leaf-5": "low relevance"
  };
  return labels[localId];
}

const DOCUMENT_FOREST_NODES = FOREST_CLUSTER_LAYOUTS.flatMap((cluster, clusterIndex) => (
  FOREST_LOCAL_NODES_BY_CLUSTER[cluster.id].map(([localId, kind, dx, dy, mdx, mdy], localIndex) => Object.freeze({
    id: `${cluster.id}:${localId}`,
    clusterId: cluster.id,
    clusterIndex,
    localIndex,
    kind,
    label: forestNodeLabel(cluster, localId),
    x: cluster.origin[0] + dx,
    y: cluster.origin[1] + dy,
    mobileX: cluster.mobileOrigin[0] + mdx,
    mobileY: cluster.mobileOrigin[1] + mdy,
    score: localId === "passage" ? cluster.score : null,
    document: cluster.document
  }))
));

const META_NODE_DEFINITIONS = Object.freeze([
  ["meta:asset", "metadata", "설비 · 권취 구간", 180, 52, 190, 28],
  ["meta:symptom", "metadata", "현상 · 진동/흔들림", 420, 52, 190, 84],
  ["meta:condition", "metadata", "운전 조건 · B라인", 660, 52, 190, 140],
  ["meta:task", "metadata", "검색 과업 · 점검 근거", 900, 52, 190, 196]
]);

export const documentForestNodes = Object.freeze(DOCUMENT_FOREST_NODES.concat(
  META_NODE_DEFINITIONS.map(([id, kind, label, x, y, mobileX, mobileY], localIndex) => Object.freeze({
    id, kind, label, x, y, mobileX, mobileY, clusterId: "meta", clusterIndex: -1, localIndex,
    score: null, document: null
  }))
));

function clusterEdge(clusterId, from, to, relation, weight = 1) {
  return Object.freeze({ id: `${clusterId}:${from}-${to}`, from: `${clusterId}:${from}`, to: `${clusterId}:${to}`, relation, weight });
}

const DOCUMENT_FOREST_EDGES = FOREST_CLUSTER_LAYOUTS.flatMap(({ id }) => [
  clusterEdge(id, "passage", "element-a", "canonical", 1),
  clusterEdge(id, "element-a", "chunk-b", "parent", 0.98),
  clusterEdge(id, "chunk-b", "doc", "hydrate", 0.97),
  clusterEdge(id, "doc", "element-c", "semantic", id === "ws" ? 0.93 : id === "mm" ? 0.87 : 0.82),
  clusterEdge(id, "element-c", "fragment", "fragment", id === "ws" ? 0.96 : id === "mm" ? 0.79 : 0.75),
  clusterEdge(id, "doc", "chunk-a", "structure", 0.66),
  clusterEdge(id, "doc", "chunk-c", "structure", 0.62),
  clusterEdge(id, "chunk-a", "element-b", "structure", 0.58),
  clusterEdge(id, "doc", "leaf-1", "branch", 0.35),
  clusterEdge(id, "doc", "leaf-2", "branch", 0.31),
  clusterEdge(id, "doc", "leaf-3", "branch", 0.29),
  clusterEdge(id, "chunk-c", "leaf-4", "branch", 0.26),
  clusterEdge(id, "chunk-a", "leaf-5", "branch", 0.24)
]);

export const documentForestEdges = Object.freeze(DOCUMENT_FOREST_EDGES.concat([
  Object.freeze({ id: "cross:ws-mm", from: "ws:doc", to: "mm:element-c", relation: "semantic", weight: 0.71 }),
  Object.freeze({ id: "cross:kh-mm", from: "kh:doc", to: "mm:element-c", relation: "semantic", weight: 0.68 }),
  Object.freeze({ id: "meta:asset-ws", from: "ws:doc", to: "meta:asset", relation: "metadata", weight: 0.82 }),
  Object.freeze({ id: "meta:symptom-mm", from: "mm:doc", to: "meta:symptom", relation: "metadata", weight: 0.88 }),
  Object.freeze({ id: "meta:condition-kh", from: "kh:doc", to: "meta:condition", relation: "metadata", weight: 0.84 }),
  Object.freeze({ id: "meta:task-ws", from: "ws:doc", to: "meta:task", relation: "metadata", weight: 0.91 }),
  Object.freeze({ id: "meta:task-mm", from: "mm:doc", to: "meta:task", relation: "metadata", weight: 0.87 }),
  Object.freeze({ id: "meta:task-kh", from: "kh:doc", to: "meta:task", relation: "metadata", weight: 0.8 })
]));

export function simulateDocumentForestTraversal({
  nodes = documentForestNodes,
  edges = documentForestEdges,
  seeds = selectDocumentSeeds(),
  pruneThreshold = 0.46,
  maxDepth = 6,
  maxPops = 24,
  topKPerExpansion = 5
} = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const seedNodeIds = seeds.map(({ passage }) => nodes.find((node) => node.kind === "passage" && node.label === passage)?.id).filter(Boolean);
  const seedScoreById = new Map(seedNodeIds.map((id, index) => [id, seeds[index]?.score ?? 0]));
  const scoreById = new Map(seedScoreById);
  const parentById = new Map();
  const visited = new Set();
  const visitedBy = new Map();
  const pruned = new Set();
  const collisions = [];
  const events = [];
  const snapshots = [];
  const queueBySeed = new Map(seedNodeIds.map((seedId) => [seedId, []]));
  const relationOrder = Object.freeze({ canonical: 0, parent: 1, hydrate: 2, metadata: 3, semantic: 4, structure: 5, fragment: 6, branch: 7 });
  const allowedNext = Object.freeze({
    passage: new Set(["canonical"]), element: new Set(["parent", "fragment"]),
    chunk: new Set(["hydrate"]), document: new Set(["metadata", "semantic", "structure", "branch"]),
    metadata: new Set(["semantic"]), dot: new Set(), fragment: new Set()
  });
  const queue = seedNodeIds.map((nodeId) => ({
    nodeId, seedId: nodeId, fromId: null, edgeId: null, relation: "seed", score: seedScoreById.get(nodeId), depth: 0
  }));
  queue.forEach((candidate) => queueBySeed.get(candidate.seedId).push(candidate));

  const sortQueue = () => queue.sort((left, right) => (
    right.score - left.score
    || left.depth - right.depth
    || (relationOrder[left.relation] ?? 99) - (relationOrder[right.relation] ?? 99)
    || left.nodeId.localeCompare(right.nodeId)
  ));
  const snapshot = (current = null) => Object.freeze({
    current,
    queue: Object.freeze(queue.map(({ nodeId, seedId, score, depth }) => Object.freeze({ nodeId, seedId, score, depth }))),
    queues: Object.freeze(Object.fromEntries([...queueBySeed].map(([seedId, items]) => [
      seedId,
      Object.freeze(items.filter((item) => queue.includes(item)).map(({ nodeId, score, depth }) => Object.freeze({ nodeId, score, depth })))
    ]))),
    visited: Object.freeze([...visited]),
    pruned: Object.freeze([...pruned]),
    merged: collisions.length
  });

  sortQueue();
  snapshots.push(snapshot());
  let popCount = 0;
  while (queue.length && popCount < maxPops) {
    sortQueue();
    const candidate = queue.shift();
    const node = nodeById.get(candidate.nodeId);
    if (!node) continue;
    if (visited.has(candidate.nodeId)) {
      const owners = visitedBy.get(candidate.nodeId) ?? new Set();
      if (!owners.has(candidate.seedId)) {
        owners.add(candidate.seedId);
        visitedBy.set(candidate.nodeId, owners);
        collisions.push(Object.freeze({ nodeId: candidate.nodeId, keptFrom: parentById.get(candidate.nodeId)?.nodeId ?? candidate.fromId, droppedFrom: candidate.fromId, seedId: candidate.seedId }));
        events.push(Object.freeze({ type: "merge", ...candidate, visitedBy: Object.freeze([...owners]) }));
        snapshots.push(snapshot(candidate.nodeId));
      }
      continue;
    }
    visited.add(candidate.nodeId);
    popCount += 1;
    visitedBy.set(candidate.nodeId, new Set([candidate.seedId]));
    scoreById.set(candidate.nodeId, candidate.score);
    if (candidate.fromId) parentById.set(candidate.nodeId, Object.freeze({ nodeId: candidate.fromId, edgeId: candidate.edgeId }));
    events.push(Object.freeze({ type: "pop", ...candidate }));

    const relationSet = allowedNext[node.kind] ?? new Set();
    const outgoing = edges
      .filter((edge) => edge.from === candidate.nodeId && relationSet.has(edge.relation))
      .map((edge) => ({ edge, node: nodeById.get(edge.to), score: candidate.score * edge.weight }))
      .filter(({ node: target }) => target)
      .sort((left, right) => right.score - left.score || left.edge.id.localeCompare(right.edge.id));

    outgoing.forEach(({ edge, score }, index) => {
      const depth = candidate.depth + 1;
      const shouldPrune = depth > maxDepth
        || index >= topKPerExpansion
        || (edge.relation === "branch" && score < pruneThreshold);
      if (shouldPrune) {
        pruned.add(edge.to);
        events.push(Object.freeze({ type: "prune", nodeId: edge.to, seedId: candidate.seedId, fromId: candidate.nodeId, edgeId: edge.id, relation: edge.relation, score, depth }));
        return;
      }
      const next = { nodeId: edge.to, seedId: candidate.seedId, fromId: candidate.nodeId, edgeId: edge.id, relation: edge.relation, score, depth };
      queue.push(next);
      queueBySeed.get(candidate.seedId).push(next);
      events.push(Object.freeze({ type: "push", ...next }));
    });
    snapshots.push(snapshot(candidate.nodeId));
  }

  const finalNodeId = [...visited]
    .filter((id) => nodeById.get(id)?.kind === "fragment")
    .sort((left, right) => (scoreById.get(right) ?? 0) - (scoreById.get(left) ?? 0) || left.localeCompare(right))[0] ?? null;
  return Object.freeze({
    seedNodeIds: Object.freeze(seedNodeIds),
    events: Object.freeze(events),
    snapshots: Object.freeze(snapshots),
    visited: Object.freeze([...visited]),
    pruned: Object.freeze([...pruned]),
    collisions: Object.freeze(collisions),
    parents: Object.freeze(Object.fromEntries(parentById)),
    scores: Object.freeze(Object.fromEntries(scoreById)),
    visitedBy: Object.freeze(Object.fromEntries([...visitedBy].map(([id, owners]) => [id, Object.freeze([...owners])]))),
    finalNodeId
  });
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function decorateDocumentCover(article, project) {
  const title = article.querySelector(":scope > h1");
  if (!title) return;
  const deck = title.nextElementSibling?.matches("blockquote") ? title.nextElementSibling : null;
  const cover = createElement("header", "project-document__cover");
  const folio = createElement("div", "project-document__folio");
  folio.append(
    createElement("span", "", `CASE STUDY ${String(project.number).padStart(2, "0")}`),
    createElement("span", "", "PUBLIC TECHNICAL DOCUMENT")
  );
  title.before(cover);
  cover.append(folio, title);
  if (deck) cover.append(deck);

  const taxonomy = createElement("div", "project-document__taxonomy");
  (project.tags ?? []).slice(0, 5).forEach((tag) => taxonomy.append(createElement("span", "", tag)));
  if (taxonomy.children.length) cover.append(taxonomy);

  if (Array.isArray(project.scope) && project.scope.length) {
    const abstract = createElement("section", "project-document__abstract");
    abstract.append(createElement("p", "", "ENGINEERING SCOPE"));
    const list = document.createElement("ol");
    project.scope.slice(0, 4).forEach((item, index) => {
      const listItem = document.createElement("li");
      listItem.append(
        createElement("span", "", String(index + 1).padStart(2, "0")),
        createElement("strong", "", item)
      );
      list.append(listItem);
    });
    abstract.append(list);
    cover.append(abstract);
  }
}

function groupDocumentChapters(article) {
  const children = [...article.children];
  let chapter = null;
  let chapterIndex = 0;
  children.forEach((child) => {
    if (child.matches("h2")) {
      chapterIndex += 1;
      chapter = createElement("section", "project-document__chapter");
      chapter.dataset.chapter = String(chapterIndex).padStart(2, "0");
      child.before(chapter);
      child.dataset.chapter = String(chapterIndex).padStart(2, "0");
    }
    if (chapter && child !== chapter) chapter.append(child);
  });
}

function decorateDocumentFigures(article) {
  [...article.querySelectorAll(".project-document__figure")].forEach((figure, index) => {
    const caption = figure.querySelector("figcaption");
    if (!caption || caption.querySelector(".project-document__figure-label")) return;
    caption.prepend(createElement("span", "project-document__figure-label", `FIGURE ${String(index + 1).padStart(2, "0")}`));
  });
}

function decorateDocumentTables(article) {
  [...article.querySelectorAll(".project-document__table-wrap")].forEach((wrapper, index) => {
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", `프로젝트 문서 표 ${index + 1}`);
  });
}

function appendSvgText(group, node) {
  const centered = node.kind === "diamond";
  const tag = createSvgElement("text", { x: centered ? node.cx : node.x + 16, y: centered ? node.cy - 20 : node.y + 21, class: "execution-node__tag", "text-anchor": centered ? "middle" : "start" });
  tag.textContent = node.tag;
  const label = createSvgElement("text", { x: centered ? node.cx : node.x + 16, y: centered ? node.cy + 3 : node.y + 45, class: "execution-node__label", "text-anchor": centered ? "middle" : "start" });
  label.textContent = node.label;
  const meta = createSvgElement("text", { x: centered ? node.cx : node.x + 16, y: centered ? node.cy + 23 : node.y + 64, class: "execution-node__meta", "text-anchor": centered ? "middle" : "start" });
  meta.textContent = node.meta;
  group.append(tag, label, meta);
}

function createSteelStoryView(stage, eyebrow, title) {
  const view = createElement("section", "execution-story__view");
  view.dataset.storyStage = String(stage);
  const header = createElement("header", "execution-story__view-header");
  header.append(createElement("span", "", eyebrow), createElement("h4", "", title));
  view.append(header);
  return view;
}

function bindScenarioField(element, field) {
  element.dataset.scenarioField = field;
  return element;
}

function createInlineCitation(evidenceId) {
  const citation = createElement("button", "inline-citation", `[${evidenceId}]`);
  citation.type = "button";
  citation.dataset.citationTarget = evidenceId;
  citation.setAttribute("aria-label", `${evidenceId} 근거 확인`);
  return citation;
}

function createAgentReceipt(agent, field, role) {
  const receipt = createElement("article", "agent-receipt");
  const header = createElement("header");
  header.append(createElement("span", "", agent), bindScenarioField(createElement("code"), `${field}.0`));
  receipt.append(
    header,
    bindScenarioField(createElement("strong"), `${field}.1`),
    bindScenarioField(createElement("p"), `${field}.2`),
    createElement("small", "", role)
  );
  return receipt;
}

function createSteelExecutionStory() {
  const root = createElement("aside", "execution-story");
  root.setAttribute("aria-label", "단계별 실행 상세 예시");
  let activeStage = 0;
  let scenarioKey = "coiler";
  const views = [];

  const queryView = createSteelStoryView(0, "01 · APPLICATION TURN", "질의 원문을 그대로 보존");
  const queryBubble = createElement("blockquote", "execution-story__query");
  queryBubble.append(
    createElement("span", "", "USER · turn:184"),
    createElement("p", "", "“2호기 진동 경보가 났어. 공식 절차·현장 사례·현재 상태를 함께 보고 대응 방법을 알려줘.”")
  );
  queryView.append(
    queryBubble,
    createElement("p", "execution-story__notice", "PUBLIC DEMO · 설명용 질의와 결과이며 실제 운영 데이터가 아닙니다."),
    createInfoRows([
      ["PRESERVE", "original_query · session · turn"],
      ["REQUEST", "procedure + cases + current state"]
    ], "execution-story__facts")
  );
  views.push(queryView);

  const semanticView = createSteelStoryView(1, "02 · SEMANTIC REQUEST", "의미 슬롯과 미해결 항목 분리");
  const slots = createElement("div", "semantic-slots");
  [
    ["대상", "2호기", "is-ambiguous", "AMBIGUOUS"],
    ["현상", "진동 경보", "", "GROUNDED"],
    ["요청", "절차 · 사례 · 현재 상태", "", "GROUNDED"],
    ["응답", "조치 순서 + inline 근거", "", "DERIVED"]
  ].forEach(([label, value, className, status]) => {
    const item = createElement("div", `semantic-slot ${className}`.trim());
    item.append(createElement("span", "", label), createElement("strong", "", value), createElement("small", "", status));
    slots.append(item);
  });
  semanticView.append(slots, createElement("p", "execution-story__callout", "‘2호기’가 라인인지 개별 설비인지에 따라 조회 대상과 안전 절차가 달라지므로 HITL로 보냅니다."));
  views.push(semanticView);

  const hitlView = createSteelStoryView(2, "03 · AMBIGUITY GATE", "결과를 바꾸는 한 가지를 확인");
  const hitl = createElement("div", "hitl-dialog");
  hitl.append(createElement("span", "", "AGENT QUESTION"), createElement("strong", "", "‘2호기’는 어느 설비를 뜻하나요?"), createElement("p", "", "선택하면 같은 질의 이해 단계로 돌아가 대상 ID를 확정합니다."));
  const choices = createElement("div", "hitl-dialog__choices");
  Object.entries(STEEL_DEMO_SCENARIOS).forEach(([key, scenario]) => {
    const button = createElement("button", "hitl-choice");
    button.type = "button";
    button.dataset.scenarioChoice = key;
    button.setAttribute("aria-pressed", String(key === scenarioKey));
    button.append(createElement("strong", "", scenario.label), createElement("code", "", scenario.code));
    choices.append(button);
  });
  hitl.append(choices);
  const resolution = createElement("div", "hitl-resolution");
  resolution.append(createElement("span", "", "RESOLVED"), bindScenarioField(createElement("strong"), "label"), bindScenarioField(createElement("code"), "code"));
  hitlView.append(hitl, resolution);
  views.push(hitlView);

  const planView = createSteelStoryView(3, "04 · TASKGRAPH → ACTIONGRAPH", "확정된 대상에 세 임무를 병렬 배치");
  const planScope = createElement("p", "execution-story__scope");
  planScope.append("scope = ", bindScenarioField(createElement("strong"), "label"), " · ", bindScenarioField(createElement("code"), "code"));
  const taskGraph = createElement("ol", "task-graph");
  [
    ["T1", "메뉴얼 Agent", "공식 정지·점검 절차와 정확한 locator"],
    ["T2", "노하우 Agent", "유사 사례와 현재 대상에 맞는 적용 조건"],
    ["T3", "Digital Twin Agent", "현재 진동값·기준선·측정 시각"],
    ["T4", "Finalizer", "T1–T3 fan-in 후 claim별 근거 검증"]
  ].forEach(([id, owner, mission], index) => {
    const item = document.createElement("li");
    item.className = index === 3 ? "is-dependent" : "is-parallel";
    item.append(createElement("code", "", id), createElement("strong", "", owner), createElement("p", "", mission), createElement("small", "", index === 3 ? "depends_on: T1 · T2 · T3" : "parallel · budget 1 call"));
    taskGraph.append(item);
  });
  planView.append(planScope, taskGraph);
  views.push(planView);

  const executionView = createSteelStoryView(4, "05 · TYPED RECEIPTS", "각 Agent가 근거와 해석을 함께 반환");
  const receipts = createElement("div", "agent-receipts");
  receipts.append(
    createAgentReceipt("메뉴얼 Agent", "manual", "normative · source fragment"),
    createAgentReceipt("노하우 Agent", "knowhow", "supporting · applicability"),
    createAgentReceipt("Digital Twin Agent", "twin", "current · timestamped artifact")
  );
  executionView.append(receipts);
  views.push(executionView);

  const ledgerView = createSteelStoryView(5, "06 · EVIDENCE LEDGER", "출처·주장·작업이 맞는 receipt만 채택");
  const ledger = createElement("div", "evidence-ledger");
  [
    ["manual", "T1", "절차 claim", "ACCEPTED"],
    ["knowhow", "T2", "적용 조건 claim", "ACCEPTED"],
    ["twin", "T3", "현재 상태 claim", "ACCEPTED"]
  ].forEach(([field, task, claim, status]) => {
    const row = createElement("div", "evidence-ledger__row");
    row.append(bindScenarioField(createElement("code"), `${field}.0`), createElement("span", "", task), createElement("strong", "", claim), createElement("em", "", status));
    ledger.append(row);
  });
  ledgerView.append(ledger, createInfoRows([
    ["REJECT IF", "locator 없음 · 대상 불일치 · 시각 누락"],
    ["ADOPT", "accepted evidence 3 / unavailable 0 / conflict 0"]
  ], "execution-story__facts"));
  views.push(ledgerView);

  const finalizeView = createSteelStoryView(6, "07 · ANSWER IR", "문장마다 필요한 근거가 있는지 검증");
  const claims = createElement("ol", "answer-claims");
  [
    ["C1", "현재 진동이 기준을 벗어남", ["M-01", "D-01"]],
    ["C2", "공식 절차 4.1에 따라 우선 조치", ["M-01"]],
    ["C3", "유사 사례의 적용 조건도 함께 확인", ["K-01"]]
  ].forEach(([id, claim, citations]) => {
    const item = document.createElement("li");
    const refs = createElement("span", "answer-claims__refs");
    citations.forEach((citation) => refs.append(createElement("code", "", citation)));
    item.append(createElement("code", "", id), createElement("strong", "", claim), refs, createElement("em", "", "VERIFIED"));
    claims.append(item);
  });
  finalizeView.append(claims, createInfoRows([
    ["COVERAGE", "3 / 3 claims have citations"],
    ["TARGET", "3 / 3 evidence IDs resolve"],
    ["DIGEST", "plan · evidence · answer inputs match"]
  ], "execution-story__facts"));
  views.push(finalizeView);

  const answerView = createSteelStoryView(7, "08 · PRODUCTION ANSWER", "근거 ID를 문장 안에 삽입");
  const finalAnswer = createElement("blockquote", "production-answer");
  const answerParagraph = document.createElement("p");
  answerParagraph.append(
    bindScenarioField(createElement("strong"), "label"),
    "의 진동은 점검 기준을 벗어난 상태입니다 ",
    createInlineCitation("M-01"),
    createInlineCitation("D-01"),
    ". 먼저 공식 절차에 따라 부하를 안정화하고 절차 4.1의 점검 순서를 수행하세요 ",
    createInlineCitation("M-01"),
    ". 이후 유사 사례의 적용 조건과 현재 운전 조건을 대조해 원인을 좁힐 수 있습니다 ",
    createInlineCitation("K-01"),
    "."
  );
  finalAnswer.append(answerParagraph);
  const sources = createElement("ol", "production-answer__sources");
  [["manual", "공식 절차"], ["knowhow", "현장 사례"], ["twin", "현재 상태"]].forEach(([field, label]) => {
    const item = document.createElement("li");
    item.dataset.evidenceSource = field === "manual" ? "M-01" : field === "knowhow" ? "K-01" : "D-01";
    item.append(bindScenarioField(createElement("code"), `${field}.0`), createElement("span", "", label), bindScenarioField(createElement("strong"), `${field}.1`));
    sources.append(item);
  });
  answerView.append(finalAnswer, sources);
  views.push(answerView);

  views.forEach((view) => root.append(view));

  function scenarioValue(scenario, field) {
    return field.split(".").reduce((value, key) => value?.[key], scenario);
  }

  function syncScenario() {
    const scenario = STEEL_DEMO_SCENARIOS[scenarioKey];
    root.querySelectorAll("[data-scenario-field]").forEach((element) => {
      element.textContent = scenarioValue(scenario, element.dataset.scenarioField) ?? "";
    });
    root.querySelectorAll("[data-scenario-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.scenarioChoice === scenarioKey));
    });
  }

  root.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-scenario-choice]");
    if (choice) {
      scenarioKey = choice.dataset.scenarioChoice;
      syncScenario();
      return;
    }
    const citation = event.target.closest("[data-citation-target]");
    if (!citation) return;
    const target = citation.dataset.citationTarget;
    root.querySelectorAll("[data-evidence-source]").forEach((source) => {
      source.classList.toggle("is-highlighted", source.dataset.evidenceSource === target);
    });
  });

  function update(stageIndex) {
    activeStage = stageIndex;
    views.forEach((view, index) => {
      view.hidden = index !== activeStage;
    });
    syncScenario();
  }

  update(0);
  return { element: root, update };
}

function createSteelExecutionView() {
  const root = createElement("div", "execution-diagram");
  const query = createElement("div", "execution-diagram__query");
  query.append(
    createElement("span", "", "DEMO REQUEST"),
    createElement("strong", "", `“${STEEL_DEMO_QUERY}”`)
  );
  const viewport = createElement("div", "execution-diagram__viewport");
  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${STEEL_TRAJECTORY_VIEWBOX.width} ${STEEL_TRAJECTORY_VIEWBOX.height}`,
    role: "img",
    "aria-labelledby": "steel-trajectory-title steel-trajectory-desc"
  });
  const title = createSvgElement("title", { id: "steel-trajectory-title" });
  title.textContent = "Steel Domain AI Agent 실행 흐름";
  const desc = createSvgElement("desc", { id: "steel-trajectory-desc" });
  desc.textContent = "원문 E2E Agent Loop와 도구 Agent Orchestrator 구조를 결합한 단계별 실행 도식";
  const defs = createSvgElement("defs");
  const marker = createSvgElement("marker", { id: "execution-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
  marker.append(createSvgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "execution-arrowhead" }));
  defs.append(marker);
  svg.append(title, desc, defs);

  const boundary = createSvgElement("g", { class: "execution-boundary" });
  boundary.append(createSvgElement("rect", { x: 12, y: 632, width: 416, height: 324, rx: 8 }));
  const boundaryLabel = createSvgElement("text", { x: 24, y: 652 });
  boundaryLabel.textContent = "DOMAIN EXECUTION · EVIDENCE LOOP";
  boundary.append(boundaryLabel);
  svg.append(boundary);

  const edgeGroup = createSvgElement("g", { class: "execution-edges" });
  STEEL_EDGES.forEach((edge) => {
    const path = createSvgElement("path", {
      d: edge.d,
      "data-flow-edge": edge.id,
      "data-stage": edge.stage,
      class: edge.optional ? "is-optional" : "",
      "marker-end": "url(#execution-arrow)"
    });
    edgeGroup.append(path);
    if (edge.label) {
      const width = Math.max(40, edge.label.length * 12 + 16);
      const mask = createSvgElement("rect", { x: edge.labelX - (width / 2), y: edge.labelY - 13, width, height: 16, rx: 4, class: "execution-edge__label-bg" });
      const label = createSvgElement("text", { x: edge.labelX, y: edge.labelY, class: "execution-edge__label", "text-anchor": "middle" });
      label.textContent = edge.label;
      edgeGroup.append(mask, label);
    }
  });
  svg.append(edgeGroup);

  const nodeGroup = createSvgElement("g", { class: "execution-nodes" });
  STEEL_NODES.forEach((node) => {
    const group = createSvgElement("g", { class: `execution-node execution-node--${node.kind ?? "process"}`, "data-flow-node": node.id, "data-stage": node.stage });
    if (node.kind === "diamond") {
      group.append(createSvgElement("path", { d: `M${node.cx} ${node.cy - node.ry} L${node.cx + node.rx} ${node.cy} L${node.cx} ${node.cy + node.ry} L${node.cx - node.rx} ${node.cy} Z` }));
    } else {
      group.append(createSvgElement("rect", { x: node.x, y: node.y, width: node.w, height: node.h, rx: node.kind === "terminal" ? node.h / 2 : 8 }));
    }
    appendSvgText(group, node);
    nodeGroup.append(group);
  });
  svg.append(nodeGroup);
  viewport.append(svg);
  const story = createSteelExecutionStory();
  const workspace = createElement("div", "execution-diagram__workspace");
  workspace.append(viewport, story.element);
  root.append(query, workspace);

  function update(stageIndex) {
    [...svg.querySelectorAll("[data-flow-node]")].forEach((node) => {
      const stage = Number(node.dataset.stage);
      node.classList.toggle("is-active", stage === stageIndex);
      node.classList.toggle("is-complete", stage < stageIndex);
    });
    [...svg.querySelectorAll("[data-flow-edge]")].forEach((edge) => {
      const stage = Number(edge.dataset.stage);
      edge.classList.toggle("is-active", stage === stageIndex);
      edge.classList.toggle("is-complete", stage < stageIndex);
    });
    svg.querySelectorAll(".execution-token").forEach((token) => token.remove());
    story.update(stageIndex);
    window.requestAnimationFrame(() => {
      const activeNodes = STEEL_NODES.filter(({ stage }) => stage === stageIndex);
      const centers = activeNodes.map((node) => node.kind === "diamond" ? node.cy : node.y + node.h / 2);
      const center = centers.reduce((sum, value) => sum + value, 0) / centers.length;
      const scale = svg.getBoundingClientRect().height / STEEL_TRAJECTORY_VIEWBOX.height;
      const top = Math.max(0, center * scale - viewport.clientHeight / 2);
      viewport.scrollTo({ top, behavior: reducedMotionRequested() ? "auto" : "smooth" });
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    STEEL_EDGES.filter(({ stage }) => stage === stageIndex).forEach((edge, index) => {
      const token = createSvgElement("circle", { r: 5, class: "execution-token" });
      const motion = createSvgElement("animateMotion", { path: edge.d, dur: "1.15s", begin: `${index * 0.12}s`, fill: "freeze" });
      token.append(motion);
      svg.append(token);
    });
  }
  return { element: root, update };
}

function createSampleDocument() {
  const shell = createElement("section", "document-sample");
  const header = createElement("header", "document-sample__header");
  header.append(
    createElement("span", "", "PUBLIC DEMO DOCUMENT"),
    createElement("strong", "", "WS-001 · PAGE 12 / 18")
  );
  const page = createElement("article", "document-sample__page");
  page.dataset.documentStage = "0";
  page.append(createElement("span", "document-sample__watermark", "설명용 공개 샘플 · 실제 업무 원문 아님"));

  const masthead = createElement("div", "sample-block sample-block--masthead");
  masthead.dataset.blockId = "b-01";
  masthead.dataset.elementId = "el:title-01";
  masthead.append(createElement("small", "", "작업표준 · WS-001"), createElement("h4", "", "설비 점검 작업표준"), createElement("p", "", "3. 운전 중 점검"));

  const sectionA = createElement("section", "sample-block sample-block--text");
  sectionA.dataset.blockId = "b-02";
  sectionA.dataset.chunkId = "chk:3.2";
  sectionA.dataset.elementId = "el:text-02";
  sectionA.append(createElement("h5", "", "3.2 점검 순서"), createElement("p", "", "운전 상태에서 소음, 진동과 온도 항목을 순서대로 확인하고 점검 결과를 기록한다."));

  const tableBlock = createElement("section", "sample-block sample-block--table");
  tableBlock.dataset.blockId = "b-03";
  tableBlock.dataset.chunkId = "chk:3.2";
  tableBlock.dataset.elementId = "el:table-01";
  tableBlock.append(createElement("h5", "", "표 3-1. 운전 중 점검 항목"));
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["점검 항목", "확인 기준", "연결 절차"].forEach((text) => headRow.append(createElement("th", "", text)));
  head.append(headRow);
  const body = document.createElement("tbody");
  [
    ["소음", "평상시 상태와 비교", "기록 후 추세 확인"],
    ["진동", "허용 범위 이내", "이탈 시 절차 4.1 확인"],
    ["온도", "운전 범위 이내", "이상 시 점검 중지"]
  ].forEach((cells, index) => {
    const row = document.createElement("tr");
    if (index === 1) row.dataset.citationRow = "row-02";
    cells.forEach((text) => row.append(createElement("td", "", text)));
    body.append(row);
  });
  table.append(head, body);
  tableBlock.append(table);

  const figureBlock = createElement("section", "sample-block sample-block--figure");
  figureBlock.dataset.blockId = "b-04";
  figureBlock.dataset.chunkId = "chk:3.3";
  figureBlock.dataset.elementId = "el:figure-01";
  figureBlock.append(createElement("h5", "", "그림 3-2. 측정 위치"));
  const sketch = createElement("div", "sample-figure-sketch");
  sketch.append(createElement("i"), createElement("i"), createElement("i"));
  figureBlock.append(sketch, createElement("p", "", "측정 위치 A–C를 같은 순서로 기록한다."));

  [masthead, sectionA, tableBlock, figureBlock].forEach((block) => {
    block.append(createElement("span", "sample-block__identity"));
    page.append(block);
  });
  shell.append(header, page);
  return { shell, page };
}

function createInfoRows(rows, className = "workbench-info") {
  const list = createElement("dl", className);
  rows.forEach(([term, value]) => {
    const row = document.createElement("div");
    row.append(createElement("dt", "", term), createElement("dd", "", value));
    list.append(row);
  });
  return list;
}

function createTreeNode(label, value, className = "") {
  const item = document.createElement("li");
  if (className) item.className = className;
  item.append(createElement("span", "", label), createElement("strong", "", value));
  return item;
}

function createCanonicalTree() {
  const tree = createElement("div", "canonical-tree");
  tree.append(createElement("p", "workbench-view__eyebrow", "CANONICAL IDENTITY TREE"));
  const root = document.createElement("ul");
  const documentNode = createTreeNode("DOCUMENT", "doc:ws-001", "tree-node--document");
  const chunks = document.createElement("ul");
  const chunkA = createTreeNode("CHUNK", "chk:3.2 · 점검 순서", "tree-node--chunk is-visited");
  const elementsA = document.createElement("ul");
  elementsA.append(
    createTreeNode("ELEMENT", "el:text-02 · text"),
    createTreeNode("ELEMENT", "el:table-01 · table", "is-selected")
  );
  chunkA.append(elementsA);
  const chunkB = createTreeNode("CHUNK", "chk:3.3 · 측정 위치", "tree-node--chunk");
  const elementsB = document.createElement("ul");
  elementsB.append(createTreeNode("ELEMENT", "el:figure-01 · figure"));
  chunkB.append(elementsB);
  chunks.append(chunkA, chunkB);
  documentNode.append(chunks);
  root.append(documentNode);
  tree.append(root);
  return tree;
}

function createRetrievalResults() {
  const view = createElement("div", "retrieval-results");
  const query = createElement("div", "retrieval-query");
  query.append(createElement("span", "", "QUERY"), createElement("strong", "", "점검 중 진동 기준과 이상 시 연결 절차는?"));
  const list = createElement("ol", "retrieval-results__list retrieval-results__list--compact");
  SEARCH_RESULTS.forEach((result, index) => {
    const item = document.createElement("li");
    item.className = result.seed ? "is-seed" : "";
    item.style.setProperty("--result-order", index);
    const rank = createElement("span", "retrieval-result__rank", String(index + 1).padStart(2, "0"));
    const copy = createElement("div", "retrieval-result__copy");
    copy.append(createElement("strong", "", result.document), createElement("p", "", result.excerpt), createElement("code", "", result.passage));
    const score = createElement("div", "retrieval-result__score");
    score.style.setProperty("--score", String(result.score));
    score.append(createElement("span", "", result.seed ? "SEED" : "CANDIDATE"), createElement("strong", "", result.score.toFixed(2)));
    item.append(rank, copy, score);
    list.append(item);
  });
  const selected = createElement("section", "document-forest document-forest--selection");
  selected.append(createElement("p", "workbench-view__eyebrow", "PASSAGE SEED → SELECTED DOCUMENT ROOT"));
  const roots = createElement("div", "document-forest__roots");
  DOCUMENT_FOREST.forEach((documentNode) => {
    const selectedChunk = documentNode.chunks.find((chunk) => chunk.visited);
    const selectedElement = selectedChunk?.elements?.find((element) => element.selected);
    const card = createElement("article", "forest-root is-selected");
    const head = createElement("header");
    head.append(createElement("span", "", `SEED ${String(documentNode.rank).padStart(2, "0")}`), createElement("strong", "", documentNode.score.toFixed(2)));
    const path = createElement("div", "forest-root__path");
    [
      ["PASSAGE", documentNode.passage],
      ["DOCUMENT", documentNode.document],
      ["CHUNK", selectedChunk?.id],
      ["ELEMENT", selectedElement?.id]
    ].forEach(([label, value], index, all) => {
      const node = createElement("div", "forest-root__node");
      node.append(createElement("span", "", label), createElement("code", "", value));
      path.append(node);
      if (index < all.length - 1) path.append(createElement("i", "", "→"));
    });
    card.append(head, createElement("h5", "", documentNode.title), path);
    roots.append(card);
  });
  selected.append(roots, createElement("p", "forest-rejected", "보류된 document roots · doc:ws-001/chk:3.1 · doc:mm-021 · doc:op-008"));
  view.append(query, list, createElement("p", "retrieval-results__note", "DEMO SCORE · Passage 6개를 검색한 뒤 상위 3개를 seed로 선택"), selected);
  return view;
}

function createForestTreeNode(type, id, label, options = {}) {
  const item = document.createElement("li");
  item.className = ["forest-tree__item", options.visited ? "is-visited" : "", options.selected ? "is-selected" : "", options.final ? "is-final" : ""].filter(Boolean).join(" ");
  if (options.order) item.style.setProperty("--visit-order", options.order);
  const node = createElement("div", "forest-tree__node");
  node.append(createElement("span", "", type), createElement("code", "", id));
  if (label) node.append(createElement("small", "", label));
  if (options.order) node.append(createElement("em", "", String(options.order).padStart(2, "0")));
  item.append(node);
  return item;
}

function createDetailedDocumentTree(documentNode, treeIndex) {
  const card = createElement("article", "document-tree");
  card.style.setProperty("--tree-order", treeIndex);
  const header = createElement("header", "document-tree__header");
  header.append(createElement("span", "", `SEED ${String(documentNode.rank).padStart(2, "0")} · ${documentNode.score.toFixed(2)}`), createElement("code", "", documentNode.passage));
  const mapping = createElement("div", "document-tree__mapping");
  mapping.style.setProperty("--visit-order", 1);
  mapping.append(createElement("span", "", "01 · Passage hit"), createElement("strong", "", "return_node_id로 canonical Element 매핑"));

  const tree = createElement("ol", "forest-tree");
  const documentItem = createForestTreeNode("DOCUMENT · 04 hydrate root", documentNode.document, documentNode.title, { visited: true, order: 4 });
  const chunks = createElement("ol", "forest-tree__children");
  documentNode.chunks.forEach((chunk) => {
    const chunkItem = createForestTreeNode(chunk.visited ? "CHUNK · 03 ascend parent" : "CHUNK", chunk.id, chunk.label, { visited: chunk.visited, order: chunk.visited ? 3 : null });
    if (chunk.elements) {
      const elements = createElement("ol", "forest-tree__children");
      chunk.elements.forEach((element) => {
        const elementItem = createForestTreeNode(
          element.selected ? "ELEMENT · 02 return node" : "ELEMENT · 05 expand neighbor",
          element.id,
          element.label,
          { visited: element.visited, selected: element.selected, order: element.selected ? 2 : element.visited ? 5 : null }
        );
        if (element.fragments) {
          const fragments = createElement("ol", "forest-tree__children forest-tree__fragments");
          element.fragments.forEach((fragment) => {
            const final = fragment === "row-02";
            fragments.append(createForestTreeNode(final ? "FRAGMENT · 06 select" : "FRAGMENT", `fragment:${fragment}`, final ? "exact citation locator" : "candidate row", { visited: final, selected: final, final, order: final ? 6 : null }));
          });
          elementItem.append(fragments);
        }
        elements.append(elementItem);
      });
      chunkItem.append(elements);
    }
    chunks.append(chunkItem);
  });
  documentItem.append(chunks);
  tree.append(documentItem);
  card.append(header, mapping, tree);
  return card;
}

function appendForestText(group, x, y, text, className, anchor = "start") {
  const label = createSvgElement("text", { x, y, class: className, "text-anchor": anchor });
  label.textContent = text;
  group.append(label);
  return label;
}

function createForestPlane(documentNode, layout, stageIndex) {
  const { x, y, width, height, scale = 1 } = layout;
  const group = createSvgElement("g", {
    class: `document-plane document-plane--seed-${documentNode.rank}`,
    transform: `translate(${x} ${y}) scale(${scale})`,
    "data-forest-document": documentNode.document
  });
  const selectedChunk = documentNode.chunks.find((chunk) => chunk.visited);
  const selectedElement = selectedChunk?.elements?.find((element) => element.selected);
  const neighbor = selectedChunk?.elements?.find((element) => element.visited && !element.selected);
  const directResult = documentNode.rank === 1;

  [3, 2, 1].forEach((depth) => {
    group.append(createSvgElement("rect", {
      x: depth * 7,
      y: -depth * 8,
      width,
      height,
      rx: 8,
      class: "document-plane__depth"
    }));
  });
  group.append(createSvgElement("rect", { x: 0, y: 0, width, height, rx: 8, class: "document-plane__sheet" }));
  group.append(createSvgElement("path", { d: `M0 58 H${width}`, class: "document-plane__rule" }));
  appendForestText(group, 18, 22, `SEED ${String(documentNode.rank).padStart(2, "0")} · SCORE ${documentNode.score.toFixed(2)}`, "document-plane__kicker");
  appendForestText(group, 18, 43, documentNode.title, "document-plane__title");
  appendForestText(group, width - 18, 22, documentNode.document, "document-plane__id", "end");

  const passage = createSvgElement("g", { class: "forest-card forest-card--passage is-active", "data-visit-order": 1 });
  passage.append(createSvgElement("rect", { x: 18, y: 78, width: width - 36, height: 54, rx: 5 }));
  appendForestText(passage, 30, 97, "01 · PASSAGE HIT", "forest-card__type");
  appendForestText(passage, 30, 119, documentNode.passage, "forest-card__id");
  group.append(passage);

  const element = createSvgElement("g", { class: `forest-card forest-card--element ${stageIndex >= 5 ? "is-active" : ""}`, "data-visit-order": 2 });
  element.append(createSvgElement("rect", { x: 30, y: 158, width: width - 104, height: 66, rx: 5 }));
  appendForestText(element, 42, 178, "02 · CANONICAL ELEMENT", "forest-card__type");
  appendForestText(element, 42, 200, selectedElement?.id ?? "return_node_id", "forest-card__id");
  appendForestText(element, 42, 214, selectedElement?.label ?? "return_node_id", "forest-card__meta");
  group.append(element);

  const chunk = createSvgElement("g", { class: `forest-card forest-card--chunk ${stageIndex >= 5 ? "is-active" : ""}`, "data-visit-order": 3 });
  chunk.append(createSvgElement("rect", { x: 45, y: 246, width: width - 88, height: 60, rx: 5 }));
  appendForestText(chunk, 57, 267, "03 · PARENT CHUNK", "forest-card__type");
  appendForestText(chunk, 57, 290, `${selectedChunk?.id} · ${selectedChunk?.label}`, "forest-card__id");
  group.append(chunk);

  const hydrate = createSvgElement("g", { class: `forest-hydrate ${stageIndex >= 5 ? "is-active" : ""}`, "data-visit-order": 4 });
  hydrate.append(createSvgElement("path", { d: `M12 64 H${width - 12} V${height - 12} H12 Z` }));
  appendForestText(hydrate, width - 18, height - 18, "04 · DOCUMENT HYDRATED", "forest-hydrate__label", "end");
  group.append(hydrate);

  const neighborGroup = createSvgElement("g", { class: `forest-neighbors ${stageIndex >= 5 ? "is-active" : ""}`, "data-visit-order": 5 });
  [
    [width - 52, 166], [width - 35, 182], [width - 62, 201], [width - 30, 218], [width - 80, 224]
  ].forEach(([cx, cy], index) => neighborGroup.append(createSvgElement("circle", { cx, cy, r: index === 2 ? 5 : 3 })));
  if (neighbor) appendForestText(neighborGroup, width - 28, 241, "05 · 1-HOP NEIGHBOR", "forest-neighbors__label", "end");
  group.append(neighborGroup);

  const fragment = createSvgElement("g", {
    class: `forest-card forest-card--fragment ${stageIndex >= 5 && directResult ? "is-active is-final" : ""}`,
    "data-visit-order": 6
  });
  fragment.append(createSvgElement("rect", { x: 70, y: 330, width: width - 98, height: 58, rx: 5 }));
  appendForestText(fragment, 82, 350, directResult ? "06 · EXACT FRAGMENT" : "CANONICAL RESULT", "forest-card__type");
  appendForestText(fragment, 82, 373, directResult ? "fragment:row-02 · p.12 · bbox" : selectedElement?.id, "forest-card__id");
  group.append(fragment);

  const pathClass = stageIndex >= 5 ? "forest-visit-path is-active" : "forest-visit-path";
  group.append(createSvgElement("path", {
    d: `M${width / 2} 132 C${width / 2} 145 90 142 90 158 V224 C90 236 110 234 110 246 V306 C110 318 128 316 128 330`,
    class: pathClass
  }));
  if (stageIndex >= 5) {
    group.append(createSvgElement("path", {
      d: `M${width - 75} 190 C${width - 95} 210 ${width - 118} 234 ${width - 130} 247`,
      class: "forest-neighbor-path is-active"
    }));
  }
  return group;
}

function createDocumentForestSvg(stageIndex, mobile = false) {
  const svg = createSvgElement("svg", {
    viewBox: mobile ? "0 0 420 1270" : "0 0 1080 610",
    role: "img",
    class: mobile ? "document-forest-svg document-forest-svg--mobile" : "document-forest-svg document-forest-svg--desktop",
    "aria-label": "상위 세 Passage가 서로 다른 문서 평면의 seed가 되고 canonical Element, parent Chunk, Document, 이웃, 정확한 Fragment 순으로 탐색되는 2.5D 문서 포레스트"
  });
  const title = createSvgElement("title");
  title.textContent = "Seed-guided 2.5D document forest";
  const desc = createSvgElement("desc");
  desc.textContent = "세 문서를 깊이 방향으로 어긋나게 배치하고 방문 경로의 주요 노드만 문서 카드로 펼친 시각화";
  svg.append(title, desc);
  const seeds = selectDocumentSeeds();
  const seedByPassage = new Map(seeds.map((seed) => [seed.passage, seed]));
  const layouts = mobile
    ? [
        { x: 42, y: 34, width: 320, height: 405 },
        { x: 50, y: 440, width: 320, height: 405 },
        { x: 58, y: 846, width: 320, height: 405 }
      ]
    : [
        { x: 40, y: 130, width: 300, height: 405 },
        { x: 382, y: 88, width: 300, height: 405 },
        { x: 724, y: 46, width: 300, height: 405 }
      ];
  DOCUMENT_FOREST.forEach((documentNode, index) => {
    const source = seedByPassage.get(documentNode.passage);
    svg.append(createForestPlane({ ...documentNode, score: source?.score ?? documentNode.score }, layouts[index], stageIndex));
  });
  if (!mobile) {
    appendForestText(svg, 38, 585, "DEPTH → independent document planes · labels expand only on the active traversal path", "document-forest-svg__legend");
  }
  return svg;
}

function forestCoordinates(node, mobile) {
  return mobile ? [node.mobileX, node.mobileY] : [node.x, node.y];
}

function convergedForestCoordinates(node, mobile, progress) {
  const source = forestCoordinates(node, mobile);
  if (progress < 0.68 || !["ws:element-c", "ws:fragment", "mm:element-c", "kh:element-c"].includes(node.id)) return source;
  const convergence = mobile
    ? { "ws:element-c": [154, 742], "mm:element-c": [210, 720], "kh:element-c": [264, 748], "ws:fragment": [210, 800] }
    : { "ws:element-c": [490, 344], "mm:element-c": [552, 316], "kh:element-c": [616, 348], "ws:fragment": [552, 408] };
  const target = convergence[node.id];
  const mix = Math.min(1, (progress - 0.68) / 0.24);
  return [source[0] + ((target[0] - source[0]) * mix), source[1] + ((target[1] - source[1]) * mix)];
}

let forestSvgInstance = 0;

function createForestGraphSvg(frontierIndex, selectedNodeId, mobile = false, activeSeedCount = 3) {
  const traversal = simulateDocumentForestTraversal();
  const boundedFrontier = Math.max(0, Math.min(frontierIndex, traversal.snapshots.length - 1));
  const snapshot = traversal.snapshots[boundedFrontier];
  const progress = boundedFrontier / Math.max(1, traversal.snapshots.length - 1);
  const visited = new Set(snapshot.visited);
  const current = new Set(snapshot.current ? [snapshot.current] : []);
  const pruned = new Set(snapshot.pruned);
  const activeEdgeIds = new Set([...visited].map((id) => traversal.parents[id]?.edgeId).filter(Boolean));
  const instanceId = ++forestSvgInstance;
  const titleId = `graph-forest-title-${instanceId}`;
  const descId = `graph-forest-desc-${instanceId}`;
  const svg = createSvgElement("svg", {
    viewBox: mobile ? "0 0 380 1160" : "-60 0 1160 620",
    role: "img",
    class: mobile ? "bfs-forest bfs-forest--mobile" : "bfs-forest bfs-forest--desktop",
    "aria-labelledby": `${titleId} ${descId}`
  });
  const title = createSvgElement("title", { id: titleId });
  title.textContent = "다중 seed best-first 문서 포레스트";
  const desc = createSvgElement("desc", { id: descId });
  desc.textContent = "상위 세 Passage의 우선순위 큐에서 후보를 하나씩 선택하고 canonical·parent·metadata·semantic 관계를 제한적으로 확장해 정확한 Fragment로 수렴하는 그래프";
  svg.append(title, desc);

  const clusterLayer = createSvgElement("g", { class: "bfs-forest__clusters" });
  FOREST_CLUSTER_LAYOUTS.forEach((cluster, index) => {
    const [cx, cy] = mobile ? cluster.mobileOrigin : cluster.origin;
    const hull = createSvgElement("ellipse", { cx, cy, rx: mobile ? 166 : 214, ry: mobile ? 174 : 190, class: `bfs-cluster bfs-cluster--${index + 1}` });
    clusterLayer.append(hull);
    appendForestText(clusterLayer, cx - (mobile ? 150 : 198), cy - (mobile ? 156 : 172), `${String(index + 1).padStart(2, "0")} · ${cluster.title.toUpperCase()}`, "bfs-cluster__label");
  });
  svg.append(clusterLayer);

  const edgeLayer = createSvgElement("g", { class: "bfs-forest__edges" });
  const nodeById = new Map(documentForestNodes.map((node) => [node.id, node]));
  documentForestEdges.forEach((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return;
    const [x1, y1] = convergedForestCoordinates(from, mobile, progress);
    const [x2, y2] = convergedForestCoordinates(to, mobile, progress);
    const curve = Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 18 : -18;
    const path = createSvgElement("path", {
      d: `M${x1} ${y1} Q${(x1 + x2) / 2 + curve} ${(y1 + y2) / 2 - curve} ${x2} ${y2}`,
      class: `bfs-edge bfs-edge--${edge.relation}${activeEdgeIds.has(edge.id) ? " is-active" : ""}`,
      "data-edge-id": edge.id
    });
    edgeLayer.append(path);
  });
  svg.append(edgeLayer);

  const nodeLayer = createSvgElement("g", { class: "bfs-forest__nodes" });
  documentForestNodes.forEach((node) => {
    const [x, y] = convergedForestCoordinates(node, mobile, progress);
    const [sourceX, sourceY] = forestCoordinates(node, mobile);
    const state = current.has(node.id) ? "frontier" : visited.has(node.id) ? "visited" : pruned.has(node.id) ? "pruned" : "idle";
    const group = createSvgElement("g", {
      class: `bfs-node bfs-node--${node.kind} bfs-node--cluster-${node.clusterIndex + 1}${node.id === selectedNodeId ? " is-selected" : ""}`,
      transform: `translate(${x} ${y})`,
      tabindex: 0,
      role: "button",
      "aria-label": `${node.kind} ${node.label} · ${state}`,
      "data-forest-node-id": node.id,
      "data-node-state": state
    });
    const seedRank = traversal.seedNodeIds.indexOf(node.id);
    if (seedRank >= 0) {
      group.dataset.seedRank = String(seedRank + 1);
      group.classList.toggle("is-seed-activated", seedRank < activeSeedCount);
    }
    if (progress >= 0.68 && (sourceX !== x || sourceY !== y)) {
      edgeLayer.append(createSvgElement("path", {
        d: `M${sourceX} ${sourceY} Q${(sourceX + x) / 2} ${(sourceY + y) / 2 - 20} ${x} ${y}`,
        class: "bfs-edge bfs-edge--tether"
      }));
    }
    if (node.kind === "document") {
      group.append(createSvgElement("rect", { x: -34, y: -23, width: 68, height: 46, rx: 6, class: "bfs-node__document" }));
      group.append(createSvgElement("path", { d: "M20 -23 V-10 H34", class: "bfs-node__fold" }));
    } else if (node.kind === "metadata") {
      group.append(createSvgElement("rect", { x: -58, y: -14, width: 116, height: 28, rx: 4, class: "bfs-node__metadata" }));
    } else {
      const radius = node.kind === "passage" ? 17 : node.kind === "fragment" ? 15 : node.kind === "chunk" ? 12 : node.kind === "element" ? 8 : 3.5;
      group.append(createSvgElement("circle", { r: radius, class: "bfs-node__circle" }));
      if (["passage", "chunk"].includes(node.kind)) group.append(createSvgElement("circle", { r: radius + 5, class: "bfs-node__ring" }));
    }
    if (visited.has(node.id) || node.id === selectedNodeId || node.kind === "metadata") {
      const label = createSvgElement("g", { class: "bfs-node__label" });
      const width = Math.min(190, Math.max(88, node.label.length * 6.1));
      label.append(createSvgElement("rect", { x: -width / 2, y: node.kind === "document" ? 30 : 24, width, height: 31, rx: 4 }));
      appendForestText(label, 0, node.kind === "document" ? 43 : 37, node.kind.toUpperCase(), "bfs-node__type", "middle");
      appendForestText(label, 0, node.kind === "document" ? 55 : 49, node.label, "bfs-node__text", "middle");
      group.append(label);
    }
    if (current.has(node.id)) {
      appendForestText(group, 0, -24, `POP ${String(boundedFrontier).padStart(2, "0")}`, "bfs-node__order", "middle");
    }
    nodeLayer.append(group);
  });
  svg.append(nodeLayer);
  return svg;
}

function forestNodeDetail(nodeId, frontierIndex) {
  const node = documentForestNodes.find((candidate) => candidate.id === nodeId) ?? documentForestNodes.find(({ id }) => id === "ws:passage");
  const traversal = simulateDocumentForestTraversal();
  const score = traversal.scores[node.id];
  const detail = createElement("aside", "bfs-forest-detail");
  detail.append(
    createElement("span", "", `${node.kind.toUpperCase()} · POP ${String(frontierIndex).padStart(2, "0")}`),
    createElement("strong", "", node.label),
    createElement("code", "", node.id),
    createElement("p", "", node.kind === "passage"
      ? "검색 score 상위 Passage가 traversal queue의 시작점이 됩니다."
      : node.kind === "element"
        ? "return_node_id로 검색 표현에서 canonical Element identity를 복구합니다."
        : node.kind === "chunk"
          ? "parent edge를 따라 주제 경계와 인접 Element를 포함한 Chunk로 올라갑니다."
          : node.kind === "document"
            ? "Document root에서 문서 구조와 1-hop semantic neighbor를 제한적으로 확장합니다."
            : node.kind === "fragment"
              ? "가장 직접적인 branch에서 page·bbox가 있는 exact Fragment locator를 확정합니다."
              : "현재 탐색 경로의 보조 노드입니다."),
    createElement("small", "", Number.isFinite(score) ? `PATH SCORE · ${score.toFixed(3)}` : "NOT IN ACTIVE PATH")
  );
  return detail;
}

function createDocumentForestScene(stageIndex) {
  const root = createElement("section", "document-forest-scene");
  const traversal = simulateDocumentForestTraversal();
  const isResolved = stageIndex >= 6;
  let frontierIndex = isResolved ? traversal.snapshots.length - 1 : 0;
  let selectedNodeId = isResolved ? traversal.finalNodeId : traversal.seedNodeIds[0];
  let timer = null;
  const seedTimers = new Set();
  const frameTimers = new Set();
  let frameVersion = 0;
  let activeSeedCount = stageIndex === 4 ? 0 : 3;
  const header = createElement("header", "document-forest-scene__header");
  const heading = createElement("div");
  heading.append(
    createElement("p", "workbench-view__eyebrow", stageIndex === 4 ? "RANKED RETRIEVAL → TOP 3 SEEDS" : stageIndex === 5 ? "BOUNDED MULTI-SOURCE BEST-FIRST GRAPH TRAVERSAL" : "SOURCE-BOUND RESULT"),
    createElement("h4", "", stageIndex === 4 ? "Passage 점수 상위 3개가 포레스트의 seed가 됩니다" : stageIndex === 5 ? "세 priority queue에서 가장 강한 후보를 하나씩 pop하고 가지치기·병합합니다" : "가장 강한 path에서 정확한 Fragment를 인용합니다")
  );
  const play = createElement("button", "bfs-forest-play", isResolved ? "탐색 완료" : "그래프 탐색 실행 ▶");
  play.type = "button";
  play.disabled = isResolved;
  play.hidden = stageIndex === 4;
  header.append(heading, play);
  root.append(header);

  if (stageIndex === 4) {
    const ranking = createElement("ol", "forest-ranking");
    SEARCH_RESULTS.forEach((result, index) => {
      const item = document.createElement("li");
      const seeded = selectDocumentSeeds().some(({ passage }) => passage === result.passage);
      item.dataset.seedRank = seeded ? String(selectDocumentSeeds().findIndex(({ passage }) => passage === result.passage) + 1) : "";
      item.dataset.seedStatus = seeded && Number(item.dataset.seedRank) <= activeSeedCount ? "selected" : seeded ? "pending" : "candidate";
      item.append(
        createElement("span", "", String(index + 1).padStart(2, "0")),
        createElement("strong", "", result.document),
        createElement("code", "", result.passage),
        createElement("em", "", result.score.toFixed(2)),
        createElement("small", "", seeded ? "SEED" : "HOLD")
      );
      ranking.append(item);
    });
    root.append(ranking);
  }

  const stats = createElement("div", "bfs-forest-stats");
  const viewport = createElement("div", "document-forest-scene__viewport bfs-forest-viewport");
  const detailRoot = createElement("div", "bfs-forest-detail-root");
  root.append(stats, viewport, detailRoot);

  function replaceGraphFrames() {
    const nextFrames = [
      createForestGraphSvg(frontierIndex, selectedNodeId, false, activeSeedCount),
      createForestGraphSvg(frontierIndex, selectedNodeId, true, activeSeedCount)
    ];
    const previousFrames = [...viewport.querySelectorAll(":scope > svg")];
    frameVersion += 1;
    const version = frameVersion;
    frameTimers.forEach((timer) => window.clearTimeout(timer));
    frameTimers.clear();
    if (!previousFrames.length || reducedMotionRequested()) {
      viewport.replaceChildren(...nextFrames);
      nextFrames.forEach((frame) => { frame.dataset.graphFrameState = "active"; });
      return;
    }
    previousFrames.forEach((frame) => {
      frame.dataset.graphFrameState = "leaving";
      frame.setAttribute("aria-hidden", "true");
    });
    nextFrames.forEach((frame) => {
      frame.dataset.graphFrameState = "entering";
      viewport.append(frame);
    });
    window.requestAnimationFrame(() => {
      if (version !== frameVersion || !root.isConnected) return;
      nextFrames.forEach((frame) => { frame.dataset.graphFrameState = "active"; });
      const timer = window.setTimeout(() => {
        frameTimers.delete(timer);
        if (version !== frameVersion) return;
        previousFrames.forEach((frame) => frame.remove());
      }, SIMULATION_TRANSITION_TIMINGS.enterMs);
      frameTimers.add(timer);
    });
  }

  function render() {
    const snapshot = traversal.snapshots[frontierIndex];
    const currentEvent = traversal.events[Math.max(0, frontierIndex - 1)];
    stats.replaceChildren();
    [
      ["CURRENT POP", currentEvent?.nodeId ?? "seed queues ready"],
      ["QUEUE", String(snapshot.queue.length)],
      ["DEPTH", String(currentEvent?.depth ?? 0)],
      ["VISITED", String(snapshot.visited.length)],
      ["PRUNED", String(snapshot.pruned.length)],
      ["MERGED", String(snapshot.merged)]
    ].forEach(([label, value]) => {
      const item = createElement("div");
      item.append(createElement("span", "", label), createElement("strong", "", value));
      stats.append(item);
    });
    root.dataset.activatedSeeds = String(activeSeedCount);
    root.querySelectorAll(".forest-ranking > li[data-seed-rank]").forEach((item) => {
      item.dataset.seedStatus = Number(item.dataset.seedRank) <= activeSeedCount ? "selected" : "pending";
    });
    replaceGraphFrames();
    detailRoot.replaceChildren(forestNodeDetail(selectedNodeId, frontierIndex));
    play.textContent = frontierIndex >= traversal.snapshots.length - 1 ? "다시 탐색 ↻" : timer ? `POP ${String(frontierIndex).padStart(2, "0")} · 진행 중` : "그래프 탐색 실행 ▶";
    play.disabled = false;
  }

  function stop() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    seedTimers.forEach((seedTimer) => window.clearTimeout(seedTimer));
    seedTimers.clear();
    frameVersion += 1;
    frameTimers.forEach((frameTimer) => window.clearTimeout(frameTimer));
    frameTimers.clear();
  }

  function advance() {
    if (!root.isConnected) return stop();
    if (frontierIndex >= traversal.snapshots.length - 1) return stop();
    frontierIndex += 1;
    selectedNodeId = traversal.snapshots[frontierIndex].current ?? selectedNodeId;
    render();
    timer = window.setTimeout(advance, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 480);
  }

  play.addEventListener("click", () => {
    stop();
    if (frontierIndex >= traversal.snapshots.length - 1) {
      frontierIndex = 0;
      selectedNodeId = traversal.seedNodeIds[0];
    }
    render();
    timer = window.setTimeout(advance, 350);
  });
  root.addEventListener("simulation:play", () => {
    if (stageIndex === 5 && timer === null && frontierIndex < traversal.snapshots.length - 1) play.click();
  });
  root.addEventListener("simulation:rank", () => {
    stop();
    activeSeedCount = 0;
    render();
    [1, 2, 3].forEach((count) => {
      const seedTimer = window.setTimeout(() => {
        seedTimers.delete(seedTimer);
        if (!root.isConnected) return;
        activeSeedCount = count;
        selectedNodeId = traversal.seedNodeIds[count - 1] ?? selectedNodeId;
        render();
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? count * 80 : count * 600);
      seedTimers.add(seedTimer);
    });
  });
  root.addEventListener("simulation:deactivate", stop);
  viewport.addEventListener("click", (event) => {
    const node = event.target.closest("[data-forest-node-id]");
    if (!node) return;
    selectedNodeId = node.dataset.forestNodeId;
    render();
  });
  viewport.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const node = event.target.closest("[data-forest-node-id]");
    if (!node) return;
    event.preventDefault();
    selectedNodeId = node.dataset.forestNodeId;
    render();
  });
  render();
  return root;
}

function createSeedTraversal() {
  return createDocumentForestScene(5);
}

function createCitationResult() {
  return createDocumentForestScene(6);
}

function createGroundedAnswerUse() {
  const root = createElement("section", "grounded-answer-use");
  const answer = createElement("article", "grounded-answer-use__answer");
  const header = document.createElement("header");
  header.append(
    createElement("span", "", "GROUNDED AI ANSWER · PUBLIC DEMO"),
    createElement("h4", "", "진동 기준과 이상 시 연결 절차"),
    createElement("small", "", "표·그림 Fragment를 원문 locator와 함께 검토할 수 있습니다.")
  );
  const sourceOne = createInlineCitation("SRC-01");
  sourceOne.textContent = "[1]";
  const sourceTwo = createInlineCitation("SRC-02");
  sourceTwo.textContent = "[2]";
  const paragraph = document.createElement("p");
  paragraph.append(
    "운전 중 진동은 허용 범위 이내인지 확인하고, 기준 이탈 시 절차 4.1을 이어서 검토합니다 ",
    sourceOne,
    ". 측정 위치는 같은 순서를 유지해야 비교 가능한 기록이 됩니다 ",
    sourceTwo,
    "."
  );
  const inlineTable = createElement("figure", "grounded-answer-use__fragment");
  const table = document.createElement("table");
  const row = document.createElement("tr");
  ["진동", "허용 범위 이내", "이탈 시 절차 4.1 확인"].forEach((value) => row.append(createElement("td", "", value)));
  table.append(row);
  inlineTable.append(table, createElement("figcaption", "", "[1] fragment:row-02 · page 12 · bbox(72,304,740,514)"));
  const inlineFigure = createElement("figure", "grounded-answer-use__fragment grounded-answer-use__fragment--figure");
  const sketch = createElement("div", "sample-figure-sketch");
  sketch.append(createElement("i"), createElement("i"), createElement("i"));
  inlineFigure.append(sketch, createElement("p", "", "측정 위치 A–C는 같은 순서와 운전 조건으로 기록합니다."), createElement("figcaption", "", "[2] fragment:figure-03 · page 8 · bbox(88,410,706,690)"));
  const actions = document.createElement("ol");
  ["같은 운전 조건과 측정 위치를 먼저 고정합니다.", "표의 기준과 현재 관측값을 분리해 비교합니다.", "기준 이탈이면 공식 연결 절차를 원문에서 확인합니다."].forEach((text, index) => {
    const item = document.createElement("li");
    item.append(createElement("span", "", String(index + 1).padStart(2, "0")), createElement("p", "", text));
    actions.append(item);
  });
  const interpretation = createElement("p", "grounded-answer-use__interpretation", "이 결과는 ‘진동’이라는 단어가 포함된 Passage만 복사한 답변이 아닙니다. 상위 seed에서 canonical 표 행과 측정 위치 그림을 복원하고, 서로 다른 문서의 적용 조건이 수렴하는 경로를 확인한 뒤 답변 claim과 locator를 결속한 결과입니다.");
  answer.append(header, paragraph, inlineTable, inlineFigure, interpretation, actions);

  const review = createElement("aside", "source-review-rail");
  review.append(createElement("p", "", "SOURCE REVIEW"));
  const sourceViews = {
    "SRC-01": ["표 3-1 · 운전 중 점검 항목", "Document doc:ws-001", "Chunk chk:3.2 · Element el:table-01", "p.12 · row 02 · bbox(72,304,740,514)"],
    "SRC-02": ["그림 3-2 · 측정 위치", "Document doc:mm-014", "Chunk chk:5.1 · Element el:figure-03", "p.8 · figure 03 · bbox(88,410,706,690)"]
  };
  Object.entries(sourceViews).forEach(([id, lines], index) => {
    const card = createElement("button", "source-review-card");
    card.type = "button";
    card.dataset.sourceReview = id;
    card.setAttribute("aria-pressed", String(index === 0));
    card.append(createElement("span", "", `[${index + 1}] ${id}`));
    lines.forEach((line, lineIndex) => card.append(createElement(lineIndex === 0 ? "strong" : "small", "", line)));
    review.append(card);
  });
  root.addEventListener("click", (event) => {
    const citation = event.target.closest("[data-citation-target]");
    const reviewCard = event.target.closest("[data-source-review]");
    const id = citation?.dataset.citationTarget ?? reviewCard?.dataset.sourceReview;
    if (!id) return;
    root.querySelectorAll("[data-source-review]").forEach((card) => card.setAttribute("aria-pressed", String(card.dataset.sourceReview === id)));
  });
  root.append(answer, review);
  return root;
}

function createRepresentationConnectors() {
  const overlay = createElement("div", "representation-derivation-map");
  overlay.setAttribute("aria-hidden", "true");
  const svg = createSvgElement("svg", { viewBox: "0 0 1000 620", preserveAspectRatio: "none" });
  const paths = [
    ["M285 210 C420 210 470 130 610 130", "TEXT BLOCK", "PASSAGE"],
    ["M285 345 C430 345 470 270 610 270", "TABLE ROW", "PASSAGE + FRAGMENT"],
    ["M285 500 C430 500 470 430 610 430", "FIGURE CAPTION", "PASSAGE + FRAGMENT"]
  ];
  paths.forEach(([d, source, target], index) => {
    const path = createSvgElement("path", { d, class: `representation-derivation-map__path representation-derivation-map__path--${index + 1}` });
    svg.append(path);
    const sourceLabel = createSvgElement("text", { x: 294, y: [202, 337, 492][index] });
    sourceLabel.textContent = source;
    const targetLabel = createSvgElement("text", { x: 618, y: [122, 262, 422][index] });
    targetLabel.textContent = target;
    svg.append(sourceLabel, targetLabel);
  });
  overlay.append(svg);
  return overlay;
}

function createDocumentWorkbenchView() {
  const root = createElement("div", "document-workbench");
  const { shell: sample, page } = createSampleDocument();
  const inspector = createElement("section", "document-workbench__inspector");
  const views = [];

  const sourceView = createElement("div", "workbench-view");
  sourceView.append(createElement("p", "workbench-view__eyebrow", "SOURCE INTAKE"), createElement("h4", "", "원본 파일과 페이지 단위를 보존"), createInfoRows([
    ["DOCUMENT ID", "doc:ws-001"],
    ["SOURCE", "public-demo/ws-001.pdf"],
    ["PAGE", "12 / 18"],
    ["MEDIA", "text · table · figure"]
  ]));
  views.push(sourceView);

  const layoutView = createElement("div", "workbench-view");
  layoutView.append(createElement("p", "workbench-view__eyebrow", "ORDERED LAYOUT BLOCKS"), createElement("h4", "", "페이지 좌표를 가진 4개 block"), createInfoRows([
    ["b-01", "title · order 01 · bbox(72,84,740,154)"],
    ["b-02", "text · order 02 · bbox(72,176,740,282)"],
    ["b-03", "table · order 03 · bbox(72,304,740,514)"],
    ["b-04", "figure · order 04 · bbox(72,538,740,716)"]
  ]));
  views.push(layoutView);

  const identityView = createElement("div", "workbench-view");
  identityView.append(createCanonicalTree(), createInfoRows([
    ["PARENT", "Element → Chunk → Document"],
    ["ORDER", "원본 읽기 순서와 page 범위 유지"],
    ["MODALITY", "text · table · figure를 Element presentation으로 관리"]
  ]));
  views.push(identityView);

  const representationView = createElement("div", "workbench-view derived-representations");
  representationView.append(createElement("p", "workbench-view__eyebrow", "SOURCE ELEMENT → SEARCH PROJECTION → EXACT FRAGMENT"), createElement("h4", "", "각 원문 block에서 Passage와 인용 Fragment를 별도로 파생"));
  [
    ["PASSAGE · TEXT", "psg:ws-001-05", "운전 중 소음·진동·온도를 순서대로 확인", "return_node_id → el:text-02"],
    ["FRAGMENT · TEXT", "fragment:sentence-02", "점검 결과를 기록한다.", "p.12 · text span 02"],
    ["PASSAGE · TABLE", "psg:ws-001-07", "진동 · 허용 범위 · 이탈 · 절차 4.1", "return_node_id → el:table-01"],
    ["FRAGMENT · TABLE", "fragment:row-02", "진동 | 허용 범위 이내 | 이탈 시 절차 4.1 확인", "p.12 · row 02 · bbox"],
    ["PASSAGE · FIGURE", "psg:ws-001-09", "측정 위치 A–C를 같은 순서로 기록", "return_node_id → el:figure-01"],
    ["FRAGMENT · FIGURE", "fragment:caption-01", "그림 3-2. 측정 위치", "p.12 · caption span · bbox"]
  ].forEach(([type, id, text, link], index) => {
    const item = createElement("article", "derived-representation");
    item.dataset.representationType = type.startsWith("PASSAGE") ? "passage" : "fragment";
    item.dataset.derivationPair = String(Math.floor(index / 2) + 1);
    item.append(createElement("span", "", type), createElement("code", "", id), createElement("p", "", text));
    if (link) item.append(createElement("small", "", link));
    representationView.append(item);
  });
  views.push(representationView);

  const retrievalView = createElement("div", "workbench-view");
  retrievalView.append(createDocumentForestScene(4));
  views.push(retrievalView);

  const traversalView = createElement("div", "workbench-view");
  traversalView.append(createSeedTraversal());
  views.push(traversalView);

  const citationView = createElement("div", "workbench-view");
  citationView.append(createCitationResult());
  views.push(citationView);

  const useView = createElement("div", "workbench-view workbench-view--use");
  useView.append(createGroundedAnswerUse());
  views.push(useView);

  views.forEach((view, index) => {
    view.dataset.workbenchView = String(index);
    inspector.append(view);
  });
  const derivationMap = createRepresentationConnectors();
  derivationMap.hidden = true;
  root.append(sample, inspector, derivationMap);
  let activeStageIndex = -1;
  const transitions = createSimulationTransitionCoordinator();

  function update(stageIndex) {
    if ([4, 5].includes(activeStageIndex) && stageIndex !== activeStageIndex) {
      views[activeStageIndex]?.querySelector(".document-forest-scene")?.dispatchEvent(new Event("simulation:deactivate"));
    }
    root.dataset.documentStage = String(stageIndex);
    page.dataset.documentStage = String(stageIndex);
    page.querySelectorAll(".sample-block").forEach((block) => {
      const identity = block.querySelector(".sample-block__identity");
      if (stageIndex === 1) identity.textContent = `${block.dataset.blockId} · page 12 · bbox`;
      else if (stageIndex >= 2) identity.textContent = `${block.dataset.chunkId ?? "doc:ws-001"} / ${block.dataset.elementId}`;
      else identity.textContent = "";
    });
    transitions.transitionViews(views, activeStageIndex, stageIndex);
    derivationMap.hidden = stageIndex !== 3;
    if (stageIndex === 4 && activeStageIndex !== 4) {
      window.requestAnimationFrame(() => {
        retrievalView.querySelector(".document-forest-scene")?.dispatchEvent(new Event("simulation:rank"));
      });
    }
    if (stageIndex === 5 && activeStageIndex !== 5) {
      window.requestAnimationFrame(() => {
        traversalView.querySelector(".document-forest-scene")?.dispatchEvent(new Event("simulation:play"));
      });
    }
    activeStageIndex = stageIndex;
  }
  return { element: root, update };
}

const STEEL_STATUS_COPY = Object.freeze({
  idle: ["READY", "버튼 한 번으로 운영 질의 입력부터 최종 근거 리포트까지 재생합니다."],
  typing: ["INPUT", "사용자 키보드 입력을 재현하고 있습니다."],
  understanding: ["UNDERSTANDING", "도메인 그래프에서 가능한 원인과 누락된 조건을 좁히고 있습니다."],
  "awaiting-hitl": ["HITL", "라인과 발생 시점이 없어서 Planner 앞에서 실행을 멈췄습니다."],
  resolving: ["RESOLVING", "선택한 조건을 원질의에 결합해 같은 질의 이해 계약으로 재진입합니다."],
  planning: ["PLAN V1", "메뉴얼과 노하우 검색을 먼저 수행하는 실행 DAG를 컴파일합니다."],
  executing: ["EXECUTING", "메뉴얼·노하우 Agent가 서로 다른 근거 계약을 실행합니다."],
  replanning: ["REPLAN 1/3", "중간 receipt를 보고 현재 상태 조회가 필요한 DAG v2를 만듭니다."],
  "twin-executing": ["DIGITAL TWIN", "B라인 최근 30분의 합성 시계열을 QuerySpec으로 조회합니다."],
  synthesizing: ["FINALIZING", "세 receipt의 claim coverage·locator·citation을 검사합니다."],
  completed: ["COMPLETED", "세 Agent 결과와 인라인 근거가 대응하는 가이던스를 생성했습니다."]
});

const STEEL_STATUS_INDEX = Object.freeze(Object.fromEntries(STEEL_DEMO_STATUSES.map((status, index) => [status, index])));
const STEEL_STAGE_LABELS = Object.freeze([
  ["질의", "typing"], ["이해", "understanding"], ["HITL", "awaiting-hitl"], ["DAG v1", "planning"],
  ["Agent", "executing"], ["Replan", "replanning"], ["DT", "twin-executing"], ["응답", "completed"]
]);

function steelReached(state, status) {
  return STEEL_STATUS_INDEX[state.status] >= STEEL_STATUS_INDEX[status];
}

function createSteelMessage(role, label, key) {
  const article = createElement("article", `steel-chat-message steel-chat-message--${role}`);
  if (key) article.dataset.messageKey = key;
  article.append(createElement("span", "steel-chat-message__role", label));
  const body = createElement("div", "steel-chat-message__body");
  article.append(body);
  return { article, body };
}

function createSteelStageRail(state) {
  const rail = createElement("ol", "steel-stage-rail");
  const activeIndex = STEEL_STAGE_LABELS.reduce((value, [, status], index) => steelReached(state, status) ? index : value, 0);
  STEEL_STAGE_LABELS.forEach(([label], index) => {
    const item = createElement("li");
    item.dataset.status = index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending";
    const citationStage = state.highlightedReceiptId === "D-01" ? 6 : state.highlightedReceiptId ? 4 : -1;
    item.classList.toggle("is-citation-focused", index === citationStage);
    item.append(createElement("span", "", String(index + 1).padStart(2, "0")), createElement("strong", "", label));
    rail.append(item);
  });
  return rail;
}

function createSteelCauseGraph(state) {
  const panel = createElement("section", "steel-cause-graph");
  panel.append(createElement("p", "steel-panel-kicker", "QUERY UNDERSTANDING · QUERY INDEX + KNOWLEDGE GRAPH"));
  const index = createElement("div", "steel-query-index");
  [
    ["NORMALIZED QUERY", "출측 소재 흔들림 · 권취 불안정 · 원인 분석"],
    ["INTENT", "diagnose_operational_instability"],
    ["INDEX TERMS", "현상:strip oscillation · 설비:coiling section · 작업:diagnosis"]
  ].forEach(([label, value], rowIndex) => {
    const row = createElement("div", "steel-query-index__row");
    row.style.setProperty("--query-index-order", String(rowIndex));
    row.append(createElement("span", "", label), createElement("strong", "", value));
    index.append(row);
  });
  const graph = createElement("div", "steel-cause-graph__nodes");
  const symptom = createElement("article", "steel-cause-node steel-cause-node--symptom");
  symptom.append(createElement("span", "", "QUERY CONCEPT"), createElement("strong", "", "출측 소재 흔들림"));
  const causes = createElement("div", "steel-cause-graph__causes");
  ["장력 제어", "루퍼 추종", "센터링 보정", "권취기 상태"].forEach((label, nodeIndex) => {
    const node = createElement("article", "steel-cause-node");
    node.style.setProperty("--query-graph-order", String(nodeIndex));
    node.append(createElement("i"), createElement("strong", "", label));
    causes.append(node);
  });
  graph.append(symptom, causes);
  const gate = createElement("div", "steel-cause-graph__gate");
  gate.dataset.resolved = String(Boolean(state.hitl));
  gate.append(
    createElement("span", "", state.hitl ? "SCOPE RESOLVED" : "MISSING SLOTS"),
    createElement("strong", "", state.hitl ? `${state.hitl.line} · ${state.hitl.timeRange}` : "라인 · 발생 시점")
  );
  const semantic = createElement("div", "steel-semantic-request");
  semantic.append(
    createElement("span", "", "SEMANTIC REQUEST"),
    createElement("strong", "", state.hitl ? "B라인 권취 불안정의 원인 후보와 점검 근거 요청" : "권취 구간 불안정 진단 · 실행 전 scope 확인 필요"),
    createElement("small", "", state.hitl ? "slots 5/5 resolved" : "missing slots · line_id · time_range")
  );
  panel.append(index, graph, gate, semantic);
  return panel;
}

function steelAgentDefinition(agentId) {
  const scenario = STEEL_DEMO_SCENARIOS.coiler;
  return {
    manual: { name: "메뉴얼 Agent", receipt: scenario.manual, steps: ["Hybrid 검색", "상위 Passage", "정확한 Fragment", "M-01 receipt"] },
    knowhow: { name: "노하우 Agent", receipt: scenario.knowhow, steps: ["사례 seed", "관계 탐색", "적용 조건", "K-01 receipt"] },
    twin: { name: "Digital Twin Agent", receipt: scenario.twin, steps: ["Parse QuerySpec", "Validate scope", "Build + Execute", "D-01 receipt"] }
  }[agentId];
}

function createSyntheticCoilingChart() {
  const chart = createElement("figure", "steel-vibration-chart steel-coiling-chart");
  const svg = createSvgElement("svg", { viewBox: "0 0 360 144", role: "img", "aria-labelledby": "steel-coiling-title steel-coiling-desc" });
  const title = createSvgElement("title", { id: "steel-coiling-title" });
  title.textContent = "B라인 권취 구간 합성 시계열";
  const desc = createSvgElement("desc", { id: "steel-coiling-desc" });
  desc.textContent = "최근 30분 동안 장력 편차, 루퍼 각도, 센터링 보정량이 함께 커지는 설명용 합성 차트";
  const grid = createSvgElement("g", { class: "steel-vibration-chart__grid" });
  [28, 56, 84, 112, 136].forEach((y) => grid.append(createSvgElement("line", { x1: 24, y1: y, x2: 344, y2: y })));
  svg.append(title, desc, grid);
  [
    ["24,112 72,108 120,104 168,96 216,76 264,52 312,44 344,36", "tension"],
    ["24,120 72,116 120,112 168,104 216,92 264,64 312,56 344,48", "looper"],
    ["24,124 72,124 120,120 168,116 216,108 264,92 312,80 344,68", "centering"]
  ].forEach(([points, series]) => svg.append(createSvgElement("polyline", { points, class: `steel-coiling-chart__series steel-coiling-chart__series--${series}` })));
  const caption = document.createElement("figcaption");
  caption.append(createElement("span", "", "장력"), createElement("span", "", "루퍼"), createElement("span", "", "센터링"), createElement("strong", "", "SYNTHETIC"));
  chart.append(svg, caption);
  return chart;
}

function createSteelAgentCard(agentId, state) {
  const definition = steelAgentDefinition(agentId);
  const progress = state.agentProgress[agentId] ?? 0;
  const expanded = (state.userExpandedAgentId ?? state.activeAgentId) === agentId;
  const card = createElement("article", "steel-agent-card");
  card.dataset.agentId = agentId;
  card.dataset.receiptId = definition.receipt[0];
  card.dataset.agentStatus = progress >= 4 ? "complete" : progress > 0 ? "running" : "pending";
  card.dataset.expanded = String(expanded);
  card.classList.toggle("is-highlighted", state.highlightedReceiptId === definition.receipt[0]);
  const toggle = createElement("button", "steel-agent-card__toggle");
  toggle.type = "button";
  toggle.dataset.steelAgentToggle = agentId;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.append(
    createElement("span", "", progress >= 4 ? "RECEIPT READY" : progress > 0 ? "RUNNING" : "QUEUED"),
    createElement("strong", "", definition.name),
    createElement("i", "", expanded ? "−" : "+")
  );
  card.append(toggle);
  if (!expanded) {
    card.append(createElement("small", "steel-agent-card__summary", progress >= 4 ? `${definition.receipt[0]} · ${definition.receipt[1]}` : definition.steps[Math.min(progress, 3)]));
    return card;
  }
  const steps = document.createElement("ol");
  steps.className = "steel-agent-card__steps";
  definition.steps.forEach((label, index) => {
    const item = createElement("li", "", label);
    item.dataset.stepStatus = index < progress ? "complete" : index === progress && progress < 4 ? "active" : "pending";
    steps.append(item);
  });
  card.append(steps);
  if (agentId === "twin") {
    const sql = createElement("pre", "steel-agent-card__sql");
    sql.textContent = "SELECT ts, tension_delta, looper_angle\nFROM line_metrics\nWHERE line_id = 'B' AND ts >= :last_30m;";
    card.append(createElement("p", "steel-synthetic-label", "PUBLIC DEMO · SYNTHETIC SQL RESULT"), sql, createSyntheticCoilingChart());
  }
  if (progress >= 4) {
    const receipt = createElement("div", "steel-agent-card__receipt");
    receipt.append(createElement("code", "", definition.receipt[0]), createElement("strong", "", definition.receipt[1]), createElement("p", "", definition.receipt[2]));
    card.append(receipt);
  }
  return card;
}

function createSteelTopology(state) {
  const wrapper = createElement("div", "steel-topology");
  wrapper.append(createSteelCauseGraph(state));
  if (steelReached(state, "planning")) {
    const planner = createElement("section", "steel-planner-card");
    const revision = state.planRevision || 1;
    planner.append(
      createElement("p", "steel-panel-kicker", `PLANNER · DAG V${revision}`),
      createElement("strong", "", revision === 1 ? "Manual ∥ Knowhow" : "Digital Twin 노드 추가"),
      createElement("small", "", revision === 1 ? "evidence gap check 이후 재계획" : `REPLAN ${state.replanCount}/3 → Finalizer`)
    );
    wrapper.append(planner);
  }
  const agents = createElement("section", "steel-agent-accordion");
  STEEL_AGENT_IDS.forEach((agentId) => agents.append(createSteelAgentCard(agentId, state)));
  wrapper.append(agents);
  const finalizer = createElement("section", "steel-finalizer-panel");
  finalizer.dataset.finalizerStatus = state.status === "completed" ? "complete" : state.status === "synthesizing" ? "running" : "pending";
  finalizer.append(createElement("p", "steel-panel-kicker", "FINALIZER · FAN-IN"), createElement("strong", "", state.status === "completed" ? "3/3 claims verified" : "M-01 · K-01 · D-01"), createElement("p", "", "coverage · locator · citation"));
  wrapper.append(finalizer);
  return wrapper;
}

function createSteelHitlPanel(state) {
  const panel = createElement("section", "steel-hitl-panel");
  panel.append(createElement("span", "", "HITL · MISSING CONTEXT"), createElement("strong", "", "어느 라인에서, 언제부터 발생했나요?"));
  const fields = createElement("div", "steel-hitl-panel__fields");
  [["LINE", "B라인"], ["TIME RANGE", "최근 30분"]].forEach(([label, value]) => {
    const field = createElement("button", "steel-hitl-field");
    field.type = "button";
    field.append(createElement("span", "", label), createElement("strong", "", value), createElement("i", "", state.hitl ? "✓" : ""));
    fields.append(field);
  });
  const confirm = createElement("button", "steel-hitl-confirm", state.hitl ? "선택 완료" : "이 조건으로 계속");
  confirm.type = "button";
  confirm.dataset.hitlConfirm = "coiler";
  fields.append(confirm);
  if (!state.hitl && state.status === "awaiting-hitl") fields.append(createElement("i", "steel-demo-cursor", "↖"));
  panel.append(fields);
  return panel;
}

function createSteelFinalReport(state) {
  const report = createElement("section", "steel-guidance-report");
  const displayCitation = (receiptId, number) => {
    const citation = createInlineCitation(receiptId);
    citation.textContent = `[${number}]`;
    return citation;
  };
  const header = document.createElement("header");
  header.append(createElement("span", "", "B라인 · 최근 30분"), createElement("strong", "", "권취 안정성 점검 가이던스"), createElement("small", "", "PUBLIC DEMO · SYNTHETIC DATA"));
  const observation = createElement("div", "steel-guidance-report__summary");
  const paragraph = document.createElement("p");
  paragraph.append("장력 편차와 루퍼 변동이 같은 구간에서 확대되었고 ", displayCitation("D-01", 3), ", 유사 사례 조건과 일부 일치합니다 ", displayCitation("K-01", 2), ". 원인 확정이 아니라 점검 우선순위를 좁힌 결과입니다.");
  observation.append(createElement("span", "", "현재 관측"), paragraph);
  const possible = createElement("div", "steel-guidance-report__cause");
  possible.append(createElement("span", "", "가능한 원인"), createElement("p", "", "폭 변경 직후 장력 제어와 루퍼 추종의 동시 편차 가능성. 적용 조건 4/5가 일치하지만 단일 원인으로 확정하지 않습니다."));
  const actions = document.createElement("ol");
  [["01", "동일 시점 기준으로 장력·루퍼·센터링 신호를 함께 확인", "M-01"], ["02", "폭 변경 직후 조건이 유사 사례와 같은지 적용 범위를 대조", "K-01"], ["03", "추세가 유지되면 공식 점검 순서로 추가 확인", "M-01"]].forEach(([index, label, citation]) => {
    const item = document.createElement("li");
    item.append(createElement("span", "", index), createElement("p", "", label), displayCitation(citation, { "M-01": 1, "K-01": 2, "D-01": 3 }[citation]));
    actions.append(item);
  });
  const checkOrder = createElement("div", "steel-guidance-report__check-order");
  checkOrder.append(createElement("span", "", "확인 순서"), actions);
  const additional = createElement("div", "steel-guidance-report__additional");
  additional.append(createElement("span", "", "추가 확인"), createElement("p", "", "동일 조건이 아닌 구간의 신호와 설비 정비 이력은 이번 공개 데모 근거에 포함되지 않아 별도 확인이 필요합니다."));
  const coverage = createElement("div", "steel-guidance-report__coverage");
  [["M-01", "공식 점검 순서"], ["K-01", "유사 조건"], ["D-01", "현재 합성 추세"]].forEach(([id, claim]) => {
    const button = createElement("button");
    button.type = "button";
    button.dataset.citationTarget = id;
    button.classList.toggle("is-highlighted", state?.highlightedReceiptId === id);
    button.append(createElement("code", "", id), createElement("strong", "", claim));
    coverage.append(button);
  });
  const visualEvidence = createElement("div", "steel-guidance-report__visuals");
  const manualFragment = createElement("figure", "steel-manual-fragment");
  manualFragment.append(createElement("strong", "", "[1] 합성 메뉴얼 · 점검 순서 04"), createElement("p", "", "장력 → 루퍼 각도 → 센터링 보정량을 동일 timestamp 기준으로 비교"), createElement("figcaption", "", "DEMO-WS-COIL · Fragment 04"));
  visualEvidence.append(manualFragment, createSyntheticCoilingChart());
  const sources = createElement("footer", "steel-guidance-report__sources");
  sources.append(createElement("strong", "", "출처"));
  [["[1]", "M-01", "M-01 · DEMO-WS-COIL · 점검 순서 04"], ["[2]", "K-01", "K-01 · DEMO-KH-COIL · 적용 조건 4/5"], ["[3]", "D-01", "D-01 · B라인 최근 30분 합성 QuerySpec"]].forEach(([number, id, label]) => {
    const source = createElement("p", "", `${number} ${label}`);
    source.dataset.receiptId = id;
    source.classList.toggle("is-highlighted", state?.highlightedReceiptId === id);
    sources.append(source);
  });
  report.append(header, observation, possible, checkOrder, additional, visualEvidence, coverage, sources);
  if (state?.highlightedReceiptId) {
    const agentId = { "M-01": "manual", "K-01": "knowhow", "D-01": "twin" }[state.highlightedReceiptId];
    if (agentId) {
      const focused = createElement("aside", "steel-guidance-report__receipt-focus");
      focused.append(createElement("p", "steel-panel-kicker", `CITATION → ${state.highlightedReceiptId}`), createSteelAgentCard(agentId, state));
      report.append(focused);
    }
  }
  return report;
}

function createSteelChatTranscript(state) {
  const fragment = document.createDocumentFragment();
  const intro = createSteelMessage("assistant", "STEEL COPILOT", "intro");
  intro.body.append(createElement("p", "", "현상을 입력하면 원인 후보와 필요한 조건을 먼저 좁힌 뒤 근거를 수집합니다."));
  fragment.append(intro.article);
  if (state.status === "typing") {
    const typing = createSteelMessage("user", "OPERATOR · TYPING", "user-query");
    typing.body.append(createElement("p", "steel-typing-text", `${state.queryText}▍`));
    fragment.append(typing.article);
  }
  if (steelReached(state, "understanding")) {
    const user = createSteelMessage("user", "OPERATOR", "user-query");
    user.body.append(createElement("p", "", STEEL_DEMO_QUERY));
    const understanding = createSteelMessage("assistant", "QUERY UNDERSTANDING", "query-understanding");
    understanding.body.append(createSteelCauseGraph(state));
    fragment.append(user.article, understanding.article);
  }
  if (steelReached(state, "awaiting-hitl")) {
    const hitl = createSteelMessage("assistant", "STEEL COPILOT · HITL", "hitl");
    hitl.body.append(createSteelHitlPanel(state));
    fragment.append(hitl.article);
  }
  if (steelReached(state, "resolving")) {
    const selection = createSteelMessage("user", "OPERATOR", "hitl-selection");
    selection.body.append(createElement("p", "", "B라인이고, 최근 30분 사이에 반복됐어요."));
    fragment.append(selection.article);
  }
  if (steelReached(state, "planning")) {
    const plan = createSteelMessage("assistant", "PLANNER · ACTION PLAN DAG V1", "plan-v1");
    plan.body.append(createSteelPlanDag({ ...state, planRevision: 1, status: "planning" }));
    fragment.append(plan.article);
  }
  if (steelReached(state, "executing")) {
    const execution = createSteelMessage("assistant", "ORCHESTRATOR · PARALLEL ACTIONS", "agent-execution");
    const agents = createElement("section", "steel-agent-accordion steel-agent-accordion--chat");
    ["manual", "knowhow"].forEach((agentId) => agents.append(createSteelAgentCard(agentId, state)));
    execution.body.append(agents);
    fragment.append(execution.article);
  }
  if (steelReached(state, "replanning")) {
    const replan = createSteelMessage("assistant", "PLANNER · REPLAN 1/3", "replan");
    replan.body.append(
      createElement("p", "", "M-01과 K-01은 점검 순서와 유사 조건을 설명하지만 현재 B라인 신호를 확인하지 못했습니다. 이 evidence gap을 닫기 위해 Digital Twin 조회를 DAG에 추가합니다."),
      createSteelPlanDag({ ...state, planRevision: 2 })
    );
    fragment.append(replan.article);
  }
  if (steelReached(state, "twin-executing")) {
    const twin = createSteelMessage("assistant", "DIGITAL TWIN · NL2SQL", "digital-twin");
    twin.body.append(createSteelAgentCard("twin", state));
    fragment.append(twin.article);
  }
  if (steelReached(state, "synthesizing")) {
    const finalizer = createSteelMessage("assistant", "FINALIZER", "finalizer");
    const progress = createElement("section", "steel-finalizer-stage");
    progress.append(
      createElement("p", "steel-panel-kicker", "AI가 응답을 생성하고 있습니다."),
      createElement("div", "", "M-01 · 공식 점검 순서와 Fragment locator"),
      createElement("div", "", "K-01 · 유사 사례의 적용 조건"),
      createElement("div", "", "D-01 · 현재 합성 시계열과 QuerySpec"),
      createElement("strong", "", "3/3 claim coverage · locator · citation 검증")
    );
    finalizer.body.append(progress);
    fragment.append(finalizer.article);
  }
  if (state.status === "completed") {
    const answer = createSteelMessage("assistant", "STEEL COPILOT · GROUNDED REPORT", "answer");
    answer.body.append(createSteelFinalReport(state));
    fragment.append(answer.article);
  }
  return fragment;
}

function createKeyedMessageReconciler(container) {
  const transitions = createSimulationTransitionCoordinator();

  function render(fragment, { animate = true } = {}) {
    const version = transitions.invalidate();
    const desired = [...fragment.childNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
    const desiredKeys = new Set(desired.map((node) => node.dataset.messageKey));
    const existingByKey = new Map(
      [...container.querySelectorAll(":scope > [data-message-key]")]
        .map((node) => [node.dataset.messageKey, node])
    );
    let lastChanged = null;
    let appended = false;

    existingByKey.forEach((node, key) => {
      if (desiredKeys.has(key)) return;
      if (!animate || reducedMotionRequested()) {
        node.remove();
        return;
      }
      node.dataset.messageTransition = "leaving";
      transitions.schedule(() => node.remove(), SIMULATION_TRANSITION_TIMINGS.leaveMs, version);
    });

    desired.forEach((nextNode) => {
      const key = nextNode.dataset.messageKey;
      let currentNode = existingByKey.get(key);
      const signature = `${nextNode.className}|${nextNode.innerHTML}`;
      if (!currentNode) {
        currentNode = nextNode;
        currentNode.dataset.renderSignature = signature;
        currentNode.dataset.messageTransition = animate && !reducedMotionRequested() ? "entering" : "active";
        container.append(currentNode);
        appended = true;
        lastChanged = currentNode;
        if (currentNode.dataset.messageTransition === "entering") {
          transitions.nextFrame(() => { currentNode.dataset.messageTransition = "active"; }, version);
        }
      } else {
        currentNode.dataset.messageTransition = "active";
        if (currentNode.dataset.renderSignature !== signature) {
          currentNode.className = nextNode.className;
          currentNode.replaceChildren(...nextNode.childNodes);
          currentNode.dataset.renderSignature = signature;
          lastChanged = currentNode;
        }
        container.append(currentNode);
      }
    });

    const scrollTarget = lastChanged ?? desired.at(-1);
    if (!scrollTarget) return;
    transitions.nextFrame(() => {
      const top = Math.max(0, scrollTarget.offsetTop + scrollTarget.offsetHeight - container.clientHeight + 24);
      container.scrollTo({
        top,
        behavior: animate && appended && !reducedMotionRequested() ? "smooth" : "auto"
      });
    }, version);
  }

  return Object.freeze({ render, cancel: transitions.invalidate });
}

function createSteelTracePanel(state) {
  const panel = createElement("div", "steel-demo-trace");
  const [, detail] = STEEL_STATUS_COPY[state.status];
  panel.append(createElement("p", "", detail));
  const statusForAgent = (agentId) => state.receipts.includes(agentId) ? "complete" : state.activeAgentId === agentId ? "active" : "pending";
  const entries = [
    ["Input", steelReached(state, "understanding") ? "complete" : state.status === "typing" ? "active" : "pending", state.queryText || "키보드 입력 대기"],
    ["Understand", steelReached(state, "resolving") ? "complete" : state.status === "understanding" ? "active" : "pending", "원인 후보 4개"],
    ["HITL", state.hitl ? "complete" : state.status === "awaiting-hitl" ? "active" : "pending", state.hitl ? "B라인 · 최근 30분" : "라인·시간 누락"],
    ["DAG v1", steelReached(state, "executing") ? "complete" : state.status === "planning" ? "active" : "pending", "Manual ∥ Knowhow"],
    ["Manual", statusForAgent("manual"), state.receipts.includes("manual") ? "M-01" : "Passage → Fragment", "M-01"],
    ["Knowhow", statusForAgent("knowhow"), state.receipts.includes("knowhow") ? "K-01" : "Seed → 조건", "K-01"],
    ["Replan", steelReached(state, "twin-executing") ? "complete" : state.status === "replanning" ? "active" : "pending", `revision ${state.planRevision || 1} · ${state.replanCount}/3`],
    ["Digital Twin", statusForAgent("twin"), state.receipts.includes("twin") ? "D-01" : "QuerySpec → chart", "D-01"],
    ["Finalizer", state.status === "completed" ? "complete" : state.status === "synthesizing" ? "active" : "pending", `${state.receipts.length}/3 receipts`]
  ];
  const list = document.createElement("ol");
  entries.forEach(([title, status, output, receiptId], index) => {
    const item = document.createElement("li");
    item.dataset.traceStatus = status;
    if (receiptId) item.dataset.receiptId = receiptId;
    item.classList.toggle("is-highlighted", receiptId === state.highlightedReceiptId);
    item.append(createElement("span", "", String(index + 1).padStart(2, "0")), createElement("strong", "", title), createElement("small", "", status.toUpperCase()), createElement("p", "", output));
    list.append(item);
  });
  panel.append(list);
  return panel;
}

function createSteelPlanDag(state) {
  const panel = createElement("section", "steel-plan-stage");
  const revision = state.planRevision || 1;
  panel.append(createElement("p", "steel-panel-kicker", `ACTION PLAN DAG · V${revision}`));
  if (state.status === "replanning") {
    const gap = createElement("div", "steel-evidence-gap");
    gap.append(createElement("span", "", "EVIDENCE GAP"), createElement("strong", "", "현재 설비 신호가 없어 적용 가능성을 확정할 수 없음"), createElement("small", "", "REPLAN 1 / 3 · Digital Twin 조회 추가"));
    panel.append(gap);
  }
  const svg = createSvgElement("svg", { viewBox: "0 0 720 250", role: "img", "aria-label": `Action Plan DAG version ${revision}` });
  const nodes = revision === 1
    ? [
        ["planner", "P", "Planner", 26, 96, 120, 54],
        ["manual", "M", "Manual", 230, 32, 130, 54],
        ["knowhow", "K", "Knowhow", 230, 160, 130, 54],
        ["gap", "G", "Evidence gap", 520, 96, 150, 54]
      ]
    : [
        ["planner", "P2", "Planner v2", 18, 96, 116, 54],
        ["manual", "M", "M-01", 170, 22, 108, 48],
        ["knowhow", "K", "K-01", 170, 102, 108, 48],
        ["twin", "D", "Digital Twin", 350, 182, 130, 48],
        ["verify", "V", "Validate", 520, 102, 108, 48],
        ["final", "F", "Finalizer", 610, 182, 96, 48]
      ];
  const paths = revision === 1
    ? ["M146 123 H188 V59 H230", "M146 123 H188 V187 H230", "M360 59 H440 V123 H520", "M360 187 H440 V123 H520"]
    : ["M134 123 H150 V46 H170", "M134 123 H170", "M134 123 H150 V206 H350", "M278 46 H490 V126 H520", "M278 126 H520", "M480 206 H568 V150", "M628 150 V182 H658"];
  const edgeGroup = createSvgElement("g", { class: "steel-plan-dag__edges" });
  paths.forEach((d) => edgeGroup.append(createSvgElement("path", { d })));
  svg.append(edgeGroup);
  const nodeGroup = createSvgElement("g", { class: "steel-plan-dag__nodes" });
  nodes.forEach(([id, code, label, x, y, width, height]) => {
    const group = createSvgElement("g", { class: "steel-plan-dag__node", "data-dag-node": id, transform: `translate(${x} ${y})` });
    group.append(createSvgElement("rect", { width, height, rx: 10 }));
    const codeText = createSvgElement("text", { x: 14, y: 20, class: "steel-plan-dag__code" });
    codeText.textContent = code;
    const labelText = createSvgElement("text", { x: 14, y: 39, class: "steel-plan-dag__label" });
    labelText.textContent = label;
    group.append(codeText, labelText);
    nodeGroup.append(group);
  });
  svg.append(nodeGroup);
  panel.append(svg);
  return panel;
}

function createSteelChatScreen() {
  const screen = createElement("section", "steel-stage-screen steel-chat-modal");
  const header = createElement("header", "steel-chat-modal__chrome");
  const dots = createElement("span", "steel-chat-modal__dots");
  dots.append(createElement("i"), createElement("i"), createElement("i"));
  const identity = createElement("div");
  const status = createElement("small");
  identity.append(createElement("strong", "", "Steel Operations Copilot"), status);
  header.append(dots, identity, createElement("em", "", "PUBLIC DEMO"));
  const messages = createElement("div", "steel-copilot-chat__messages steel-chat-modal__messages");
  const reconciler = createKeyedMessageReconciler(messages);
  const composer = createElement("div", "steel-stage-chat__composer steel-chat-modal__composer");
  const composerText = createElement("span", "", "운영 현상을 입력하세요");
  composer.append(composerText, createElement("i", "", "↵"));
  screen.append(header, messages, composer);
  let rendered = false;

  function render(state) {
    const [label, detail] = STEEL_STATUS_COPY[state.status];
    status.textContent = `${label} · ${detail}`;
    composerText.textContent = state.status === "typing" ? state.queryText : "운영 현상을 입력하세요";
    reconciler.render(createSteelChatTranscript(state), { animate: rendered });
    rendered = true;
  }

  return Object.freeze({ element: screen, render, cancel: reconciler.cancel });
}

function createSteelSnapshot(stepIndex, runVersion) {
  let state = createInitialSteelDemoState(runVersion);
  const eventGroups = [
    [],
    [{ type: "start" }, { type: "typing-progress", value: STEEL_DEMO_QUERY }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }, { type: "resolve-hitl", scenarioKey: "coiler" }, { type: "understood" }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }, { type: "resolve-hitl", scenarioKey: "coiler" }, { type: "understood" }, { type: "plan-ready" }, { type: "agent-complete", agentId: "manual" }, { type: "agent-complete", agentId: "knowhow" }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }, { type: "resolve-hitl", scenarioKey: "coiler" }, { type: "understood" }, { type: "plan-ready" }, { type: "agent-complete", agentId: "manual" }, { type: "agent-complete", agentId: "knowhow" }, { type: "request-replan" }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }, { type: "resolve-hitl", scenarioKey: "coiler" }, { type: "understood" }, { type: "plan-ready" }, { type: "agent-complete", agentId: "manual" }, { type: "agent-complete", agentId: "knowhow" }, { type: "request-replan" }, { type: "replan-ready" }, { type: "agent-complete", agentId: "twin" }, { type: "synthesize" }],
    [{ type: "start" }, { type: "typed" }, { type: "request-hitl" }, { type: "resolve-hitl", scenarioKey: "coiler" }, { type: "understood" }, { type: "plan-ready" }, { type: "agent-complete", agentId: "manual" }, { type: "agent-complete", agentId: "knowhow" }, { type: "request-replan" }, { type: "replan-ready" }, { type: "agent-complete", agentId: "twin" }, { type: "synthesize" }, { type: "complete" }]
  ];
  eventGroups[Math.max(0, Math.min(stepIndex, eventGroups.length - 1))].forEach((event) => { state = reduceSteelDemoState(state, event); });
  return state;
}

function createSteelServiceVisualization(spec) {
  const root = createElement("section", "steel-copilot-demo");
  root.dataset.systemPlate = spec.id;
  root.setAttribute("aria-labelledby", `${spec.id}-title`);
  let state = createInitialSteelDemoState();
  let stepIndex = 0;
  let autoRunning = false;
  const timers = new Set();

  const header = createElement("header", "steel-copilot-demo__header");
  const title = createElement("div");
  title.append(createElement("p", "", "STEEL OPERATIONS COPILOT · LOCAL SERVICE SIMULATION"), createElement("h3", "", "모호한 현상 질의에서 근거 리포트까지"), createElement("span", "", "자동 입력, 원인 그래프, HITL, 재계획과 세 Agent receipt가 하나의 서비스처럼 이어집니다."));
  title.querySelector("h3").id = `${spec.id}-title`;
  const live = createElement("div", "steel-copilot-demo__live");
  live.append(createElement("i"), createElement("strong", "", "READY"), createElement("span", "", "PUBLIC DEMO · SYNTHETIC DATA"));
  header.append(title, live);

  const controller = createElement("div", "simulation-controller steel-simulation-controller");
  const current = createElement("div", "simulation-controller__current");
  const counter = createElement("span", "", "STEP 01 / 08");
  const currentLabel = createElement("strong", "", "질의");
  current.append(counter, currentLabel);
  const controls = createElement("div", "simulation-controller__actions");
  const previous = createElement("button", "", "← 이전");
  const next = createElement("button", "", "다음 →");
  const play = createElement("button", "system-plate__play", "시뮬레이션 ▶");
  [previous, next, play].forEach((button) => { button.type = "button"; });
  controls.append(previous, next, play);
  controller.append(current, controls);

  const shell = createElement("div", "steel-copilot-service steel-copilot-service--two-column");
  const trajectory = createElement("aside", "steel-trajectory");
  trajectory.append(createElement("header", "steel-copilot-column-header", "SYSTEM FLOW · LIVE TRAJECTORY"));
  const trajectoryBody = createElement("div", "steel-trajectory__body");
  const trajectoryRenderer = createSteelExecutionView();
  trajectoryBody.append(trajectoryRenderer.element);
  trajectory.append(trajectoryBody);
  const screen = createElement("section", "steel-copilot-workbench steel-copilot-screen");
  screen.setAttribute("aria-live", "polite");
  const screenBody = createElement("div", "steel-copilot-screen__body");
  const chatRenderer = createSteelChatScreen();
  screenBody.append(chatRenderer.element);
  screen.append(screenBody);
  shell.append(trajectory, screen);
  const disclaimer = createElement("footer", "steel-copilot-demo__footer");
  disclaimer.append(createElement("p", "", "PUBLIC DEMO · 모든 설비값, SQL 결과와 차트는 설명용 합성 데이터입니다."), createElement("span", "", "자동 실행 시간 · 약 31초"));
  root.append(header, controller, shell, disclaimer);

  const isActive = () => !["idle", "completed"].includes(state.status);
  const clearTimers = () => { timers.forEach((timer) => window.clearTimeout(timer)); timers.clear(); autoRunning = false; };
  function schedule(callback, delay, version = state.runVersion) {
    const timer = window.setTimeout(() => { timers.delete(timer); if (root.isConnected && version === state.runVersion) callback(); }, delay);
    timers.add(timer);
  }
  function dispatch(event) {
    const next = reduceSteelDemoState(state, event);
    if (next === state) return false;
    state = next;
    if (state.status === "completed" || state.status === "idle") autoRunning = false;
    stepIndex = STEEL_STAGE_LABELS.reduce((value, [, status], index) => steelReached(state, status) ? index : value, 0);
    render();
    return true;
  }
  function render() {
    root.dataset.demoStatus = state.status;
    const [label, detail] = STEEL_STATUS_COPY[state.status];
    live.querySelector("strong").textContent = label;
    live.querySelector("i").classList.toggle("is-running", isActive());
    trajectoryRenderer.update(stepIndex);
    trajectoryBody.querySelectorAll("[data-flow-node]").forEach((node) => node.classList.remove("is-citation-focused"));
    const citationNode = { "M-01": "manual", "K-01": "knowhow", "D-01": "digital-twin" }[state.highlightedReceiptId];
    if (citationNode) trajectoryBody.querySelector(`[data-flow-node="${citationNode}"]`)?.classList.add("is-citation-focused");
    chatRenderer.render(state);
    counter.textContent = `STEP ${String(stepIndex + 1).padStart(2, "0")} / 08`;
    currentLabel.textContent = STEEL_STAGE_LABELS[stepIndex][0];
    previous.disabled = stepIndex === 0;
    next.disabled = stepIndex === STEEL_STAGE_LABELS.length - 1;
    play.textContent = autoRunning ? "일시 정지 Ⅱ" : state.status === "completed" ? "다시 실행 ↻" : "시뮬레이션 ▶";
    play.setAttribute("aria-pressed", String(autoRunning));
  }
  function startDemo() {
    clearTimers();
    if (!["idle", "completed"].includes(state.status)) state = createInitialSteelDemoState(state.runVersion + 1);
    autoRunning = true;
    dispatch({ type: "start" });
    const version = state.runVersion;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const typingMs = reduced ? 120 : 2600;
    [...STEEL_DEMO_QUERY].forEach((_, index) => schedule(() => dispatch({ type: "typing-progress", value: STEEL_DEMO_QUERY.slice(0, index + 1) }), typingMs * (index + 1) / STEEL_DEMO_QUERY.length, version));
    const events = [
      [typingMs + 120, { type: "typed" }], [typingMs + 3500, { type: "request-hitl" }], [typingMs + 6500, { type: "resolve-hitl", scenarioKey: "coiler" }],
      [typingMs + 8500, { type: "understood" }], [typingMs + 11000, { type: "plan-ready" }],
      [typingMs + 11600, { type: "agent-progress", agentId: "manual", step: 1 }], [typingMs + 12700, { type: "agent-progress", agentId: "manual", step: 2 }], [typingMs + 13900, { type: "agent-progress", agentId: "manual", step: 3 }], [typingMs + 14800, { type: "agent-complete", agentId: "manual" }],
      [typingMs + 15500, { type: "agent-progress", agentId: "knowhow", step: 1 }], [typingMs + 16600, { type: "agent-progress", agentId: "knowhow", step: 2 }], [typingMs + 17300, { type: "agent-progress", agentId: "knowhow", step: 3 }], [typingMs + 18000, { type: "agent-complete", agentId: "knowhow" }],
      [typingMs + 18600, { type: "request-replan" }], [typingMs + 21000, { type: "replan-ready" }],
      [typingMs + 21600, { type: "agent-progress", agentId: "twin", step: 1 }], [typingMs + 22700, { type: "agent-progress", agentId: "twin", step: 2 }], [typingMs + 24000, { type: "agent-progress", agentId: "twin", step: 3 }], [typingMs + 25200, { type: "agent-complete", agentId: "twin" }],
      [typingMs + 25600, { type: "synthesize" }], [typingMs + 28800, { type: "complete" }]
    ];
    events.forEach(([delay, event]) => schedule(() => dispatch(event), delay, version));
  }
  function showSnapshot(nextStep) {
    clearTimers();
    const runVersion = state.runVersion + 1;
    stepIndex = Math.max(0, Math.min(nextStep, STEEL_STAGE_LABELS.length - 1));
    state = createSteelSnapshot(stepIndex, runVersion);
    render();
  }
  previous.addEventListener("click", () => showSnapshot(stepIndex - 1));
  next.addEventListener("click", () => showSnapshot(stepIndex + 1));
  play.addEventListener("click", () => { if (autoRunning) { clearTimers(); dispatch({ type: "cancel" }); } else startDemo(); });
  root.addEventListener("click", (event) => {
    const agent = event.target.closest("[data-steel-agent-toggle]");
    if (agent) return void dispatch({ type: "toggle-agent", agentId: agent.dataset.steelAgentToggle });
    const citation = event.target.closest("[data-citation-target]");
    if (citation) dispatch({ type: "focus-receipt", receiptId: citation.dataset.citationTarget });
  });
  root.tabIndex = 0;
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); showSnapshot(stepIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); showSnapshot(stepIndex + 1); }
    if (event.key === " ") { event.preventDefault(); play.click(); }
  });
  render();
  return root;
}

function updateStageStatus(shell, spec, stageIndex) {
  const stage = spec.stages[stageIndex];
  shell.querySelector(".system-plate__live").textContent = `${stage.shortLabel} 단계: ${stage.title}`;
}

function activateVisualization(shell, spec, stageIndex) {
  const boundedIndex = Math.max(0, Math.min(stageIndex, spec.stages.length - 1));
  shell.dataset.activeStep = String(boundedIndex);
  shell.style.setProperty("--system-progress", `${(boundedIndex / (spec.stages.length - 1)) * 100}%`);
  const current = shell.querySelector("[data-simulation-current]");
  const counter = shell.querySelector("[data-simulation-counter]");
  if (current) current.textContent = spec.stages[boundedIndex].shortLabel;
  if (counter) counter.textContent = `STEP ${String(boundedIndex + 1).padStart(2, "0")} / ${String(spec.stages.length).padStart(2, "0")}`;
  const previous = shell.querySelector("[data-simulation-previous]");
  const next = shell.querySelector("[data-simulation-next]");
  if (previous) previous.disabled = boundedIndex === 0;
  if (next) next.disabled = boundedIndex === spec.stages.length - 1;
  rendererByShell.get(shell)?.update(boundedIndex);
  updateStageStatus(shell, spec, boundedIndex);
}

function createHarnessFlow() {
  const flow = createElement("ol", "harness-flow");
  [
    ["01", "요청", "scope"], ["02", "Wiki", "context"], ["03", "Skill router", "triggers"],
    ["04", "Manifest gate", "capability"], ["05", "Work DAG", "dependencies"], ["06", "Role swarm", "shared diff"],
    ["07", "Verify + commit", "gates"], ["08", "Outcome", "improve"]
  ].forEach(([index, title, meta], stage) => {
    const item = document.createElement("li");
    item.dataset.harnessStage = String(stage);
    item.append(createElement("span", "", index), createElement("strong", "", title), createElement("small", "", meta));
    flow.append(item);
  });
  return flow;
}

function createHarnessArtifact(stageIndex) {
  const panel = createElement("section", "harness-artifact");
  const headers = [
    ["WORK REQUEST", "포트폴리오를 정밀하게 개편하고 작업 단위로 검증·커밋"],
    ["PERSONAL WIKI · REVIEWED CONTEXT", "선호는 힌트이며 실행 권한이 아닙니다"],
    ["SKILL ROUTER", "현재 산출물과 risk에 필요한 절차만 조합"],
    ["MANIFEST · CAPABILITY GATE", "지원하지 않는 Agent 역할은 계획에서 제외"],
    ["WORK GRAPH", "산출물 dependency와 검증 gate를 먼저 고정"],
    ["ROLE COLLABORATION", "역할은 나뉘지만 shared workspace diff는 하나"],
    ["VERIFICATION GATE → COMMITS", "검증을 통과하기 전에는 commit과 Outcome을 만들지 않음"],
    ["OUTCOME LOOP", "실행 결과를 다음 Wiki·Skill 개선의 근거로 환류"]
  ];
  panel.append(createElement("p", "harness-artifact__kicker", headers[stageIndex][0]), createElement("h4", "", headers[stageIndex][1]));

  if (stageIndex === 0) {
    const request = createElement("blockquote", "harness-request");
    request.append(createElement("p", "", "“레이아웃·PIP·응답 상세도와 세 프로젝트 시뮬레이션을 함께 다듬고, 전체 변경을 작업 단위로 커밋해줘.”"), createElement("small", "", "constraints · public/private boundary · no deploy · no push"));
    panel.append(request);
  } else if (stageIndex === 1) {
    const context = createElement("div", "harness-context-packet");
    [
      ["PREFERENCE", "헤어라인과 밝은 Liquid Glass · 읽기 폭 우선", "reviewed"],
      ["TERMINOLOGY", "AI / Agent 역할명 · graph traversal", "verified"],
      ["PUBLIC BOUNDARY", "portfolio·design 공개 / 회고 원문 비노출", "policy"],
      ["CHANGE RULE", "작업 단위 commit · deploy/push 제외", "explicit"]
    ].forEach(([type, value, status]) => {
      const row = createElement("article", "");
      row.append(createElement("span", "", type), createElement("strong", "", value), createElement("small", "", status));
      context.append(row);
    });
    panel.append(context, createElement("p", "harness-guard-note", "Wiki 조회 결과는 계획 입력일 뿐입니다. manifest·trigger·risk 정책을 통과해야 실행 가능한 action이 됩니다."));
  } else if (stageIndex === 2) {
    const skills = createElement("div", "harness-skill-selection");
    [
      ["preference-scout", "explicit preference lookup", "READ CONTEXT"],
      ["code-design", "non-trivial state refactor", "PROCEDURE"],
      ["diagram-design", "architecture flow request", "PROCEDURE"],
      ["impeccable", "visual quality gate", "REVIEW"],
      ["human-friendly-writing", "public narrative edit", "REVIEW"],
      ["preview-ui-change", "browser-visible change", "VERIFY"]
    ].forEach(([name, trigger, permission], index) => {
      const card = createElement("article", "");
      card.append(
        createElement("span", "", String(index + 1).padStart(2, "0")),
        createElement("code", "", name),
        createElement("p", "", trigger),
        createElement("small", "", permission)
      );
      skills.append(card);
    });
    panel.append(skills);
  } else if (stageIndex === 3) {
    const table = createElement("div", "harness-manifest-table");
    [
      ["Codex", "implementation · test · shared diff", "IMPLEMENTER"],
      ["Claude Code", "architecture review · risk critique", "SENIOR REVIEWER"]
    ].forEach(([agent, capability, status]) => {
      const row = createElement("article", "");
      row.dataset.manifestStatus = status.startsWith("EXCLUDED") ? "excluded" : "eligible";
      row.append(createElement("strong", "", agent), createElement("p", "", capability), createElement("small", "", status));
      table.append(row);
    });
    panel.append(table, createElement("p", "harness-guard-note", "대표 시나리오의 지원 범위입니다. manifest에 없는 capability를 있다고 가정하지 않습니다."));
  } else if (stageIndex === 4) {
    const svg = createSvgElement("svg", { viewBox: "0 0 760 330", role: "img", "aria-label": "포트폴리오 개편 작업 그래프" });
    const edges = ["M126 164 H190 V66 H258", "M126 164 H258", "M126 164 H190 V264 H258", "M390 66 H470 V164 H530", "M390 164 H530", "M390 264 H470 V164 H530", "M650 164 H710"];
    const edgeLayer = createSvgElement("g", { class: "harness-work-dag__edges" });
    edges.forEach((d) => edgeLayer.append(createSvgElement("path", { d })));
    svg.append(edgeLayer);
    [
      ["PLAN", "Planner", 18, 135, 108, 58], ["CONTENT", "Content", 258, 36, 132, 58],
      ["UI", "Interface", 258, 135, 132, 58], ["VIS", "Simulation", 258, 234, 132, 58],
      ["REVIEW", "Senior + Visual", 530, 135, 120, 58], ["VERIFY", "Gates", 680, 135, 72, 58]
    ].forEach(([code, label, x, y, width, height]) => {
      const group = createSvgElement("g", { class: "harness-work-dag__node", transform: `translate(${x} ${y})` });
      group.append(createSvgElement("rect", { width, height, rx: 12 }));
      const codeText = createSvgElement("text", { x: 14, y: 22 }); codeText.textContent = code;
      const labelText = createSvgElement("text", { x: 14, y: 43 }); labelText.textContent = label;
      group.append(codeText, labelText); svg.append(group);
    });
    const graph = createElement("div", "harness-work-dag");
    graph.append(svg);
    panel.append(graph);
  } else if (stageIndex === 5) {
    panel.append(createElement("p", "harness-guard-note", "Codex와 Claude Code는 복제된 산출물이 아니라 같은 shared workspace digest를 기준으로 구현·검토·수정 역할을 나눕니다."));
  } else if (stageIndex === 6) {
    const gates = createElement("ol", "harness-verification-gates");
    [
      ["01", "npm run check", "unit · integration · build", "PASS"],
      ["02", "Browser review", "desktop · mobile · console", "PASS"],
      ["03", "Privacy audit", "public bundle · paths · retrospective", "PASS"],
      ["04", "Work-unit commits", "content → agent → UI → simulations", "UNLOCKED"]
    ].forEach(([index, title, detail, status]) => {
      const item = document.createElement("li");
      item.append(createElement("span", "", index), createElement("strong", "", title), createElement("p", "", detail), createElement("small", "", status));
      gates.append(item);
    });
    panel.append(gates);
  } else {
    const outcomes = createElement("div", "harness-outcomes");
    [
      ["HELPFUL", "diagram-design + interface review", "flow 이해와 읽기 폭 정렬에 기여"],
      ["UNUSED", "범용 외부 검색", "로컬 문서·manifest로 충분해 호출하지 않음"],
      ["DEFECT", "시뮬레이션이 paper 폭을 넘긴 초기 CSS", "reading-width invariant 후보로 등록"]
    ].forEach(([status, source, result]) => {
      const card = createElement("article", "");
      card.dataset.outcome = status.toLocaleLowerCase();
      card.append(createElement("span", "", status), createElement("strong", "", source), createElement("p", "", result));
      outcomes.append(card);
    });
    panel.append(outcomes, createElement("p", "harness-guard-note", "Outcome은 자동 권한 승격이 아니라 다음 작업에서 검토할 Wiki·Skill 개선 후보입니다."));
  }
  return panel;
}

function createHarnessChatMessage(role, label, key) {
  const message = createElement("article", `harness-chat-message harness-chat-message--${role}`);
  message.dataset.messageKey = key;
  message.append(createElement("span", "harness-chat-message__actor", label));
  const body = createElement("div", "harness-chat-message__body");
  message.append(body);
  return { message, body };
}

function createHarnessHandoff(agent, role, action, digest, status) {
  const receipt = createElement("section", "harness-agent-handoff");
  receipt.append(
    createElement("span", "", role),
    createElement("strong", "", agent),
    createElement("p", "", action),
    createElement("code", "", `shared:${digest}`),
    createElement("small", "", status)
  );
  return receipt;
}

function createHarnessChatTranscript(stageIndex) {
  const fragment = document.createDocumentFragment();
  const request = createHarnessChatMessage("user", "YOU", "harness-request");
  request.body.append(createElement("p", "", "포트폴리오의 PIP, 프로젝트 시뮬레이션과 공개 서사를 함께 다듬고 작업 단위로 검증·커밋해줘."));
  fragment.append(request.message);

  if (stageIndex >= 1) {
    const scope = createHarnessChatMessage("system", "HARNESS · PREFLIGHT", "harness-preflight");
    scope.body.append(
      createElement("p", "", "요청을 UI·시각화·공개 콘텐츠 변경으로 분리했습니다. 배포·push는 제외하고 회고 원문은 공개하지 않습니다."),
      createElement("small", "", "scope locked · public/private boundary · no deploy")
    );
    const wiki = createHarnessChatMessage("knowledge", "PERSONAL WIKI", "harness-wiki");
    wiki.body.append(createHarnessArtifact(1));
    fragment.append(scope.message, wiki.message);
  }
  if (stageIndex >= 2) {
    const skills = createHarnessChatMessage("router", "SKILL ROUTER", "harness-skills");
    skills.body.append(createHarnessArtifact(2));
    fragment.append(skills.message);
  }
  if (stageIndex >= 3) {
    const manifest = createHarnessChatMessage("system", "MANIFEST · CAPABILITY GATE", "harness-manifest");
    manifest.body.append(createHarnessArtifact(3));
    fragment.append(manifest.message);
  }
  if (stageIndex >= 4) {
    const plan = createHarnessChatMessage("planner", "PLANNER", "harness-plan");
    plan.body.append(createHarnessArtifact(4));
    fragment.append(plan.message);
  }
  if (stageIndex >= 5) {
    const implement = createHarnessChatMessage("agent", "CODEX · IMPLEMENTER", "harness-codex-implement");
    implement.body.append(createHarnessHandoff("Codex", "IMPLEMENT", "소스·테스트를 작업 그래프에 맞춰 갱신하고 검토 가능한 diff를 만들었습니다.", "9c3b2e", "READY FOR REVIEW"));
    const review = createHarnessChatMessage("reviewer", "CLAUDE CODE · SENIOR REVIEWER", "harness-claude-review");
    review.body.append(createHarnessHandoff("Claude Code", "REVIEW", "전환 취소 경계, 모바일 overflow와 공개 지식 노출 범위에 세 가지 수정 의견을 연결했습니다.", "9c3b2e", "3 COMMENTS"));
    const revise = createHarnessChatMessage("agent", "CODEX · REVISION", "harness-codex-revision");
    revise.body.append(createHarnessHandoff("Codex", "REVISE", "동일 artifact에서 의견을 반영하고 stale timer 차단과 privacy assertion을 보강했습니다.", "b18f74", "COMMENTS RESOLVED"));
    fragment.append(implement.message, review.message, revise.message);
  }
  if (stageIndex >= 6) {
    const verify = createHarnessChatMessage("system", "VERIFICATION GATE", "harness-verify");
    verify.body.append(createHarnessArtifact(6));
    fragment.append(verify.message);
  }
  if (stageIndex >= 7) {
    const outcome = createHarnessChatMessage("system", "OUTCOME RECORDER", "harness-outcome");
    outcome.body.append(createHarnessArtifact(7));
    fragment.append(outcome.message);
  }
  return fragment;
}

function createHarnessCollaborationView() {
  const root = createElement("div", "harness-collaboration-demo");
  const aside = createElement("aside", "harness-collaboration-demo__flow");
  aside.append(createElement("p", "", "HARNESS CONTROL FLOW"), createHarnessFlow());
  const chat = createElement("section", "harness-collaboration-chat");
  const chrome = createElement("header", "harness-collaboration-chat__chrome");
  const identity = createElement("div");
  const status = createElement("small", "", "REQUEST · READY");
  identity.append(createElement("strong", "", "Personal Agent Harness"), status);
  chrome.append(createElement("span", "harness-collaboration-chat__signal"), identity, createElement("em", "", "REPRESENTATIVE DETERMINISTIC DEMO"));
  const messages = createElement("div", "harness-collaboration-chat__messages");
  const reconciler = createKeyedMessageReconciler(messages);
  const composer = createElement("footer", "harness-collaboration-chat__composer");
  composer.append(createElement("span", "", "요청·맥락·실행 절차를 입력하세요"), createElement("i", "", "↵"));
  chat.append(chrome, messages, composer);
  root.append(aside, chat);
  let rendered = false;
  function update(stageIndex) {
    root.dataset.harnessStage = String(stageIndex);
    aside.querySelectorAll("[data-harness-stage]").forEach((node) => {
      const stage = Number(node.dataset.harnessStage);
      node.dataset.status = stage < stageIndex ? "complete" : stage === stageIndex ? "active" : "pending";
    });
    status.textContent = `${String(stageIndex + 1).padStart(2, "0")} / 08 · ${VISUALIZATION_SPECS["personal-agent-harness"].stages[stageIndex].shortLabel}`;
    reconciler.render(createHarnessChatTranscript(stageIndex), { animate: rendered });
    rendered = true;
  }
  update(0);
  return { element: root, update };
}

function createInteractiveVisualization(spec) {
  if (spec.kind === "steel-execution") return createSteelServiceVisualization(spec);
  const shell = createElement("section", "system-plate system-plate--light");
  shell.dataset.systemPlate = spec.id;
  shell.dataset.kind = spec.kind;
  shell.setAttribute("aria-labelledby", `${spec.id}-title`);
  const header = createElement("header", "system-plate__header");
  const titleGroup = createElement("div");
  titleGroup.append(createElement("p", "", spec.label), createElement("h3", "", spec.title), createElement("span", "", spec.description));
  titleGroup.querySelector("h3").id = `${spec.id}-title`;
  const idlePlayLabel = `▶ 전체 흐름 재생 · ${spec.durationLabel}`;
  const play = createElement("button", "system-plate__play", idlePlayLabel);
  play.type = "button";
  play.setAttribute("aria-pressed", "false");
  header.append(titleGroup, play);

  const stages = createElement("div", "simulation-controller");
  const stageCopy = createElement("div", "simulation-controller__current");
  stageCopy.append(
    createElement("span", "", "STEP 01 / 08"),
    createElement("strong", "", spec.stages[0].shortLabel)
  );
  stageCopy.querySelector("span").dataset.simulationCounter = "";
  stageCopy.querySelector("strong").dataset.simulationCurrent = "";
  const actions = createElement("div", "simulation-controller__actions");
  const previous = createElement("button", "", "← 이전");
  previous.type = "button";
  previous.dataset.simulationPrevious = "";
  const next = createElement("button", "", "다음 →");
  next.type = "button";
  next.dataset.simulationNext = "";
  actions.append(previous, next, play);
  stages.append(stageCopy, actions);

  const renderer = spec.kind === "harness-collaboration"
    ? createHarnessCollaborationView()
    : createDocumentWorkbenchView();
  rendererByShell.set(shell, renderer);
  const body = createElement("div", "system-plate__body");
  const visual = createElement("div", "system-plate__visual");
  visual.append(renderer.element);
  body.append(visual);
  const footer = createElement("footer", "system-plate__footer");
  footer.append(createElement("p", "", spec.sourceNote), createElement("span", "system-plate__live sr-only"));
  shell.append(header, stages, body, footer);

  let timerId = null;
  let runVersion = 0;
  function stopPlayback() {
    if (timerId !== null) window.clearTimeout(timerId);
    timerId = null;
    runVersion += 1;
    play.textContent = "시뮬레이션 ▶";
    play.setAttribute("aria-pressed", "false");
  }
  function move(delta) {
    stopPlayback();
    activateVisualization(shell, spec, Number(shell.dataset.activeStep ?? 0) + delta);
  }
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  play.addEventListener("click", () => {
    if (timerId !== null) return stopPlayback();
    let index = Number(shell.dataset.activeStep ?? 0);
    if (index >= spec.stages.length - 1) {
      index = 0;
      activateVisualization(shell, spec, index);
    }
    const version = ++runVersion;
    play.textContent = "일시 정지 Ⅱ";
    play.setAttribute("aria-pressed", "true");
    const scheduleNext = () => {
      const delayMs = spec.stages[index]?.durationMs ?? spec.intervalMs;
      timerId = window.setTimeout(() => {
        if (version !== runVersion || !shell.isConnected) return stopPlayback();
        index += 1;
        activateVisualization(shell, spec, index);
        if (index >= spec.stages.length - 1) stopPlayback();
        else scheduleNext();
      }, delayMs);
    };
    scheduleNext();
  });
  shell.tabIndex = 0;
  shell.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === " ") { event.preventDefault(); play.click(); }
  });
  activateVisualization(shell, spec, 0);
  return shell;
}

function insertProjectVisualization(article, project) {
  const spec = VISUALIZATION_SPECS[project.id];
  if (!spec) return;
  const heading = article.querySelector(`#project-section-${spec.sectionId}`);
  const chapter = heading?.closest(".project-document__chapter");
  if (!chapter) return;
  const anchor = chapter.querySelector(":scope > .project-document__figure") ?? heading;
  anchor.insertAdjacentElement("afterend", createInteractiveVisualization(spec));
}

export function enhanceProjectDocument(article, project) {
  decorateDocumentCover(article, project);
  groupDocumentChapters(article);
  insertProjectVisualization(article, project);
  decorateDocumentFigures(article);
  decorateDocumentTables(article);
}

export const projectVisualizationSpecs = VISUALIZATION_SPECS;
export const steelTrajectoryLayout = Object.freeze({
  viewBox: STEEL_TRAJECTORY_VIEWBOX,
  nodes: STEEL_NODES,
  edges: STEEL_EDGES
});
