# Launch inputs still required

The application, Firebase Hosting, SQL Connect schema, IAM identities, and deployment
automation are prepared. These inputs must come from Strathmore or Google before a
real student launch:

1. **Google billing activation** — needed only to activate Cloud Build, Secret Manager,
   Vertex AI runtime calls, and Cloud Run. Then run `deploy/deploy-cloud-run.ps1`.
2. **Identity configuration** — CAS validation/service URLs or Microsoft Entra/AD OIDC
   issuer, audience, and JWKS URL. A university identity administrator must register
   the website and mobile redirect URIs.
3. **AMS facade credentials** — read-only API base URL, client ID, and secret with only
   the agreed student-summary scope. The assistant does not connect directly to AMS
   tables.
4. **Model credential** — add `OPENAI_API_KEY` in Google Secret Manager and bind it to
   Cloud Run, or approve a Vertex-hosted answer model. Never place a model key in the
   Flutter app or browser widget.
5. **Approved knowledge** — current fee, registration, course, advising, and support
   documents with canonical URLs, document owners, versions, and approval status.
   Ingestion creates inactive drafts; an owning office must activate them.
6. **Production domains and governance** — final SU website/API domains, privacy and
   retention decisions, DPO/security approval, accessibility testing, and pilot users.

Until items 1–5 are supplied, the public Firebase page intentionally remains a
sample-data preview and does not represent live university policy.
