# SU web chat component

Build with `npm install && npm run build`, serve `dist/` from Strathmore's static
asset/CDN domain, and mount it once:

```html
<script type="module" src="/assets/su-chat/index.js"></script>
<su-chat id="student-assistant"
  api-base-url="https://assistant.strathmore.edu"
  label="SU Assistant"></su-chat>
<script type="module">
  const chat = document.querySelector('#student-assistant');
  chat.tokenProvider = () => window.strathmoreAuth.getAssistantAccessToken();
</script>
```

The session identifier (not messages or credentials) is stored in `localStorage`.
On refresh, the widget reloads owner-scoped history from the API. Keep a strict CSP,
serve over HTTPS, allow only the production website origin in API CORS, and never
put access tokens in markup, URLs, or local storage.
