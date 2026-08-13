const MERMAID_ASSET_URL = new URL("../vendor/mermaid-11.16.0.min.js", import.meta.url);
const STYLESHEET_URL = new URL("./mermaid-renderer.css", import.meta.url);
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_SOURCE_LENGTH = 100_000;
const BLOCKED_SVG_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas"
];
const MOTION_PROFILES = new Set(["deployment-sequence"]);

let diagramSequence = 0;
let mermaidLoader;
const initializedMermaidApis = new WeakSet();

/**
 * Render Mermaid source into a target without trusting the returned SVG as HTML.
 *
 * Expected Mermaid load and syntax failures are represented by a visible source
 * fallback and a `{ status: "fallback" }` result. Invalid caller arguments throw.
 */
export async function renderMermaid(targetElement, source, options = {}) {
  assertRenderTarget(targetElement);
  const normalizedSource = normalizeMermaidSource(source);
  const label = normalizeLabel(options.label);
  const diagramId = createDiagramId(options.id);
  const ownerDocument = targetElement.ownerDocument ?? globalThis.document;

  ensureRendererStyles(ownerDocument);
  prepareTarget(targetElement, label, "loading");
  targetElement.replaceChildren(createLoadingState(ownerDocument));

  try {
    const mermaid = options.mermaid ?? await loadVendoredMermaid(ownerDocument);
    initializeMermaid(mermaid);
    await waitForDocumentFonts(ownerDocument);
    const { svg } = await mermaid.render(diagramId, normalizedSource);
    const svgElement = parseAndSanitizeSvg(ownerDocument, svg, label);
    applyMotionProfile(svgElement, options.motionProfile);
    const canvas = ownerDocument.createElement("div");
    canvas.className = "mermaid-diagram__canvas";
    canvas.append(svgElement);

    const children = [canvas];
    if (options.showSource) children.push(createSourceDisclosure(ownerDocument, normalizedSource));
    targetElement.replaceChildren(...children);
    prepareTarget(targetElement, label, "rendered");

    return { status: "rendered", id: diagramId };
  } catch (error) {
    targetElement.replaceChildren(createSourceFallback(ownerDocument, normalizedSource));
    prepareTarget(targetElement, label, "fallback");

    return {
      status: "fallback",
      id: diagramId,
      error: describeError(error)
    };
  }
}

async function waitForDocumentFonts(ownerDocument) {
  const ready = ownerDocument.fonts?.ready;
  if (!ready || typeof ready.then !== "function") return;
  let timeoutId;
  await Promise.race([
    ready,
    new Promise((resolve) => {
      timeoutId = setTimeout(resolve, 2_000);
    })
  ]);
  clearTimeout(timeoutId);
}

/**
 * Enhance declarative diagram blocks in document order.
 *
 * Markup contract:
 *   <figure data-mermaid-diagram data-mermaid-label="설명">
 *     <pre data-mermaid-source><code>flowchart LR ...</code></pre>
 *   </figure>
 *
 * Source is read with `textContent`; HTML from the source is never inserted.
 */
export async function renderMermaidBlocks(root = globalThis.document) {
  if (!root?.querySelectorAll) {
    throw new TypeError("renderMermaidBlocks에는 querySelectorAll을 지원하는 root가 필요합니다.");
  }

  const blocks = collectDiagramBlocks(root);
  const results = [];

  // Mermaid owns shared parser/configuration state, so keep renders deterministic.
  for (const block of blocks) {
    const sourceElement = block.querySelector("[data-mermaid-source]");
    const source = sourceElement?.textContent ?? "";
    try {
      const result = await renderMermaid(block, source, {
        id: block.dataset.mermaidId,
        label: block.dataset.mermaidLabel,
        motionProfile: block.dataset.mermaidMotionProfile,
        showSource: block.dataset.mermaidShowSource === "true"
      });
      results.push(result);
    } catch (error) {
      const ownerDocument = block.ownerDocument ?? globalThis.document;
      const label = normalizeLabel(block.dataset.mermaidLabel);
      ensureRendererStyles(ownerDocument);
      block.replaceChildren(createSourceFallback(ownerDocument, source));
      prepareTarget(block, label, "fallback");
      results.push({
        status: "fallback",
        id: createDiagramId(block.dataset.mermaidId),
        error: describeError(error)
      });
    }
  }

  return results;
}

function applyMotionProfile(svg, requestedProfile) {
  const profile = typeof requestedProfile === "string" ? requestedProfile.trim() : "";
  if (!MOTION_PROFILES.has(profile)) return;

  svg.dataset.motionProfile = profile;
  const messages = [...svg.querySelectorAll(
    ".messageLine0, .messageLine1, .messageText, .sequenceNumber"
  )];
  messages.forEach((element, index) => {
    element.classList.add("mermaid-motion-step");
    element.style.setProperty("--diagram-motion-order", String(index));
  });
}

