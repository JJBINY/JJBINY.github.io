export const conversationSessionStorageKey = "portfolio-conversation-v2-preset";
const SCHEMA = "portfolio-browser-conversation-v2-clarification";

export function createConversationSessionStore({
  storage,
  now = () => Date.now(),
  ttlMs = 7_200_000,
  maxExchanges = 20,
  maxBytes = 256 * 1024
} = {}) {
  function load({ agentContract, clientRelease }) {
    try {
      const payload = JSON.parse(storage?.getItem(conversationSessionStorageKey) ?? "null");
      if (!validPayload(payload, { agentContract, clientRelease })) return null;
      if (now() - payload.savedAt > ttlMs) {
        clear();
        return null;
      }
      return Object.freeze({
        sessionId: payload.sessionId,
        agentContract: payload.agentContract,
        clientRelease: payload.clientRelease,
        savedAt: payload.savedAt,
        turns: Object.freeze(payload.turns.map((turn) => Object.freeze({
          role: turn.role,
          body: turn.body,
          sources: Object.freeze(turn.sources.map((source) => Object.freeze({ ...source })))
        }))),
        pendingClarification: sanitizePendingClarification(payload.pendingClarification)
      });
    } catch {
      return null;
    }
  }

  function save({ sessionId, agentContract, clientRelease, turns, pendingClarification = null }) {
    if (typeof sessionId !== "string" || !sessionId || !Array.isArray(turns)) return false;
    const boundedTurns = sanitizeTurns(turns).slice(-(maxExchanges * 2));
    const payload = {
      schema: SCHEMA,
      sessionId,
      agentContract,
      clientRelease,
      savedAt: now(),
      turns: boundedTurns,
      pendingClarification: sanitizePendingClarification(pendingClarification)
    };
    while (payload.turns.length > 2 && byteLength(payload) > maxBytes) payload.turns.splice(0, 2);
    if (byteLength(payload) > maxBytes) return false;
    try {
      storage?.setItem(conversationSessionStorageKey, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    try {
      storage?.removeItem(conversationSessionStorageKey);
    } catch {
      // Browser storage is a progressive enhancement.
    }
  }

  return Object.freeze({ load, save, clear });
}

export function sanitizePublicSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter(({ label, href }) => typeof label === "string" && typeof href === "string" && href.startsWith("#"))
    .slice(0, 3)
    .map(({ label, href }) => ({ label: label.slice(0, 120), href: href.slice(0, 240) }));
}

function sanitizeTurns(turns) {
  return turns.filter(({ role, body }) => ["user", "assistant"].includes(role) && typeof body === "string" && body.trim())
    .map(({ role, body, sources }) => ({
      role,
      body: body.slice(0, 5_000),
      sources: role === "assistant" ? sanitizePublicSources(sources) : []
    }));
}

function validPayload(payload, identity) {
  return payload?.schema === SCHEMA
    && payload.agentContract === identity.agentContract
    && payload.clientRelease === identity.clientRelease
    && typeof payload.sessionId === "string"
    && Array.isArray(payload.turns)
    && (!payload.pendingClarification || Boolean(sanitizePendingClarification(payload.pendingClarification)))
    && payload.turns.every(({ role, body, sources }) =>
      ["user", "assistant"].includes(role)
      && typeof body === "string"
      && Array.isArray(sources)
    );
}

function sanitizePendingClarification(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.slice(0, 100) : "";
  const question = typeof value.question === "string" ? value.question.slice(0, 300) : "";
  const options = Array.isArray(value.options) ? value.options.slice(0, 2).map((option) => ({
    id: typeof option?.id === "string" ? option.id.slice(0, 80) : "",
    label: typeof option?.label === "string" ? option.label.slice(0, 160) : ""
  })).filter(({ id: optionId, label }) => optionId && label) : [];
  if (!id || !question || options.length !== 2) return null;
  return Object.freeze({ id, question, options: Object.freeze(options.map(Object.freeze)), expiresAt: value.expiresAt ?? null });
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
