function createAbortError() {
  const error = new Error("응답 생성이 취소되었습니다.");
  error.name = "AbortError";
  return error;
}

function wait(duration, signal) {
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, duration);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(createAbortError());
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function uniqueMatches(matches) {
  return matches.filter(
    (match, index, all) =>
      all.findIndex((item) => item.entry.id === match.entry.id) === index
  );
}

function uniqueStrings(items) {
  return [...new Set(items)];
}

function asSentence(value) {
  const trimmed = value.trim();
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function composeAnswer(matches, confidence) {
  const unique = uniqueMatches(matches);
  const [primaryMatch, secondaryMatch] = unique;
  const primary = primaryMatch?.entry;
  const secondary =
    secondaryMatch &&
    secondaryMatch.score >= Math.max(5, (primaryMatch?.score ?? 0) * 0.5)
      ? secondaryMatch.entry
      : null;

  if (!primary || confidence === "low") {
    return {
      answer:
        "현재 공개된 포트폴리오 자료만으로는 그 질문에 정확히 답하기 어렵습니다. 확인되지 않은 내용을 추측하는 대신, 프로젝트의 담당 범위나 설계 판단처럼 근거가 있는 주제로 질문해주시면 답변드리겠습니다.",
      entries: primary ? [primary] : [],
      insufficientEvidence: true
    };
  }

  const supportingSentence = secondary
    ? ` 함께 참고할 점은 다음과 같습니다. ${asSentence(secondary.summary)}`
    : "";

  return {
    answer: `${primary.answer}${supportingSentence}`,
    entries: secondary ? [primary, secondary] : [primary],
    insufficientEvidence: false
  };
}

async function streamText(text, onToken, tokenDelayMs, signal) {
  if (!onToken) return;

  const tokens = text.split(/(\s+)/).filter(Boolean);
  for (const token of tokens) {
    if (signal?.aborted) throw createAbortError();
    await onToken(token);
    await wait(tokenDelayMs, signal);
  }
}

export class MockAgentProvider {
  constructor(options = {}) {
    this.name = "mock";
    this.label = "MOCK MODE";
    this.notice =
      "현재는 실제 LLM이 아닌 로컬 응답 엔진으로 동작합니다. 답변 구조와 UI를 먼저 검증하는 단계입니다.";
    this.sectionCopy =
      "프로젝트·기술·경험·가치관을 자연어로 탐색합니다. 현재 프로토타입은 로컬 mock provider로 동작하며, 콘텐츠와 모델 연결부는 분리되어 있습니다.";
    this.initialDelayMs = options.initialDelayMs ?? 500;
    this.tokenDelayMs = options.tokenDelayMs ?? 24;
  }

  async generate({ question, retrieval, onToken, signal }) {
    const startedAt = performance.now();
    await wait(this.initialDelayMs, signal);

    const { answer, entries, insufficientEvidence } = composeAnswer(
      retrieval.matches,
      retrieval.confidence
    );

    await streamText(answer, onToken, this.tokenDelayMs, signal);
    const elapsedMs = Math.round(performance.now() - startedAt);

    const followUps = uniqueStrings(entries
      .flatMap((entry) => entry.followUps ?? [])
    ).slice(0, 3);

    return {
      answer,
      sourceIds: entries.map((entry) => entry.id),
      followUps,
      insufficientEvidence,
      confidence: retrieval.confidence,
      trace: {
        provider: "mock",
        followUpMode: "evidence-fallback",
        intent: retrieval.intent,
        bundle: retrieval.bundle,
        retrieved: retrieval.matches.map(({ entry, score, matchType, via }) => ({
          id: entry.id,
          title: entry.title,
          kind: entry.kind,
          score: Math.round(score * 10) / 10,
          matchType,
          via
        })),
        elapsedMs,
        note: "동일한 공개 지식 번들에서 검색한 검증된 정적 답변"
      }
    };
  }
}