export function normalizeMermaidSource(source) {
  if (typeof source !== "string") {
    throw new TypeError("Mermaid source는 문자열이어야 합니다.");
  }

  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new TypeError("Mermaid source가 비어 있습니다.");
  if (normalized.length > MAX_SOURCE_LENGTH) {
    throw new RangeError(`Mermaid source는 ${MAX_SOURCE_LENGTH.toLocaleString()}자 이하여야 합니다.`);
  }
  return normalized;
}

function collectDiagramBlocks(root) {
  const descendants = [...root.querySelectorAll("[data-mermaid-diagram]")];
  if (root.matches?.("[data-mermaid-diagram]")) descendants.unshift(root);
  return descendants.filter(
    (block) => !["loading", "rendered", "fallback"].includes(block.dataset.mermaidState)
  );
}

function assertRenderTarget(targetElement) {
  if (!targetElement?.replaceChildren || !targetElement?.ownerDocument) {
    throw new TypeError("renderMermaid에는 DOM target element가 필요합니다.");
  }
}

function normalizeLabel(label) {
  if (typeof label !== "string" || !label.trim()) return "기술 아키텍처 다이어그램";
  return label.trim().slice(0, 240);
}

function createDiagramId(requestedId) {
  diagramSequence += 1;
  const safeSuffix = typeof requestedId === "string"
    ? requestedId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    : "";
  return `portfolio-mermaid-${safeSuffix || "diagram"}-${diagramSequence}`;
}

function prepareTarget(targetElement, label, state) {
  targetElement.classList.add("mermaid-diagram");
  targetElement.dataset.mermaidState = state;
  targetElement.setAttribute("aria-label", label);
  if (state === "loading") targetElement.setAttribute("aria-busy", "true");
  else targetElement.removeAttribute("aria-busy");
}

function ensureRendererStyles(ownerDocument) {
  const marker = "link[data-mermaid-renderer-styles]";
  if (ownerDocument.querySelector(marker)) return;

  const link = ownerDocument.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET_URL.href;
  link.dataset.mermaidRendererStyles = "";
  ownerDocument.head?.append(link);
}

async function loadVendoredMermaid(ownerDocument) {
  if (globalThis.mermaid?.render) return globalThis.mermaid;
  if (mermaidLoader) return mermaidLoader;

  mermaidLoader = new Promise((resolve, reject) => {
    const script = ownerDocument.createElement("script");
    script.src = MERMAID_ASSET_URL.href;
    script.async = true;
    script.dataset.mermaidRendererEngine = "11.16.0";
    script.addEventListener("load", () => {
      if (globalThis.mermaid?.render) resolve(globalThis.mermaid);
      else reject(new Error("Vendored Mermaid asset loaded without a render API."));
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error("Vendored Mermaid asset could not be loaded."));
    }, { once: true });
    ownerDocument.head?.append(script);
  }).catch((error) => {
    mermaidLoader = undefined;
    throw error;
  });

  return mermaidLoader;
}

function initializeMermaid(mermaid) {
  if (typeof mermaid?.initialize !== "function" || typeof mermaid?.render !== "function") {
    throw new TypeError("Mermaid renderer API가 올바르지 않습니다.");
  }
  if (initializedMermaidApis.has(mermaid)) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    fontFamily: "Pretendard Variable, Pretendard, Inter, ui-sans-serif, system-ui, sans-serif",
    themeVariables: {
      background: "#ffffff",
      primaryColor: "#eef4ff",
      primaryTextColor: "#162238",
      primaryBorderColor: "#8ba8d6",
      secondaryColor: "#f3f8f7",
      secondaryTextColor: "#162238",
      secondaryBorderColor: "#8eb7ad",
      tertiaryColor: "#fbfcfe",
      tertiaryTextColor: "#344158",
      tertiaryBorderColor: "#cbd5e3",
      lineColor: "#6b7f9c",
      textColor: "#162238",
      noteBkgColor: "#fff8e7",
      noteBorderColor: "#d5b778",
      clusterBkg: "#f7f9fc",
      clusterBorder: "#cbd5e3"
    },
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
      curve: "basis"
    },
    sequence: {
      useMaxWidth: true
    }
  });
  initializedMermaidApis.add(mermaid);
}

