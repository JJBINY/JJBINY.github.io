const MAX_ATTACHMENTS = 3;

const DIAGRAM_BINDINGS = Object.freeze({
  "project.industrial-multi-tool-agent": Object.freeze(["steel-domain-agent/system-architecture"]),
  "steel.preprocessing-source-lineage": Object.freeze(["steel-domain-agent/unstructured-preprocessing"]),
  "architecture.domain-agent-orchestration": Object.freeze(["steel-domain-agent/tool-agent-orchestrator"]),
  "architecture.mcp-as-adapter": Object.freeze(["steel-domain-agent/tool-agent-orchestrator"]),
  "workflow.schema-validated-agent": Object.freeze(["steel-domain-agent/e2e-agent-loop"]),
  "architecture.llm-runtime-responsibility": Object.freeze(["steel-domain-agent/system-architecture"]),
  "reliability.provenance-gated-answer": Object.freeze(["steel-domain-agent/e2e-agent-loop"]),
  "project.multimodal-rag-search": Object.freeze(["multimodal-document-intelligence/system-architecture"]),
  "document.hierarchical-indexing": Object.freeze(["multimodal-document-intelligence/identity-model"]),
  "document.contextual-data-to-text": Object.freeze(["multimodal-document-intelligence/document-to-retrieval"]),
  "document.multimodal-context-preservation": Object.freeze(["multimodal-document-intelligence/document-to-retrieval"]),
  "document.passage-fragment-retrieval": Object.freeze(["multimodal-document-intelligence/precision-rag"]),
  "project.personal-agent-harness": Object.freeze(["personal-agent-harness/system-architecture"]),
  "harness.single-source-configuration": Object.freeze(["personal-agent-harness/system-architecture"]),
  "harness.wiki-skill-loop": Object.freeze(["personal-agent-harness/context-skill-loop"]),
  "harness.knowledge-preflight-ledger": Object.freeze(["personal-agent-harness/context-skill-loop"]),
  "harness.trigger-routing": Object.freeze(["personal-agent-harness/skill-family-routing"]),
  "project.portfolio-interview-agent": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.public-agent-only-boundary": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.local-first-runtime": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.source-validated-retrieval": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.contextual-session-memory": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.resilient-offline-fallback": Object.freeze(["portfolio-interview-agent/interview-runtime"]),
  "portfolio-agent.public-release-allowlist": Object.freeze(["portfolio-interview-agent/interview-runtime"])
});

