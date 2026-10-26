# The Monday After

## What this project is

"The Monday After" is a free, monthly, email-delivered resilience scenario for aspiring CIOs.

Each month:

1. A subscriber receives an email describing a scenario (something has gone wrong, or is about to).
2. They click a link from the email into a **mobile-first web page**.
3. They **make decisions** about how to respond.
4. The page **reveals the hidden assumptions** behind each choice — what they took for granted without realising.
5. They get a **"ledger"** showing how their decisions affected the organisation's fitness (its ability to absorb and recover from the shock).

## Design reference

- The screens in `/screens` are the design reference. Match their layout, wording, tone and flow before inventing anything new.
- If something isn't covered by the screens, ask rather than guess, and suggest an option that fits the existing style.
- Design for phones first (most people will arrive from an email on their phone), then make sure it still works on a larger screen.
- Keep pages light and fast: readers may be on a train or a weak mobile signal.
- Make it accessible: readable text sizes, good colour contrast, works with screen readers and without a mouse.

## Who you're working with

The project owner is **not a developer**. So:

- **Explain choices in plain English.** Say what you're doing and why, without jargon. If a technical term can't be avoided, explain it in a sentence.
- When there are options, give a short recommendation and the trade-off in everyday terms (for example: "simpler to maintain, but costs about £X a month").
- Before finishing a piece of work, summarise what changed and how to check it, in non-technical language.
- Prefer simple, well-known tools over clever or niche ones, so the project stays easy to understand and hand over.

## Rules — always follow these

### Ask first before:

- **Running any deployment command** (anything that puts the site, emails or data live, or changes a hosting service).
- **Installing global software** (anything installed system-wide rather than inside this project folder).
- **Touching credentials** — passwords, API keys, tokens, `.env` files, account settings, or anything secret. Never commit secrets to the repository.
- **Making any choice that affects cost, privacy or security** — for example picking a hosting provider, email service, analytics tool, database, or paid plan; adding a third-party script; or changing what data is stored or who can see it.

When asking, explain the choice in plain English, give a recommendation, and say what it would cost or risk.

### Data and privacy

- **Collect the minimum data needed.** If the product works without a piece of information, don't collect it. Default to anonymous where possible (for example, the ledger should not need to know who the reader is).
- No tracking pixels, third-party analytics or advertising scripts without explicit approval.
- Don't store data for longer than it's needed, and be ready to explain where any data lives and how someone could have it deleted.
- **Never use real personal data in tests.** Use clearly fake names and addresses (for example `test.user@example.com`, "Alex Example").

### General working practice

- Keep changes small and focused; explain each one.
- Don't add features, services or dependencies that weren't asked for — suggest them instead.
- Before adding a new library or service, say what it does, why it's needed, and whether it has any cost or privacy implications.

## Decisions made so far

Agreed with the project owner. Changing any of these is an "ask first" decision.

- **Everything on AWS, serverless**, in the London region (`eu-west-2`). No servers to manage.
  - Web pages: S3 + CloudFront
  - Saving answers: Lambda behind API Gateway
  - Storing subscribers and answers: DynamoDB
  - Sending email: Amazon SES
  - Infrastructure written as code (AWS CDK) rather than clicked together in the console
