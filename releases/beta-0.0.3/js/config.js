/**
 * Runtime switches live here so content and provider changes do not leak into UI code.
 * GitHub Pages serves static content itself and sends only LLM chat requests to ngrok.
 */
export const remoteAgentBaseUrl = "https://16e8-124-56-35-56.ngrok-free.app";

export function resolveAgentRuntime(locationLike = globalThis.location) {
  const hostname = locationLike?.hostname?.toLowerCase() ?? "localhost";
  const isGitHubPages = hostname.endsWith(".github.io");

  return {
    healthEndpoint: isGitHubPages ? null : "/api/agent/health",
    ollama: {
      endpoint: isGitHubPages
        ? `${remoteAgentBaseUrl}/api/agent/chat/stream`
        : "/api/agent/chat/stream",
      resetEndpoint: isGitHubPages ? null : "/api/agent/session/reset"
    }
  };
}

const agentRuntime = resolveAgentRuntime();
const publicAssetBaseUrl = new URL("../", import.meta.url);

export function resolvePublicAssetUrl(path) {
  if (typeof path !== "string" || !path.trim()) throw new TypeError("public asset path is required");
  return new URL(path.replace(/^\.\//u, ""), publicAssetBaseUrl).href;
}

export const runtimeConfig = {
  content: {
    site: resolvePublicAssetUrl("data/site.json"),
    projects: resolvePublicAssetUrl("data/projects.json"),
    knowledge: resolvePublicAssetUrl("data/knowledge.json"),
    questions: resolvePublicAssetUrl("data/questions.json"),
    systemPrompt: resolvePublicAssetUrl("prompts/system-prompt.txt")
  },
  agent: {
    provider: "ollama",
    maxContextItems: 4,
    maxHistoryTurns: 6,
    healthEndpoint: agentRuntime.healthEndpoint,
    ollama: agentRuntime.ollama,
    mock: {
      initialDelayMs: 520,
      tokenDelayMs: 28
    },
    firebase: {
      model: "gemini-3.5-flash-lite",
      firebaseConfig: null
    }
  }
};
