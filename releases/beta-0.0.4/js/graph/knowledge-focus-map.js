const SVG_NS = "http://www.w3.org/2000/svg";

const RELATION_LABELS = Object.freeze({
  supports: "지원",
  demonstrates: "입증",
  applies_to: "적용",
  derived_from: "파생",
  contrasts_with: "대조",
  part_of: "구성"
});

const KIND_GROUPS = Object.freeze({
  project: "project",
  "personal-project": "project",
  evidence: "evidence",
  outcome: "evidence",
  evaluation: "evidence",
  limitation: "limit",
  principle: "principle"
});

function cleanLabel(value, maxLength = 28) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function kindGroup(kind) {
  return KIND_GROUPS[kind] ?? "knowledge";
}

export function buildFocusGraphModel(centerNode, neighborRecords, { maxNeighbors = 8 } = {}) {
  if (!centerNode?.id) throw new TypeError("중심 지식 노드가 필요합니다.");
  const records = (neighborRecords ?? [])
    .filter(({ node, edge }) => node?.id && edge?.from && edge?.to)
    .slice(0, maxNeighbors);
  const center = {
    id: centerNode.id,
    label: cleanLabel(centerNode.title),
    kind: centerNode.kind,
    group: kindGroup(centerNode.kind),
    x: 500,
    y: 250,
    center: true
  };
  const count = records.length;
  const nodes = records.map(({ node }, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(count, 1);
    return {
      id: node.id,
      label: cleanLabel(node.title),
      kind: node.kind,
      group: kindGroup(node.kind),
      x: Math.round(center.x + Math.cos(angle) * 350),
      y: Math.round(center.y + Math.sin(angle) * 172),
      center: false
    };
  });
  const nodeById = new Map([center, ...nodes].map((node) => [node.id, node]));
  const edges = records.map(({ edge }) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
    label: RELATION_LABELS[edge.type] ?? edge.type.replaceAll("_", " "),
    source: nodeById.get(edge.from),
    target: nodeById.get(edge.to)
  })).filter(({ source, target }) => source && target);
  return { center, nodes: [center, ...nodes], edges };
}

function svgElement(documentRef, tagName, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function appendLabel(documentRef, root, node) {
  const words = node.label.split(" ");
  const midpoint = Math.ceil(words.length / 2);
  const lines = words.length > 3
    ? [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")]
    : [node.label];
  const text = svgElement(documentRef, "text", {
    x: node.x,
    y: node.y - (lines.length - 1) * 8,
    "text-anchor": "middle",
    class: "knowledge-focus-map__node-label"
  });
  lines.forEach((line, index) => {
    const tspan = svgElement(documentRef, "tspan", {
      x: node.x,
      dy: index === 0 ? 0 : 17
    });
    tspan.textContent = line;
    text.append(tspan);
  });
  root.append(text);
}

export function renderKnowledgeFocusMap(target, {
  centerNode,
  neighborRecords,
  hrefForNode = (node) => `#evidence/${encodeURIComponent(node.id)}`
}) {
  if (!target?.replaceChildren || !target.ownerDocument) {
    throw new TypeError("지식 지도 target에는 DOM element가 필요합니다.");
  }
  const model = buildFocusGraphModel(centerNode, neighborRecords);
  const documentRef = target.ownerDocument;
  const svg = svgElement(documentRef, "svg", {
    viewBox: "0 0 1000 500",
    role: "img",
    "aria-label": `${centerNode.title} 중심의 1단계 지식 연결 지도`,
    preserveAspectRatio: "xMidYMid meet"
  });
  const defs = svgElement(documentRef, "defs");
  const marker = svgElement(documentRef, "marker", {
    id: `focus-map-arrow-${String(centerNode.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    viewBox: "0 0 10 10",
    refX: 8,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: "auto-start-reverse"
  });
  marker.append(svgElement(documentRef, "path", { d: "M 0 0 L 10 5 L 0 10 z" }));
  defs.append(marker);
  svg.append(defs);

  const edgeLayer = svgElement(documentRef, "g", { class: "knowledge-focus-map__edges" });
  model.edges.forEach((edge) => {
    const line = svgElement(documentRef, "line", {
      x1: edge.source.x,
      y1: edge.source.y,
      x2: edge.target.x,
      y2: edge.target.y,
      "marker-end": `url(#${marker.id})`
    });
    const label = svgElement(documentRef, "text", {
      x: Math.round((edge.source.x + edge.target.x) / 2),
      y: Math.round((edge.source.y + edge.target.y) / 2) - 7,
      "text-anchor": "middle"
    });
    label.textContent = edge.label;
    edgeLayer.append(line, label);
  });
  svg.append(edgeLayer);

  const nodeLayer = svgElement(documentRef, "g", { class: "knowledge-focus-map__nodes" });
  model.nodes.forEach((node) => {
    const link = svgElement(documentRef, "a", {
      href: hrefForNode(node),
      class: `knowledge-focus-map__node knowledge-focus-map__node--${node.group}${node.center ? " is-center" : ""}`,
      "aria-label": `${node.label} 기록 열기`
    });
    link.append(svgElement(documentRef, "rect", {
      x: node.x - (node.center ? 116 : 92),
      y: node.y - (node.center ? 42 : 34),
      width: node.center ? 232 : 184,
      height: node.center ? 84 : 68,
      rx: node.center ? 20 : 16
    }));
    appendLabel(documentRef, link, node);
    nodeLayer.append(link);
  });
  svg.append(nodeLayer);

  target.replaceChildren(svg);
  target.dataset.graphState = "rendered";
  return model;
}