- **Scale:** up to about 50 users. Keep running costs as close to zero as possible, and set a spending alert.
- **Sign-up:** a sign-up form on a web page (needs email confirmation and spam protection).
- **Magic link:** the link in each email is unique to one subscriber and one scenario. It can't be guessed, it expires, and only a scrambled version is stored. The screens promise "No login".
- **Answers are linked to subscribers** so we can send them reports later. Subscriber emails are stored apart from answers, which use an internal ID.
- **Readers can change their answers.** Store only the latest choice, not the history.
- **Keep data for 2 years**, then delete it. Unsubscribing and deletion on request must work.
- **Admin view:** a private spreadsheet (CSV) export for the owner only. No admin web page. There is a named version (with emails) and an anonymous version.
- **Flight recorder text is private to the reader.** Never include it in an export, a log or the analytics. Store it encrypted with its own key, which only the "send it back to the reader" code may use. The key is a customer-managed AWS KMS key (about $1 a month, approved). In the first version the reader requests it with "Email me my flight recorder". The forecast *is* visible to the owner.
- **Analytics are measured inside the app** (screen reached, decision locked, thread pulled, file closed), stored with the reader's internal ID. No cookies, no third-party analytics and no email open tracking. Click-through comes from people opening their link.
- **Spam protection:** the "confirm your email" step, a hidden trap field, and limits on how often someone can submit. No CAPTCHA unless agreed.
- **The sign-up page is open to anyone before launch** (owner's decision, 26 October 2026). People who sign up early are stored in the test copy.
- **The API only accepts requests that came through CloudFront.** CloudFront adds an `X-TMA-Origin` marker (the stack's own unique ID); `backend/src/edge.ts` checks it and reads the visitor's real address from `CloudFront-Viewer-Address`.
- **Building tools** (CDK, test tools) are installed inside the project folder only. See `docs/build-plan.md` for the approved plan.
- **Scenario content:** the owner provides the text and it is added to the project. There is no editing screen, so there is less to attack.
- **Web address:** `themondayafter.capstoneglobaladvisory.com`, a subdomain of the owner's existing business domain.
  - The domain's DNS is managed in **Squarespace**, which also connects the business's **Google Workspace** email. The main business website is a separate S3 site.
  - **Only ever add DNS records. Never change or delete existing ones**, especially the email records (MX, SPF, DKIM, DMARC). Every DNS change is "ask first". Give the owner exact step-by-step instructions, because they add the records in Squarespace themselves.
  - Never modify the existing business website or its S3 bucket.
- **Email:** sent through SES from `themondayafter@capstoneglobaladvisory.com`, with replies going to the owner's Google Workspace inbox. The bounce ("MAIL FROM") subdomain is `tma-mail.capstoneglobaladvisory.com`, so the main domain's existing SPF record never needs editing. (`mail.` was avoided in case Google Workspace already uses it.) The domain identity lives in its own `TheMondayAfter-email` stack (`infra/lib/email-stack.ts`), which is shared by every copy. The Deploy summary lists the DNS records to add, and `docs/phase-4-email.md` has the owner's steps.
- **AWS account:** a separate AWS account just for The Monday After, linked to the owner's existing account through AWS Organizations so there is one bill. Never touch the main account's resources.
- **Sending address:** `themondayafter@capstoneglobaladvisory.com` doesn't exist yet. Recommended: create it as a free alias in Google Workspace.
- **DMARC:** the owner found no `_dmarc` record in Squarespace. **Approved:** add `_dmarc` TXT `v=DMARC1; p=none` (monitor only, blocks nothing) during Phase 4, alongside the other new records. Tightening it later is a separate decision.
- **Data controller:** Capstone Global Advisory. The privacy notice must name the business.

## Notes from the screens

- See `screens/README.md` for the flow rules, the open decisions and the design tokens.
- The flight recorder (screen 8) holds free text. It is the most sensitive data we store: keep it private to the reader.
- "Share this file" (screen 12) must share a general link, never the reader's personal magic link.
- The screens load fonts from Google Fonts. In the real build, host the fonts ourselves so readers' devices don't contact Google.

## Project status

**Phases 1–4 are done. Phase 5 is in progress:** the security review is written up in `docs/security-review.md`, with one fix made and decisions A–D waiting for the owner. Phase 3: the test copy is deployed to AWS (first green deploy on 26 October 2026) at a temporary CloudFront address. The owner is now testing it (`docs/phase-3-deploy.md`, Parts C–D).
- **The email part of Phase 4 is done.** The domain is verified in SES with DKIM, the `tma-mail` bounce subdomain and monitor-only DMARC, added by the owner in Squarespace on 26 October 2026, and emails now arrive. **The web address is live on the test copy** (`https://themondayafter.capstoneglobaladvisory.com`, certificate issued and CNAME added on 26 October 2026). **SES is out of the sandbox** (production access granted on 26 October 2026), so it can now email any address. **Phase 4 is complete.**
- **Promise made to AWS in the production access request:** double opt-in, an unsubscribe/pause/delete link in every email, reliance on the SES account-level suppression list, and **reviewing bounce and complaint rates before each monthly send**. Keep these true. Phase 6 should make the bounce and complaint check easy for the owner.
- **Web address mechanics:**
  - The padlock certificate is requested in `us-east-1` (CloudFront's rule) by the **Request web address certificate** button (`certificate.yml`), outside CDK, because a certificate can't be issued until the owner adds its DNS record.
  - Deploy looks for an issued certificate and passes it in (`-c certificateArn=…`). With one, the test copy uses the web address; without one, it keeps the CloudFront address.
  - **The web address is currently on the test copy.** When a separate live copy is created (Phase 6), the address must move to it, before any readers arrive.
- GitHub identifies this project to AWS as `matthewcain45@348284796/MondayAfter-@1434344225` (permanent IDs). The deploy role's trust setting matches that.

### Deploying (GitHub buttons, agreed with the owner)

- Deployments run only from the owner's GitHub buttons in the Actions tab:
  - **Deploy test copy**: runs every check first, then deploys.
  - **Send Incident File**: needs `SEND` typed to confirm.
  - **Export spreadsheets**: files go to a private S3 bucket and delete themselves after 7 days. They never pass through GitHub.
- GitHub gets short-lived access through the `tma-github-deploy` role (`infra/github-deploy-role.yaml`, created once by the owner in CloudFormation). It is limited to this repository and its working branch. There are no stored AWS keys. **Never run deploy commands from a Claude session**, and never add AWS keys anywhere.
- The `AWS_DEPLOY_ROLE_ARN` repository variable holds the role's address. It isn't a secret.

### How the code is laid out

- `site/`: the website, made of plain HTML, CSS and JavaScript with no framework and no build step.
  - `index.html` with `js/app.js`: the scenario app. It runs in **live** mode when opened from a personal link (`#t=TOKEN`) and saves to the backend. It runs in **preview** mode with `?preview`, or where there's no `tma-api` meta tag, and keeps answers in the browser only.
  - `signup.html`, `confirm.html`, `manage.html` with `js/pages.js`: sign-up (the designed "front door" page), confirming, and the manage page (take a 3-month break, resume, unsubscribe or delete). Paused readers are skipped by Send Incident File until their pause ends.
  - `privacy.html`: a draft, to be finished in Phase 5.
  - `scenarios/<id>.json`: **all the words and rules for one month's scenario.** A new month means a new file, plus one import line in `backend/src/scenarios.ts`. Copy the author hasn't written yet is marked `{ "todo": "..." }` and shows on screen as "Copy needed". The list of gaps is in `docs/copy-needed.md`.
  - `fonts/`: IBM Plex, hosted by us so readers' devices never contact Google.
  - `preview/email.html`: a mock of the email, for previews only.
- `backend/`: the saving code, in TypeScript. Node 22 runs it directly, with no build step for tests.
  - `src/service.ts`: what the backend does. `src/validate.ts`: strict checks on everything readers send. `src/http.ts`: the web routes. `src/export.ts`: the owner's spreadsheets.
  - `src/adapters/aws.ts`: the real DynamoDB, KMS and SES connections. `src/adapters/memory.ts`: stand-ins for tests and the local preview.
  - `src/lambda.ts`: the two AWS Lambda entry points. `api` can lock flight recorders but not unlock them. `recorderMailer` is the only code that can unlock one, and it only sends it to the reader's own email.
  - `src/config.ts`: link lifetimes, submission limits and retention. Changing these is an "ask first" decision.
- `infra/`: the AWS setup as code (CDK). `lib/stack.ts` describes one copy of the system, `lib/email-stack.ts` covers sending as the domain, `bin/app.ts` lists the stacks (`TheMondayAfter-email`, `TheMondayAfter-test`), and `test/stack.test.ts` checks the security rules (for example, that only the recorder mailer can decrypt).
- `.github/workflows/`: the buttons (`deploy.yml`, `send-file.yml`, `export.yml`, `certificate.yml`).
- `scripts/`: `preview.mjs` (local preview with the real backend code) and `check-scenario.mjs` (lists copy still needed and checks the rules are valid).

### How to run and check it locally

- Tests: `npm ci --prefix backend && npm test --prefix backend`. AWS setup checks: `npm ci --prefix infra && npm test --prefix infra`. Typecheck either with `npm run typecheck --prefix <folder>`.
- Build the AWS template without deploying: `cd infra && CDK_DEFAULT_ACCOUNT=111111111111 npx cdk synth --quiet`. The account number is a dummy, so nothing touches AWS.
- Preview: `node scripts/preview.mjs`, then open `http://localhost:8080/signup.html`. Sign up with a fake address such as `test.user@example.com`. The pretend emails appear at `http://localhost:8080/dev/`, with links to confirm. `/dev/send-file` sends Incident File 01, and `/dev/export` shows the spreadsheets. The `/dev/` pages exist only in the local preview and are never deployed.
- Phone-style preview without the backend: `http://localhost:8080/preview/email.html`.
- Copy check: `node scripts/check-scenario.mjs incident-file-01`

### Rules for the code

- Put scenario text and reader input into pages as text only. Never use `innerHTML` with them.
- Personal links travel in the `#t=` part of the address, which browsers don't send to servers. They are removed from the address bar straight away, and are sent to the backend only in the `X-TMA-Link` header. Never put them in query strings or logs.
- "Share this file" shares a general link, never the reader's personal link.
- Flight recorder text goes only to `PUT /api/file/recorder`, and is encrypted there. Never put it in saved state, `track()`, logs or exports. The browser doesn't keep it in live mode.
- Never log request bodies, email addresses or tokens.
