# FaithConnect

FaithConnect is a Christian matchmaking platform for adults seeking meaningful relationships leading to marriage. The product is being developed around faith compatibility, privacy, mutual consent, and member safety for African countries and international communities.

## Current status

The repository now contains the responsive homepage and a server-backed account foundation. Registration, sign-in, email verification, password recovery, cookie sessions, and a protected account landing page are implemented against Supabase Auth. They require a configured Supabase project before they can run. The account landing page deliberately does not collect matchmaking profile details.

The Terms and Privacy pages are clearly marked drafts. They identify outstanding operator, contact, retention, deletion, and jurisdiction details. Complete legal and privacy review before accepting real members or launching publicly.

### Implemented

- Responsive FaithConnect homepage, preserving the green-and-cream brand and African couple photograph.
- Accessible registration, sign-in, email confirmation callback, password recovery, password reset, and sign-out flows.
- Server-side Supabase Auth calls with PKCE cookie sessions. Session cookies are HttpOnly, SameSite=Lax, Secure in production, and use a seven-day idle lifetime that can renew with the provider session; browser code does not read or store access or refresh tokens.
- Server-protected `/account` and `/reset-password` routes, including a server-side email-verification check.
- Server-side input validation, same-origin checks for mutation requests, no-store API responses, rate limits, Helmet security headers, and non-sensitive server error logging.
- Versioned acknowledgement of the current draft Terms and Privacy Notice at registration.
- Explicit notices that profiles, matching, interest requests, messaging, blocking, reporting, and moderation are still unavailable.

### Not implemented

- Matchmaking profiles/preferences and profile visibility controls.
- Recommendations, interest request state transitions, declined-request duplicate prevention, mutual-consent conversations, messaging, blocking, reporting, or moderation.
- Account deletion/export interface, production support contact, finalized legal/privacy terms, custom transactional email delivery, operational monitoring, or deployment configuration.
- Production security certification. This repository has not been tested against a configured Supabase project.

## Architecture and technology choices

