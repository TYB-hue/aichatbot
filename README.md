# Orbit — personal AI chatbot MVP
url: https://orbit-personal-ai-coral.vercel.app/
Next.js App Router, TypeScript, Tailwind CSS, Gemini on the server, and Supabase email/password authentication, database and private file storage.

## What works

- Registration, email confirmation, login and logout.
- New conversations, saved message history and chat deletion.
- PDF, DOCX, TXT, PNG, JPEG and WebP uploads (3 files per turn; 5 MB each).
- Gemini reads PDFs/images directly. Mammoth extracts DOCX text; TXT is decoded as UTF-8.
- Markdown answers without rendering raw HTML.
- Row-level ownership policies for chats/messages; private storage; authenticated server API; database-backed 10-second request throttle.
- Atomic saving of successful user/assistant message pairs. Failed generation leaves the prompt available to retry.

This MVP waits for the completed response; it does not stream tokens. Context includes the most recent 12 messages and at most 3 recent attachments, including the current turn. Older chats remain visible but are not all sent to Gemini. Reattach older documents when needed. Text documents are limited to 80,000 extracted characters. Tables/images embedded in DOCX are not analyzed; export to PDF for visual analysis.

## 1. Rotate the exposed key

Revoke the Gemini key previously pasted in chat in [Google AI Studio](https://aistudio.google.com/apikey), then create a replacement. Never copy the old key into this project. Keep the replacement only in `.env.local` and Vercel environment settings. It must never have a `NEXT_PUBLIC_` prefix.

## 2. Local setup on macOS

Install Node.js **22 LTS or newer supported LTS** from [nodejs.org](https://nodejs.org/). Open Terminal in this project folder:

```sh
npm ci
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLIC_KEY
GEMINI_API_KEY=YOUR_NEW_ROTATED_KEY
GEMINI_MODEL=gemini-3.5-flash
```

The Supabase public anon/publishable key is designed for client use with RLS. **Do not use a service-role or secret key here.** No service-role key is required anywhere in this app. The model is configurable; use a text-and-image/PDF capable model available to your Gemini account.

## 3. Supabase

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. In SQL Editor, paste and run `supabase/schema.sql` once on a fresh project. It creates tables, functions, policies and the private `uploads` bucket.
3. Copy the project URL and public key from project API settings into `.env.local`.
4. Under Authentication → Providers, enable email/password and email confirmation.
5. Under Authentication → URL Configuration, set Site URL to `http://localhost:3000` and add `http://localhost:3000` as an allowed redirect URL.
6. For the email confirmation template, use Supabase's default `{{ .ConfirmationURL }}` link. After confirming, return to the app and sign in. This MVP uses browser-managed Supabase auth, so no SSR callback endpoint is needed.
7. For a personal deployment, register your own account and then disable new user signups in Supabase Auth settings. Anyone you allow to register can consume your Gemini quota. The request throttle is a basic MVP safeguard, not a billing cap. Set provider quotas appropriate to your budget.

Then start:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Register, confirm your email and sign in. If the confirmation email is delayed, check Supabase Auth logs, delivery settings and spam folder. Restart the development server after editing environment variables.

## 4. Verify

```sh
npm run typecheck
npm test
npm run build
```

Live acceptance checks with your own credentials:

1. Ask a text question; refresh and verify the conversation survives.
2. Upload a small PDF, DOCX and TXT; ask for a summary and follow-up details.
3. Upload an image and ask what it contains.
4. Use a second account: the first user's chats, messages and storage objects must be inaccessible, including direct database/storage requests.
5. Try an unsupported extension, >5 MB file, fourth attachment, expired session and rapid second API request. Expect rejection.
6. Delete a chat; verify its associated saved attachments and messages are removed.

Upload contents are sent to Google's Gemini API for analysis. Supabase stores the original files and messages. Review your providers' data policies before uploading sensitive material. Treat uploaded documents as data; the system prompt asks Gemini to ignore instructions embedded in them, but model output still requires judgment.

## 5. Deploy to Vercel

1. Push this folder as a repository to your Git provider. `.env.local` is ignored; do not commit secrets.
2. Import the repository in [Vercel](https://vercel.com/new). Select Next.js. If you pushed a parent directory, set Root Directory to the folder containing this `package.json`.
3. Use a supported Node.js LTS runtime (22 or 24). Vercel detects the build command (`npm run build`).
4. Add all four variables from `.env.example` to Production (and Preview only if you want previews to use that backend).
5. Deploy. In Supabase Auth URL Configuration, change Site URL to your production `https://...vercel.app` domain and add that exact origin to redirect URLs. Keep localhost if you still develop locally. Add your custom domain separately if used.
6. Register/sign in and repeat the upload/history checks on the deployed domain. Environment changes require redeployment.

Uploads go from the browser directly to Supabase, avoiding Vercel's function request payload limit. `/api/chat` receives only text and private file references, downloads files with the user's credentials, and sends them to Gemini. The route uses Node.js and a 60-second maximum duration; check your Vercel plan's function limits. Gemini has a 45-second timeout. Large or complex documents may fail; try a smaller document.

## Structure

- `components/chat.tsx`: authentication and responsive chat UI.
- `app/api/chat/route.ts`: verifies the access token and ownership; prepares history/files; calls Gemini; persists the turn.
- `lib/validation.ts`: request and file/path validation.
- `supabase/schema.sql`: tables, RLS, private bucket and RPCs.
- `.env.example`: placeholder configuration only.

## MVP limitations and recovery

No password-reset screen, streaming, OCR for DOCX, RAG/vector indexing, malware scanning, account deletion or full file-management UI yet. PDF/image file bytes are passed to Gemini; malformed files may produce a provider error. Use this with trusted personal files. Request retries after an ambiguous network interruption can create a duplicate turn; inspect saved history before retrying. Chat deletion removes files before deleting database rows and is not a cross-service transaction: if it fails, retry. If a browser closes mid-upload, an unused object may remain; remove orphaned objects from the private bucket in Supabase's dashboard. Database message history is user-writable through the authenticated RPC and must not be treated as trusted audit data.

The UI safely shows setup instructions when Supabase configuration is missing. A successful build does not prove that external credentials, email delivery, SQL policies or model quota are configured correctly. Live provider checks are required after setup.

Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase client authentication](https://supabase.com/docs/guides/auth/choosing-a-server-package), [Gemini generateContent](https://ai.google.dev/api/generate-content), [Gemini documents](https://ai.google.dev/gemini-api/docs/document-processing), [Vercel function limits](https://vercel.com/docs/functions/limitations).

Gemini availability: on a 503 or 504 response, the server retries once with `GEMINI_FALLBACK_MODEL` (default `gemini-3.1-flash-lite`). Both models receive the same context and files. Each attempt has a 20-second timeout. A transient failure can still occur if both models are unavailable.
