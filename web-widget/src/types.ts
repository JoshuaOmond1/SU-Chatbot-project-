export type Role = "user" | "assistant";

export interface Citation {
  id: string;
  title: string;
  source_url?: string;
  section?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  created_at: string;
  citations: Citation[];
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
}

export type TokenProvider = () => Promise<string> | string;