- **Node.js 22+ and Express 5** provide a small server for static pages, account endpoints, protected routes, validation, and security middleware without replacing the existing HTML/CSS/JavaScript homepage.
- **Supabase Auth and PostgreSQL** provide managed password handling and email verification alongside a relational database suited to profiles, preferences, interests, conversations, and moderation. Supabase Auth owns credentials; the app never handles plaintext passwords beyond submitting them to Auth over TLS.
- **`@supabase/ssr` and `@supabase/supabase-js`** provide the PKCE cookie session and Auth API integration. All Auth calls are made on the server. No service-role key is used or needed for this account flow.
- **Zod** validates untrusted request data; **Helmet**, **express-rate-limit**, and **cookie-parser** provide lightweight HTTP security, abuse throttling, and cookie parsing.
- Supabase offers a free starting plan, which can suit early development; check its current quotas, project pause behavior, email limits, data location, and paid requirements before relying on it. Production use also needs a configured SMTP provider. [Supabase pricing](https://supabase.com/pricing) · [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

Supabase’s SSR guidance recommends cookie-backed sessions and warns that session reads alone are not an authorization check. This server calls `auth.getUser()` before serving account data. Future database tables must use least-privilege grants and row-level security (RLS), including explicit tests. [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side) · [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Project structure

```text
.
├── assets/images/                  # Existing FaithConnect hero photographs
├── src/
│   ├── css/styles.css              # Homepage and shared styles
│   ├── css/auth.css                # Account and policy page styles
│   ├── js/app.js                   # Homepage navigation interactions
│   ├── js/auth.js                  # Accessible account forms; no token storage
│   ├── pages/                      # Account and draft policy pages
│   └── server/validation.js        # Server-side Zod schemas
├── tests/
│   ├── test_static_site.py         # Python static/source smoke checks
│   └── validation.test.js          # Node validation unit tests
├── server.js                       # Express app and Supabase Auth endpoints
├── package.json
├── .env.example
└── index.html
```

## Environment setup

Requirements: Node.js 22 or later, npm, and a Supabase project. No credentials are committed.

1. Create a Supabase project, then copy `.env.example` to `.env`. The homepage can also run without these provider values; registration requests return a clear unavailable response until they are set.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `PUBLIC_APP_URL`. Use the project URL and publishable key from Supabase project settings. Do not add a secret/service-role key to this application.
3. Set `PUBLIC_APP_URL=http://localhost:8000` for local development, and add `<http://localhost:8000/auth/callback>` to Supabase’s allowed redirect URLs.
4. Enable email/password sign-in and require email confirmation in Supabase Auth. Configure SMTP before real use; the provider’s trial email service is rate-limited and best-effort.
5. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

6. Open <http://localhost:8000/>. Registration, sign-in, password recovery, and account pages are served by Express; Python’s `http.server` is only suitable for viewing the static homepage and cannot run authentication.

In production, set `NODE_ENV=production`, use an HTTPS `PUBLIC_APP_URL`, configure trusted proxy behavior for the actual host, and review cookies, SMTP, rate limits, logging, backup, and monitoring settings.

## Authentication behavior

- Registration requires a name, email, a password of at least 12 characters, an 18+ confirmation, and agreement to the versioned Terms and Privacy Notice.
- Supabase Auth controls duplicate identities and password hashing. Registration responses do not confirm whether an email is already registered.
- Email confirmation must be enabled in the Supabase project. Sign-in and protected account routes independently require `email_confirmed_at`.
- Sign-in, sign-out, and password recovery go through Express. Sessions are stored in HttpOnly cookies; the frontend does not use `localStorage` or `sessionStorage` for credentials.
- Mutation requests require the configured same-origin `Origin`; authentication and recovery requests have rate limits. Recovery responses do not disclose whether the email exists.
- The account page currently only confirms the verified account and explains that profile setup is not ready.

The code has not yet been exercised against an actual Supabase project. SMTP delivery, duplicate identity behavior, cookie refresh, callback redirects, sign-out revocation, and provider rate limits require the environment setup above and integration checks.

## Data protection and matchmaking rules

Only basic account details are collected at this stage. Faith, denomination, location, preferences, photos, and messages are not collected. These can be sensitive personal information and need a reviewed schema, privacy controls, retention rules, and security tests before collection.

The planned backend milestones must enforce these decisions in PostgreSQL/server authorization, not only in the interface:

- Members control profile visibility and matching preferences; recommendations include only eligible members.
- Interest requests have a server-enforced state and duplicate prevention. A recipient can accept, decline, or leave a request unanswered. A declined request cannot be resent by the same sender.
- A conversation exists only after mutual consent. Either member can end it; a block prevents future prohibited contact and restricts message access at the database/server level.
- Members can block and report; moderators have separately authorized access and auditable moderation actions.
- Private profile fields and conversations are inaccessible to other members without explicit authorization. Every exposed table must have least-privilege grants and tested RLS policies. Never use a service-role key in browser code.

## Development and tests

```bash
npm test                 # Node unit tests for request validation
npm run test:static      # Python static/source smoke checks
```

This checkout does not currently have Node.js/npm or a Supabase project configured, so those commands cannot be executed here. The dependency-free checks can run with Python 3:

```bash
python3 -m unittest discover -s tests -v
```

That Python suite checks static links/assets, page semantics, account form controls, and security-related source wiring; it does not execute Express or authenticate against Supabase. Before release, add and run integration tests for valid/invalid/duplicate registration, verified and unverified sign-in, password recovery, sign-out/session refresh, protected routes, authorization, and RLS using separate test accounts. Also test the homepage and auth pages at desktop, tablet, and mobile sizes in a real browser.

## Known limitations and next milestone

- No Supabase project URL/key, SMTP sender, production hostname, support contact, or region has been provided. Auth code is implemented, but real account operations remain unavailable until the project URL/key and email settings are configured.
- The local environment has no Node.js/npm and no browser testing tool available, so the Express server, responsive browser layouts, and provider flows remain unverified here.
- The Terms and Privacy Notice are draft operational text and do not replace jurisdiction-specific legal review. Registration should not be opened publicly until the notices and account deletion/support process are complete.
- This directory currently has no initialized Git repository/history; no commit or push was made.

Next milestone: configure a Supabase development project and SMTP, execute the auth integration tests, then design the private profile schema and test visibility/authorization rules before collecting faith or matchmaking information.