const REQUIRED_TEXT_FIELDS = Object.freeze([
  "id",
  "label",
  "title",
  "description",
  "question",
  "takeaway",
  "scopeNote"
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPublicSafeMermaidSource(source) {
  if (!isNonEmptyString(source) || source.length > 100_000) return false;
  return !(
    /%%\s*\{/i.test(source) ||
    /\bclick\s+[a-zA-Z0-9_-]+/i.test(source) ||
    /(?:javascript|data|file)\s*:/i.test(source) ||
    /https?:\/\/|\/\//i.test(source) ||
    /<\s*\/?\s*(?:script|style|iframe|object|embed|foreignObject)\b/i.test(source)
  );
}

function isPublicSafeSvgPath(source) {
  return /^assets\/project-diagrams\/[a-z0-9-]+\.svg$/.test(source ?? "");
}

function freezeReadingGuide(readingGuide) {
  if (!Array.isArray(readingGuide) || readingGuide.length === 0) return null;

  const steps = readingGuide.map((item) => {
    if (!item || ![item.step, item.title, item.body].every(isNonEmptyString)) return null;
    return Object.freeze({
      step: item.step.trim(),
      title: item.title.trim(),
      body: item.body.trim()
    });
  });

  return steps.every(Boolean) ? Object.freeze(steps) : null;
}

function createTrustedAttachment(project, diagram) {
  if (!project || !diagram) return null;
  if (!isNonEmptyString(project.id) || !isNonEmptyString(project.title)) return null;
  if (!REQUIRED_TEXT_FIELDS.every((field) => isNonEmptyString(diagram[field]))) return null;
  if (!isNonEmptyString(diagram.type) || !["svg", "mermaid"].includes(diagram.type)) return null;
  if (diagram.type === "mermaid" && !isPublicSafeMermaidSource(diagram.source)) return null;
  if (diagram.type === "svg" && !isPublicSafeSvgPath(diagram.src)) return null;

  const readingGuide = freezeReadingGuide(diagram.readingGuide);
  if (!readingGuide) return null;

  return Object.freeze({
    id: `${project.id}/${diagram.id}`,
    projectId: project.id,
    projectTitle: project.title.trim(),
    diagramId: diagram.id.trim(),
    label: diagram.label.trim(),
    title: diagram.title.trim(),
    description: diagram.description.trim(),
    question: diagram.question.trim(),
    takeaway: diagram.takeaway.trim(),
    readingGuide,
    scopeNote: diagram.scopeNote.trim(),
    type: diagram.type,
    ...(diagram.type === "svg"
      ? { src: diagram.src.trim(), alt: (diagram.alt ?? diagram.title).trim() }
      : { source: diagram.source.trim() })
  });
}

/**
 * Build a fail-closed catalog from local portfolio data.
 *
 * Only diagram keys named by DIAGRAM_BINDINGS are admitted. Response payloads,
 * model output, URLs and arbitrary Mermaid source never participate here.
 */
export function createDiagramAttachmentCatalog(projects) {
  const catalog = Object.create(null);
  if (!Array.isArray(projects)) return Object.freeze(catalog);

  const permittedKeys = new Set(Object.values(DIAGRAM_BINDINGS).flat());
  projects.forEach((project) => {
    if (!isNonEmptyString(project?.id) || !Array.isArray(project.diagrams)) return;
    project.diagrams.forEach((diagram) => {
      const key = `${project.id}/${diagram?.id ?? ""}`;
      if (!permittedKeys.has(key)) return;
      const attachment = createTrustedAttachment(project, diagram);
      if (attachment) catalog[key] = attachment;
    });
  });

  return Object.freeze(catalog);
}

/**
 * Resolve attachment cards from already-grounded evidence records.
 * Unknown IDs and response-supplied media fields are deliberately ignored.
 */
export function resolveDiagramAttachments(sources, catalog, limit = MAX_ATTACHMENTS) {
  if (!Array.isArray(sources) || !catalog || typeof catalog !== "object") return [];

  const boundedLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 0), MAX_ATTACHMENTS)
    : MAX_ATTACHMENTS;
  const seen = new Set();
  const attachments = [];

  for (const source of sources) {
    const keys = isNonEmptyString(source?.id) ? DIAGRAM_BINDINGS[source.id] : null;
    if (!keys) continue;

    for (const key of keys) {
      const attachment = Object.hasOwn(catalog, key) ? catalog[key] : null;
      if (!attachment || seen.has(attachment.id)) continue;
      seen.add(attachment.id);
      attachments.push(attachment);
      if (attachments.length >= boundedLimit) return attachments;
    }
  }

  return attachments;
}

function createElement(ownerDocument, tagName, className, text) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createPreview(ownerDocument) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = ownerDocument.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 116 76");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = ownerDocument.createElementNS(namespace, "path");
  path.setAttribute("d", "M58 22v13M24 35h68M24 35v15M92 35v15");
  path.setAttribute("class", "message-attachment__preview-path");
  svg.append(path);

  [[42, 8, 32, 14], [8, 50, 32, 14], [42, 50, 32, 14], [76, 50, 32, 14]].forEach(
    ([x, y, width, height], index) => {
      const rect = ownerDocument.createElementNS(namespace, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("rx", "4");
      rect.setAttribute("class", index === 0
        ? "message-attachment__preview-node is-primary"
        : "message-attachment__preview-node");
      svg.append(rect);
    }
  );

  return svg;
}

function renderGuide(ownerDocument, root, readingGuide) {
  root.replaceChildren();
  readingGuide.forEach((guide) => {
    const item = ownerDocument.createElement("li");
    item.append(
      createElement(ownerDocument, "span", "", guide.step),
      createElement(ownerDocument, "strong", "", guide.title),
      createElement(ownerDocument, "p", "", guide.body)
    );
    root.append(item);
  });
}

/**
 * Bind native-dialog dismissal and focus return behavior.
 * Native showModal supplies focus trapping; this layer owns cancel semantics and
 * deterministic return to the card that opened the lightbox.
 */
export function createDialogFocusManager(dialog, {
  fallbackFocus = null,
  onOpen = null,
  onClose = null
} = {}) {
  if (!dialog?.addEventListener || typeof dialog.showModal !== "function") {
    throw new TypeError("다이어그램 lightbox에는 native dialog가 필요합니다.");
  }

  let returnTarget = null;

  function close() {
    if (dialog.open) dialog.close();
  }

  function handleCancel(event) {
    event.preventDefault();
    close();
  }

  function handleBackdropClick(event) {
    if (event.target === dialog) close();
  }

  function handleClose() {
    onClose?.();
    const preferredTarget = returnTarget?.isConnected === false ? null : returnTarget;
    const target = preferredTarget ?? (typeof fallbackFocus === "function" ? fallbackFocus() : fallbackFocus);
    returnTarget = null;
    target?.focus?.({ preventScroll: true });
  }

  dialog.addEventListener("cancel", handleCancel);
  dialog.addEventListener("click", handleBackdropClick);
  dialog.addEventListener("close", handleClose);

  return Object.freeze({
    openFrom(opener) {
      returnTarget = opener ?? null;
      onOpen?.();
      if (!dialog.open) dialog.showModal();
    },
    close,
    destroy() {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
      dialog.removeEventListener("close", handleClose);
    }
  });
}

export function initializeDiagramAttachments({
  projects,
  dialog,
  renderDiagram,
  fallbackFocus = null
}) {
  if (!dialog?.querySelector || typeof renderDiagram !== "function") {
    throw new TypeError("다이어그램 attachment UI 초기화 인자가 올바르지 않습니다.");
  }

  const ownerDocument = dialog.ownerDocument;
  const catalog = createDiagramAttachmentCatalog(projects);
  const projectLabel = dialog.querySelector("[data-diagram-dialog-project]");
  const title = dialog.querySelector("[data-diagram-dialog-title]");
  const question = dialog.querySelector("[data-diagram-dialog-question]");
  const takeaway = dialog.querySelector("[data-diagram-dialog-takeaway]");
  const description = dialog.querySelector("[data-diagram-dialog-description]");
  const guide = dialog.querySelector("[data-diagram-dialog-guide]");
  const scope = dialog.querySelector("[data-diagram-dialog-scope]");
  const host = dialog.querySelector("[data-diagram-dialog-host]");
  const closeButton = dialog.querySelector("[data-diagram-dialog-close]");
  const requiredElements = [projectLabel, title, question, takeaway, description, guide, scope, host, closeButton];
  if (requiredElements.some((element) => !element)) {
    throw new Error("다이어그램 lightbox markup이 완전하지 않습니다.");
  }

  let renderSequence = 0;
  const focusManager = createDialogFocusManager(dialog, {
    fallbackFocus,
    onOpen() {
      ownerDocument.body?.classList.add("has-diagram-dialog");
    },
    onClose() {
      ownerDocument.body?.classList.remove("has-diagram-dialog");
    }
  });

  closeButton.addEventListener("click", focusManager.close);

  function openAttachment(attachment, opener) {
    renderSequence += 1;
    const currentSequence = renderSequence;
    projectLabel.textContent = `${attachment.projectTitle} · ${attachment.label}`;
    title.textContent = attachment.title;
    question.textContent = attachment.question;
    takeaway.textContent = attachment.takeaway;
    description.textContent = attachment.description;
    scope.textContent = attachment.scopeNote;
    renderGuide(ownerDocument, guide, attachment.readingGuide);

    const figure = createElement(ownerDocument, "figure", "diagram-lightbox__figure");
    figure.dataset.diagramAttachmentId = attachment.id;
    host.replaceChildren(figure);
    dialog.dataset.renderState = "loading";
    focusManager.openFrom(opener);

    const renderResult = attachment.type === "svg"
      ? renderSvgAttachment(ownerDocument, figure, attachment)
      : renderDiagram(figure, attachment.source, {
        id: `attachment-${attachment.projectId}-${attachment.diagramId}`,
        label: attachment.title
      });
    void Promise.resolve(renderResult).then((result) => {
      if (currentSequence !== renderSequence || !figure.isConnected) return;
      dialog.dataset.renderState = result?.status === "rendered" ? "rendered" : "fallback";
    }).catch(() => {
      if (currentSequence !== renderSequence || !figure.isConnected) return;
      figure.replaceChildren(createElement(
        ownerDocument,
        "p",
        "diagram-lightbox__error",
        "다이어그램을 표시하지 못했습니다. 설명과 읽는 순서는 계속 확인할 수 있습니다."
      ));
      dialog.dataset.renderState = "error";
    });
  }

  function renderSvgAttachment(document, figure, attachment) {
    const image = document.createElement("img");
    image.src = attachment.src;
    image.alt = attachment.alt;
    image.decoding = "async";
    figure.append(image);
    return { status: "rendered" };
  }

  function render(container, sources) {
    const attachments = resolveDiagramAttachments(sources, catalog);
    container.replaceChildren();
    container.hidden = attachments.length === 0;
    if (!attachments.length) return attachments;

    const header = createElement(ownerDocument, "div", "message-attachments__header");
    header.append(
      createElement(ownerDocument, "span", "", "함께 보기"),
      createElement(ownerDocument, "strong", "", `공개 아키텍처 ${attachments.length}개`)
    );
    const list = createElement(ownerDocument, "div", "message-attachments__list");

    attachments.forEach((attachment) => {
      const button = createElement(ownerDocument, "button", "message-attachment");
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-controls", dialog.id);

      const preview = createElement(ownerDocument, "span", "message-attachment__preview");
      preview.setAttribute("aria-hidden", "true");
      preview.append(createPreview(ownerDocument));

      const copy = createElement(ownerDocument, "span", "message-attachment__copy");
      copy.append(
        createElement(ownerDocument, "small", "", attachment.projectTitle),
        createElement(ownerDocument, "strong", "", attachment.title),
        createElement(ownerDocument, "span", "", attachment.question)
      );
      const action = createElement(ownerDocument, "span", "message-attachment__action", "확대 보기");
      button.append(preview, copy, action);
      button.addEventListener("click", () => openAttachment(attachment, button));
      list.append(button);
    });

    container.append(header, list);
    return attachments;
  }

  return Object.freeze({
    render,
    close: focusManager.close,
    isOpen: () => dialog.open,
    catalog
  });
}