function parseAndSanitizeSvg(ownerDocument, svgMarkup, label) {
  if (typeof svgMarkup !== "string" || !svgMarkup.trim()) {
    throw new Error("Mermaid renderer returned an empty SVG.");
  }

  const Parser = ownerDocument.defaultView?.DOMParser ?? globalThis.DOMParser;
  if (!Parser) throw new Error("DOMParser is unavailable in this browser.");
  const parsed = new Parser().parseFromString(svgMarkup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("Mermaid SVG could not be parsed.");

  const svg = parsed.documentElement;
  if (svg.localName !== "svg" || svg.namespaceURI !== SVG_NAMESPACE) {
    throw new Error("Mermaid renderer did not return an SVG document.");
  }

  sanitizeSvgTree(svg);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.removeAttribute("height");
  svg.setAttribute("width", "100%");

  if (!svg.querySelector("title")) {
    const title = parsed.createElementNS(SVG_NAMESPACE, "title");
    title.textContent = label;
    svg.insertBefore(title, svg.firstChild);
  }

  return ownerDocument.importNode(svg, true);
}

function sanitizeSvgTree(svg) {
  replaceForeignObjectsWithSvgText(svg);
  svg.querySelectorAll(BLOCKED_SVG_ELEMENTS.join(",")).forEach((element) => element.remove());

  [svg, ...svg.querySelectorAll("*")].forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (["href", "xlink:href", "src"].includes(name) && !value.startsWith("#")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (name === "style" && containsUnsafeCss(value)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (/^javascript:/i.test(value) || containsExternalUrl(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  svg.querySelectorAll("style").forEach((styleElement) => {
    if (containsUnsafeCss(styleElement.textContent ?? "")) styleElement.remove();
  });
}

function replaceForeignObjectsWithSvgText(svg) {
  svg.querySelectorAll("foreignObject").forEach((foreignObject) => {
    const lines = extractPlainTextLines(foreignObject);
    if (lines.length === 0) {
      foreignObject.remove();
      return;
    }

    const ownerDocument = foreignObject.ownerDocument;
    const text = ownerDocument.createElementNS(SVG_NAMESPACE, "text");
    const x = readSvgNumber(foreignObject.getAttribute("x"));
    const y = readSvgNumber(foreignObject.getAttribute("y"));
    const width = readSvgNumber(foreignObject.getAttribute("width"));
    const height = readSvgNumber(foreignObject.getAttribute("height"));
    const centerX = x + (width / 2);
    const centerY = y + (height / 2);
    const lineHeight = 17;
    const firstLineY = centerY - ((lines.length - 1) * lineHeight / 2);

    text.setAttribute("class", "mermaid-safe-label");
    text.setAttribute("x", String(centerX));
    text.setAttribute("y", String(firstLineY));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("fill", "#162238");
    text.setAttribute("font-family", "inherit");

    lines.forEach((line, index) => {
      const tspan = ownerDocument.createElementNS(SVG_NAMESPACE, "tspan");
      tspan.setAttribute("x", String(centerX));
      if (index > 0) tspan.setAttribute("dy", String(lineHeight));
      tspan.textContent = line;
      text.append(tspan);
    });
    foreignObject.replaceWith(text);
  });
}

function extractPlainTextLines(foreignObject) {
  const paragraphs = [...foreignObject.querySelectorAll("p")]
    .map((paragraph) => collapseWhitespace(paragraph.textContent))
    .filter(Boolean);
  if (paragraphs.length > 0) return paragraphs;

  const plainText = collapseWhitespace(foreignObject.textContent);
  return plainText ? [plainText] : [];
}

function collapseWhitespace(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readSvgNumber(value) {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function containsUnsafeCss(value) {
  return /@import|javascript\s*:|expression\s*\(|behavior\s*:/i.test(value) || containsExternalUrl(value);
}

function containsExternalUrl(value) {
  const urlPattern = /url\(\s*([^)]*?)\s*\)/gi;
  return [...value.matchAll(urlPattern)].some((match) => {
    const target = match[1].trim().replace(/^(['"])(.*)\1$/, "$2").trim();
    return !target.startsWith("#");
  });
}

function createLoadingState(ownerDocument) {
  const loading = ownerDocument.createElement("p");
  loading.className = "mermaid-diagram__status";
  loading.textContent = "다이어그램을 렌더링하고 있습니다.";
  loading.setAttribute("role", "status");
  return loading;
}

function createSourceDisclosure(ownerDocument, source) {
  const details = ownerDocument.createElement("details");
  details.className = "mermaid-diagram__source";
  const summary = ownerDocument.createElement("summary");
  summary.textContent = "Mermaid source 보기";
  details.append(summary, createCodeBlock(ownerDocument, source));
  return details;
}

function createSourceFallback(ownerDocument, source) {
  const fallback = ownerDocument.createElement("div");
  fallback.className = "mermaid-diagram__fallback";
  const message = ownerDocument.createElement("p");
  message.textContent = "다이어그램을 렌더링하지 못해 Mermaid 원문으로 표시합니다.";
  fallback.append(message, createCodeBlock(ownerDocument, source));
  return fallback;
}

function createCodeBlock(ownerDocument, source) {
  const pre = ownerDocument.createElement("pre");
  const code = ownerDocument.createElement("code");
  code.className = "language-mermaid";
  code.textContent = source;
  pre.append(code);
  return pre;
}

function describeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : "Mermaid rendering failed."
  };
}
