import { AssistantApi } from "./api.js";
import { styles } from "./styles.js";
import type { ChatMessage, TokenProvider } from "./types.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);

/** Small safe Markdown subset: escaped first, then links/emphasis/code/newlines. */
const markdown = (source: string): string => escapeHtml(source)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  .replace(/\n/g, "<br>");

const icons = {
  chat: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="26" stroke-width="3"/><circle cx="32" cy="20" r="4" fill="currentColor" stroke="none"/><path d="M21 29 32 34l11-5M32 34v15M32 39 23 49M32 39l9 10" stroke-width="4"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
};

const widgetStyleSheet = new CSSStyleSheet();
widgetStyleSheet.replaceSync(styles);
const launcherLogoUrl = new URL("../su-chatbot-logo.png", import.meta.url).href;

interface SuSpeechRecognition {
  lang: string;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export class SuChatWidget extends HTMLElement {
  /** Set this property from application code. Tokens are never stored by the widget. */
  tokenProvider?: TokenProvider;

  private api?: AssistantApi;
  private sessionId?: string;
  private messages: ChatMessage[] = [];
  private busy = false;
  private initialized = false;
  private recognition?: SuSpeechRecognition;
  private readonly root = this.attachShadow({ mode: "open" });

  connectedCallback(): void {
    this.root.adoptedStyleSheets = [widgetStyleSheet];
    this.renderShell();
  }

  setReady(): void {
    this.removeAttribute("loading");
    (this.root.querySelector(".launcher") as HTMLButtonElement | null)?.removeAttribute("disabled");
  }

  async open(): Promise<void> {
    if (this.hasAttribute("loading")) return;
    this.root.querySelector(".panel")?.classList.remove("hidden");
    this.root.querySelector(".launcher")?.classList.add("hidden");
    if (!this.initialized) await this.initialize();
    (this.root.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
  }

  close(): void {
    this.root.querySelector(".panel")?.classList.add("hidden");
    this.root.querySelector(".launcher")?.classList.remove("hidden");
  }

  private get baseUrl(): URL {
    const value = this.getAttribute("api-base-url");
    if (!value) throw new Error("su-chat requires api-base-url");
    return new URL(value, document.baseURI);
  }

  private storageKey(): string { return `su-chat:session:${this.baseUrl.origin}`; }

  private async initialize(): Promise<void> {
    if (!this.tokenProvider) {
      this.dispatchEvent(new CustomEvent("su-auth-required", { bubbles: true, composed: true }));
      this.showError("Please sign in to use the student assistant.");
      return;
    }
    this.api = new AssistantApi(this.baseUrl, this.tokenProvider);
    const savedId = localStorage.getItem(this.storageKey()) ?? undefined;
    try {
      const session = savedId
        ? await this.api.getSession(savedId).catch(() => this.api!.createSession())
        : await this.api.createSession();
      this.sessionId = session.id;
      this.messages = session.messages;
      localStorage.setItem(this.storageKey(), session.id);
      this.initialized = true;
      const notice = this.root.querySelector(".notice") as HTMLElement | null;
      if (notice) { notice.textContent = ""; notice.classList.add("hidden"); }
      this.renderMessages();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : "Unable to start the assistant.");
    }
  }

  private async send(): Promise<void> {
    const input = this.root.querySelector("textarea") as HTMLTextAreaElement;
    const content = input.value.trim();
    if (!content || this.busy || !this.api || !this.sessionId) return;
    input.value = "";
    this.messages.push({ id: crypto.randomUUID(), role: "user", content, created_at: new Date().toISOString(), citations: [] });
    this.setBusy(true);
    this.renderMessages();
    try {
      this.messages.push(await this.api.send(this.sessionId, content));
    } catch (error) {
      this.showError(error instanceof Error ? error.message : "Unable to send your message.");
    } finally {
      this.setBusy(false);
      this.renderMessages();
    }
  }

  private setBusy(value: boolean): void {
    this.busy = value;
    (this.root.querySelector(".send") as HTMLButtonElement | null)?.toggleAttribute("disabled", value);
  }

  private showError(message: string): void {
    const notice = this.root.querySelector(".notice") as HTMLElement | null;
    if (notice) { notice.textContent = message; notice.classList.remove("hidden"); }
  }

  private toggleVoice(): void {
    const button = this.root.querySelector(".voice") as HTMLButtonElement;
    if (this.recognition) { this.recognition.stop(); return; }
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => SuSpeechRecognition;
      webkitSpeechRecognition?: new () => SuSpeechRecognition;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { this.showError("Voice input is not supported in this browser."); return; }
    const recognition = new Recognition();
    recognition.lang = "en-KE";
    recognition.interimResults = true;
    recognition.onresult = (event: unknown) => {
      const result = event as { results: ArrayLike<{ 0: { transcript: string } }> };
      const input = this.root.querySelector("textarea") as HTMLTextAreaElement;
      input.value = Array.from(result.results).map((item) => item[0].transcript).join(" ");
    };
    recognition.onend = () => {
      this.recognition = undefined;
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    };
    this.recognition = recognition;
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
    recognition.start();
  }

  private renderMessages(): void {
    const container = this.root.querySelector(".messages") as HTMLElement;
    const welcome = this.getAttribute("welcome-message") ?? "Hello! I’m your SU Assistant. How can I help you today?";
    const isWelcome = this.messages.length === 0;
    const items: ChatMessage[] = isWelcome ? [{ id: "welcome", role: "assistant", content: welcome, created_at: new Date().toISOString(), citations: [] }] : this.messages;
    const rows = items.map((message) => {
      const sources = message.citations.length ? `<div class="sources">${message.citations.map((item) => `<span class="source">${icons.source}${escapeHtml(item.title)}</span>`).join("")}</div>` : "";
      const time = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at));
      const avatar = message.role === "assistant" ? '<span class="mini-avatar" aria-hidden="true">SU</span>' : "";
      return `<div class="message-row ${message.role}">${avatar}<div class="message-stack"><div class="bubble">${markdown(message.content)}${sources}</div><div class="meta">${message.role === "assistant" ? "SU Assistant · " : ""}${time}</div></div></div>`;
    }).join("");
    const suggestions = isWelcome ? '<div class="suggestions" aria-label="Suggested questions"><button class="quick-reply" type="button">Fee deadlines</button><button class="quick-reply" type="button">Semester registration</button><button class="quick-reply" type="button">Academic advising</button></div>' : "";
    const typing = this.busy ? '<div class="typing-row" aria-live="polite"><span class="mini-avatar">SU</span><div class="typing" aria-label="SU Assistant is typing"><i></i><i></i><i></i></div></div>' : "";
    container.innerHTML = rows + suggestions + typing;
    container.querySelectorAll<HTMLButtonElement>(".quick-reply").forEach((button) => button.addEventListener("click", () => {
      const input = this.root.querySelector("textarea") as HTMLTextAreaElement;
      input.value = button.textContent ?? "";
      input.focus();
    }));
    container.scrollTop = container.scrollHeight;
  }

  private renderShell(): void {
    const label = escapeHtml(this.getAttribute("label") ?? "SU Assistant");
    this.root.innerHTML = `<button class="launcher" type="button" aria-label="Open ${label}" ${this.hasAttribute("loading") ? "disabled" : ""}><img src="${launcherLogoUrl}" alt="" aria-hidden="true"></button>
      <section class="panel hidden" role="dialog" aria-label="${label}">
        <header class="header"><div class="avatar">SU<span class="status-dot"></span></div><div class="identity"><strong>${label}</strong><small><span class="online"></span>Online · Student support</small></div><button class="header-action close" type="button" aria-label="Close">${icons.close}</button></header>
        <div class="trustbar">${icons.shield}<span>Grounded in approved university sources</span></div>
        <div class="notice hidden" role="alert"></div><main class="messages" aria-live="polite"></main>
        <div class="composer-wrap"><form class="composer"><button class="tool voice" type="button" aria-label="Use voice input" aria-pressed="false">${icons.mic}</button><textarea maxlength="4000" rows="1" aria-label="Message" placeholder="Type your question..."></textarea><button class="send" type="submit" aria-label="Send message">${icons.send}</button></form><div class="footer-note">SU Assistant can make mistakes. Verify important information.</div></div>
      </section>`;
    this.root.querySelector(".launcher")!.addEventListener("click", () => void this.open());
    this.root.querySelector(".close")!.addEventListener("click", () => this.close());
    this.root.querySelector(".voice")!.addEventListener("click", () => this.toggleVoice());
    this.root.querySelector("form")!.addEventListener("submit", (event) => { event.preventDefault(); void this.send(); });
    this.root.querySelector("textarea")!.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter" && !(event as KeyboardEvent).shiftKey) { event.preventDefault(); void this.send(); }
    });
  }
}

if (!customElements.get("su-chat")) customElements.define("su-chat", SuChatWidget);

declare global { interface HTMLElementTagNameMap { "su-chat": SuChatWidget; } }
