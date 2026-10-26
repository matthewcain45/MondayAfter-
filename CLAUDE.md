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
- **Admin view:** a private spreadsheet (CSV) export for the owner only. No admin web page.
- **Scenario content:** the owner provides the text and it is added to the project. There is no editing screen, so there is less to attack.
- **Domain:** to be bought through Route 53. The name is not chosen yet.

## Notes from the screens

- See `screens/README.md` for the flow rules, the open decisions and the design tokens.
- The flight recorder (screen 8) holds free text. It is the most sensitive data we store: keep it private to the reader.
- "Share this file" (screen 12) must share a general link, never the reader's personal magic link.
- The screens load fonts from Google Fonts. In the real build, host the fonts ourselves so readers' devices don't contact Google.

## Project status

Early stage: the design is agreed and the setup has been chosen, but no code has been written yet. When the build starts, record here how to run and check the project locally.
