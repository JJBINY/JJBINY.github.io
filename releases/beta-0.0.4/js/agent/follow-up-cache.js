const STORAGE_KEY = "portfolio-follow-ups-v2-preset";

function normalizeQuestion(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function validFollowUps(value) {
  return Array.isArray(value)
    && value.length >= 2
    && value.length <= 3
    && value.every((item) => typeof item === "string" && item.trim() && item.length <= 140);
}

function parseEntries(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry) => typeof entry?.key === "string" && validFollowUps(entry.followUps))
      : [];
  } catch {
    return [];
  }
}

function writeEntries(storage, entries) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage is a progressive enhancement. A disabled or full store must not block chat.
  }
}

export async function createFollowUpCacheKey({
  question,
  queryScope,
  publicBundleDigest,
  goldCorpusDigest,
  queryIndexDigest,
  presetDigest,
  model,
  agentContract,
  clientRelease,
  pageContext,
  conversationDigest
}) {
  const payload = JSON.stringify({
    question: normalizeQuestion(question),
    queryScope: queryScope?.kind ?? "global",
    projectId: queryScope?.projectId ?? null,
    publicBundleDigest: String(publicBundleDigest ?? "unknown"),
    goldCorpusDigest: String(goldCorpusDigest ?? "none"),
    queryIndexDigest: String(queryIndexDigest ?? "unknown"),
    presetDigest: String(presetDigest ?? "unknown"),
    model: String(model ?? "unknown"),
    agentContract: String(agentContract ?? "portfolio-agent-v1"),
    clientRelease: String(clientRelease ?? "unknown"),
    page: {
      routeType: pageContext?.routeType ?? null,
      entityId: pageContext?.entityId ?? null,
      knowledgeNodeIds: Array.isArray(pageContext?.knowledgeNodeIds)
        ? [...pageContext.knowledgeNodeIds].sort()
        : []
    },
    conversationDigest: String(conversationDigest ?? "fresh")
  });
  const bytes = new TextEncoder().encode(payload);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createFollowUpCache({ storage, maxEntries = 24, now = () => Date.now() } = {}) {
  const boundedMax = Math.max(1, Math.min(24, Number(maxEntries) || 24));

  return Object.freeze({
    get(key) {
      const entries = parseEntries(storage);
      const found = entries.find((entry) => entry.key === key);
      if (!found) return null;
      found.usedAt = now();
      writeEntries(storage, entries.sort((left, right) => right.usedAt - left.usedAt));
      return Object.freeze([...found.followUps]);
    },
    set(key, followUps) {
      if (typeof key !== "string" || !validFollowUps(followUps)) return false;
      const entries = parseEntries(storage).filter((entry) => entry.key !== key);
      entries.unshift({ key, followUps: [...followUps], usedAt: now() });
      writeEntries(storage, entries.slice(0, boundedMax));
      return true;
    },
    inspect() {
      return Object.freeze(parseEntries(storage).map(({ key, usedAt }) => Object.freeze({ key, usedAt })));
    },
    clear() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // No-op when storage is unavailable.
      }
    }
  });
}

export const followUpCacheStorageKey = STORAGE_KEY;
