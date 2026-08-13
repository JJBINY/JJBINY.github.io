const INLINE_TOKEN = "\u0000";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tokenFor(kind, index) {
  return `${INLINE_TOKEN}${kind}${index}${INLINE_TOKEN}`;
}

function renderInline(value) {
  const tokens = [];
  const preserve = (kind, text) => {
    const index = tokens.push(escapeHtml(text)) - 1;
    return tokenFor(kind, index);
  };

  let text = String(value ?? "")
    .replace(/`([^`\n]+)`/g, (_match, code) => preserve("C", code))
    .replace(/\\([\\`*_{}\[\]()])/g, (_match, character) => preserve("E", character));
  text = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replaceAll("\n", "<br />");

  return text.replace(new RegExp(`${INLINE_TOKEN}([CE])(\\d+)${INLINE_TOKEN}`, "g"), (_match, kind, index) => (
    kind === "C" ? `<code>${tokens[Number(index)]}</code>` : tokens[Number(index)]
  ));
}

export function markdownToHtml(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let fence = null;
  let fenceLines = [];
  let fenceLanguage = "";

  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderInline(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };
  const flushBlocks = () => {
    flushParagraph();
    closeList();
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/u);
    if (fence) {
      if (fenceMatch) {
        const language = fenceLanguage ? ` data-language="${escapeHtml(fenceLanguage)}"` : "";
        output.push(`<pre><code${language}>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
        fence = null;
        fenceLines = [];
        fenceLanguage = "";
      } else {
        fenceLines.push(line);
      }
      continue;
    }
    if (fenceMatch) {
      flushBlocks();
      fence = true;
      fenceLines = [];
      fenceLanguage = fenceMatch[1] ?? "";
      continue;
    }

    if (!line.trim()) {
      flushBlocks();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*$/u);
    if (heading) {
      flushBlocks();
      output.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/u);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        output.push("<ul>");
        listType = "ul";
      }
      output.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/u);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        output.push("<ol>");
        listType = "ol";
      }
      output.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/u);
    if (quote) {
      flushBlocks();
      output.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  const language = fenceLanguage ? ` data-language="${escapeHtml(fenceLanguage)}"` : "";
  if (fence) output.push(`<pre><code${language}>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
  flushBlocks();
  return output.join("");
}

export function renderMarkdown(element, source) {
  if (!element) return;
  element.innerHTML = markdownToHtml(source);
}
