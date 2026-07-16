# Firebase and Cloud Run deployment

## What goes where

- **Firebase Hosting:** the compiled web component and preview/landing page in
  `web-widget/public`.
- **Cloud Run:** the FastAPI Docker container in `backend/`, because the API needs
  server-side secrets, PostgreSQL connections, outbound integrations, and WebSockets.
- **Cloud SQL for PostgreSQL:** production chat history and pgvector knowledge index.
- **Secret Manager:** OpenAI, AMS, identity, JWT/KMS, and database credentials.

The Flutter package is released inside the existing SU Android/iOS application; it
is not deployed to Firebase Hosting. Firebase App Distribution can optionally be used
for internal mobile testing.

## Preview locally

```powershell
npm --prefix web-widget install
npm --prefix web-widget run build
npm --prefix web-widget run preview
```

Open `http://127.0.0.1:4173`. The preview deliberately uses mock answers and requires
no university credentials or backend.

## Deploy the static site

1. Create/select a Firebase project and enable Hosting.
2. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.
3. Replace `YOUR_CLOUD_RUN_SERVICE_URL` in `firebase.json` with the API origin.
4. Authenticate and deploy:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only hosting
```

Firebase will provide `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com` URLs.

## Deploy the API to Cloud Run

The project-specific deployment is scripted. It enables required APIs, creates a
random JWT signing secret without displaying it, deploys using the least-privilege
runtime service account, updates the token issuer URL, and prepares the widget's live
runtime configuration:

```powershell
.\deploy\deploy-cloud-run.ps1
```

This currently waits on an active Google Cloud billing account. `--allow-unauthenticated`
only makes the API gateway reachable; all session/chat endpoints still require a valid,
short-lived assistant JWT issued after CAS/OIDC validation.

Hosting rewrites can proxy REST traffic to Cloud Run, but Firebase Hosting has a
60-second dynamic-response timeout. For robust WebSockets, configure the widget/app
with the direct Cloud Run or custom API domain and implement reconnect logic.

## Before a real launch

- Set the host token provider after Strathmore supplies CAS/OIDC configuration. The
  runtime config keeps the public Firebase page in preview mode until then.
- Remove or clearly label preview content and sample sources.
- Configure CAS/AD, AMS, Cloud SQL/pgvector, Secret Manager, budgets, monitoring,
  retention, rate limits, WAF, and approved knowledge ingestion.
- Run penetration, accessibility, RAG evaluation, disaster-recovery, and DPO reviews.
