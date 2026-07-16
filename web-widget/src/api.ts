import type { ChatMessage, ChatSession, TokenProvider } from "./types.js";

export class AssistantApi {
  constructor(
    private readonly baseUrl: URL,
    private readonly tokenProvider: TokenProvider,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider();
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    if (!response.ok) {
      let message = "The assistant is temporarily unavailable.";
      try {
        const body = (await response.json()) as { detail?: string };
        message = body.detail ?? message;
      } catch {
        // Do not expose upstream response bodies.
      }
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }

  getSession(id: string): Promise<ChatSession> {
    return this.request(`/v1/sessions/${encodeURIComponent(id)}`);
  }

  createSession(clientSessionId?: string): Promise<ChatSession> {
    return this.request("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ client_session_id: clientSessionId }),
    });
  }

  async send(sessionId: string, content: string): Promise<ChatMessage> {
    const result = await this.request<{ message: ChatMessage }>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", body: JSON.stringify({ content }) },
    );
    return result.message;
  }
}
