# Mermaid renderer

`mermaid-renderer.js` turns portfolio-owned Mermaid source into responsive SVG
using the vendored Mermaid runtime. It uses `securityLevel: "strict"`, converts
Mermaid's XHTML labels to plain SVG text, removes active/external content, and
never inserts the returned SVG string with `innerHTML`.

## Programmatic API

```js
import { renderMermaid } from "./diagrams/mermaid-renderer.js";

const result = await renderMermaid(targetElement, project.diagram.source, {
  id: project.id,
  label: project.diagram.label,
  showSource: true
});
```

The promise resolves to either `{ status: "rendered", id }` or
`{ status: "fallback", id, error }`. Engine and syntax failures render the
original source inside `<pre><code>` rather than breaking the surrounding page.
Invalid caller arguments still throw.

## Declarative API

```html
<figure
  data-mermaid-diagram
  data-mermaid-id="retrieval-flow"
  data-mermaid-label="질문에서 근거 답변까지의 흐름"
  data-mermaid-show-source="true"
>
  <pre data-mermaid-source><code>flowchart LR
    Q[Question] --&gt; R[Retrieve]
    R --&gt; A[Answer]
  </code></pre>
</figure>
```

```js
import { renderMermaidBlocks } from "./diagrams/mermaid-renderer.js";

await renderMermaidBlocks(document);
```

`renderMermaidBlocks` reads only `textContent` from `[data-mermaid-source]` and
renders blocks in document order. Repeated calls leave completed and fallback
blocks unchanged.

The component stylesheet is loaded automatically from the same module directory.
For a particularly compact or wide diagram, callers can override
`--mermaid-min-width` on the target element.
