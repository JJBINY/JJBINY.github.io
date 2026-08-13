function toGatewayError(response, payload) {
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : "로컬 AI 서버가 응답하지 않았습니다.";
  const error = new Error(message);
  error.status = response.status;
  error.code = payload?.code ?? "GATEWAY_ERROR";
  return error;
}

async function readSse(response, { onToken, onEvent }) {
  if (!response.body) throw new Error("스트리밍 응답 본문이 없습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let receivedToken = false;

  function consumeFrame(frame) {
    const lines = frame.split(/\r?\n/);
    let event = "message";
    const data = [];

    for (const line of lines) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }

    if (!data.length) return;
    const payload = JSON.parse(data.join("\n"));
    onEvent?.(event, payload);

    if (event === "token" && typeof payload.token === "string") {
      receivedToken = true;
      onToken?.(payload.token);
    } else if (event === "complete") {
      result = payload;
    } else if (event === "error") {
      const error = new Error(payload.error ?? "로컬 AI 스트리밍이 중단되었습니다.");
      error.code = payload.code ?? "STREAM_ERROR";
      error.partial = receivedToken;
      throw error;
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    frames.forEach(consumeFrame);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeFrame(buffer);
  if (!result || typeof result.answer !== "string") {
    const error = new Error("로컬 AI 서버가 complete 이벤트 없이 연결을 종료했습니다.");
    error.partial = receivedToken;
    throw error;
  }

  return result;
}

/**
 * Browser adapter for the same-origin portfolio gateway.
 *
 * Only the question and bounded conversation history cross this boundary.
 * Retrieval, prompts, model settings, and source validation are server-owned.
 */
export class OllamaAgentProvider {
  constructor(options = {}) {
    this.name = "ollama";
    this.label = "LOCAL AI · OLLAMA";
    this.notice =
      "로컬 모델이 공개 포트폴리오 근거를 검색해 답변합니다. 모델이 오프라인이면 검증된 기본 답변으로 자동 전환됩니다.";
    this.sectionCopy =
      "질문에 맞는 공개 근거를 서버에서 먼저 찾고, 로컬 LLM은 그 범위 안에서 답변을 구성합니다. 근거와 실행 지표를 함께 확인할 수 있습니다.";
    this.endpoint = options.endpoint ?? "/api/agent/chat/stream";
    this.resetEndpoint = Object.hasOwn(options, "resetEndpoint")
      ? options.resetEndpoint
      : "/api/agent/session/reset";
    this.sessionId = null;
  }

  async generate({ question, pageContext, queryScope, preferCachedFollowUps, onToken, onEvent, signal }) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Accept": "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        sessionId: this.sessionId,
        pageContext,
        queryScope,
        preferCachedFollowUps: preferCachedFollowUps === true
      }),
      signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw toGatewayError(response, payload);
    }

    const result = await readSse(response, { onToken, onEvent });
    if (typeof result.sessionId === "string") this.sessionId = result.sessionId;
    return result;
  }

  async resetSession() {
    const sessionId = this.sessionId;
    this.sessionId = null;
    if (!sessionId || !this.resetEndpoint) return;

    await fetch(this.resetEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    }).catch(() => {});
  }
}
