# Editing SU Assistant data

Open the Firebase SQL Connect schema for the `su-assistant` service:

https://console.firebase.google.com/project/su-chatbot-5tr4th/dataconnect/locations/me-west1/services/su-assistant/schema

The deployed schema contains four tables:

- `knowledge_sources` — document ownership, canonical link, version, review state,
  audience, and activation state.
- `knowledge_chunks` — searchable portions of each document and their Vertex vector.
- `chat_sessions` — an owner-scoped conversation record.
- `chat_messages` — persisted user/assistant messages and citation JSON.

The `admin` SQL Connect connector supplies operations to create sources, add chunks,
review/activate sources, activate chunks, list content, and test similarity search.
They are marked `NO_ACCESS`, so they are deliberately unavailable to public web/mobile
clients and should only be run by privileged staff or server automation.

## Safe content workflow

1. Export approved text from the university document-management system.
2. Ingest it with `python -m app.rag.ingest`, including its canonical URL, domain, and
   owning office. The command creates a `draft`, inactive source and inactive chunks.
3. Have the owning office compare the content with the authoritative document.
4. Change `approval_status` to `approved` and activate both the source and its chunks.
5. Run `SearchApprovedKnowledge` with representative student questions before release.

Never activate sample, expired, personally identifiable, or unowned content. Updating
a policy should create a new version; deactivate the superseded source so citations
remain explainable and rollback is straightforward.
