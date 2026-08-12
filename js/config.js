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

export const runtimeConfig = {
  content: {
    site: "./data/site.json",
    projects: "./data/projects.json",
    knowledge: "./data/knowledge.json",
    questions: "./data/questions.json",
    systemPrompt: "./prompts/system-prompt.txt"
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
