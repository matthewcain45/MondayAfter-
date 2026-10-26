# Build plan: The Monday After (first version)

Status: **approved by the owner, with the amendments below.** Phases 1 and 2 are built and tested locally. Phase 3 is next and needs the owner's OK to deploy.

## What the first version includes

- The full Incident File 01 journey from `/screens`: the 12 main screens, plus the 5 optional threads.
- A sign-up page, with a "confirm your email" step.
- A personal magic link in each email. No passwords and no login.
- Saving answers, with each reader able to change them. Only the latest choice is kept.
- An opt-in follow-up email 30 days later (screen 11).
- Unsubscribe and "delete my data", and automatic deletion after 2 years.
- A private spreadsheet (CSV) export for the owner.

## Where the data lives and what the owner sees

- **Storage:** DynamoDB in the new AWS account, in London. It holds a **Subscribers** table (internal ID, email, sign-up and confirmation dates, unsubscribe status, 30-day opt-in) and a separate **Answers** table (subscriber ID, scenario, question, latest answer, time).
- **Owner's export:** a spreadsheet (CSV) with one row per person per question, including their email, so the owner can see who answered what. There is also an **anonymous version** (IDs only, no emails) for looking at patterns.
- **Forecast (screen 9):** included in the owner's export.
- **Flight recorder (screen 8): private to the reader.**
  - It is never included in any export, and the owner can't read it.
  - It is stored encrypted, with its own key. Only the part of the system that sends it back to the reader may use that key.
  - Every use of the key is logged.
  - The screen wording must say plainly that the author can't see it.
  - Honest limit: whoever controls the AWS account could, in theory, change the system to read it. The log would show that.

## Analytics (measured inside the app; no third-party tools)

- The app records simple events against the reader's internal ID, such as "reached this screen", "locked this decision", "pulled this thread" and "closed the file". It uses no cookies and no outside services.
- Email delivery, bounces and complaints come from SES.
- **Email opens are not tracked** (no tracking pixels). Click-through is measured from people opening their personal link.
- **Owner's summary per scenario:**
  - sent, delivered, clicked (click-through rate)
  - how many completed each step, and where people drop out
  - completion rate
  - threads pulled and time per screen
  - "take one thing back" actions set, and whether people reported doing them at 30 days
  - unsubscribes after each issue
  - sign-up confirmation rate
- Analytics data follows the same 2-year deletion rule and is mentioned in the privacy notice.

**Not in the first version** (suggested for later): reports emailed to subscribers, replaying a past file and comparing against your flight recorder, and a web page for editing scenarios.

## How it's built, in plain English

- **Pages:** plain HTML, CSS and a small amount of JavaScript, with no framework. This keeps pages tiny and fast on a weak phone signal, and easy for someone else to pick up later.
- **Scenario content:** each month's text and choices live in one data file per scenario. Adding a new month means adding a new file, not changing the code.
- **Saving answers:** small pieces of code on AWS Lambda, written in TypeScript (JavaScript with extra checks that catch mistakes early).
- **The setup recipe:** written with AWS CDK, so every AWS piece is described in files you can see and review.

## Phases

Each phase ends with something you can check. Anything that puts something live, changes DNS or costs money waits for your OK.

### Phase 0: Accounts and safety nets (you, with my step-by-step guidance)

1. Create the separate AWS account for The Monday After, linked to your existing one through AWS Organizations.
2. Turn on two-factor sign-in (MFA) for it.
3. Set a **spending alert** at about £5 a month.
4. Set up safe access for building through AWS IAM Identity Center: short-lived sign-ins, with no permanent keys stored anywhere.
5. Create `themondayafter@capstoneglobaladvisory.com` as an alias in Google Workspace.

### Phase 1: The pages, working on your own screen (no AWS)

- Build the screens from the designs, including the decisions, reveals, threads, flags, flight recorder, forecast, ledger and "take one thing back".
- Host the fonts ourselves instead of loading them from Google.
- Answers are saved only in the browser for now, with made-up test data.
- **You check:** I share a preview, and you click through it on your phone.

### Phase 2: Saving answers and sign-up (still no AWS). Done

Choices made in Phase 2, for the owner to confirm:
- **How long links last:** the confirm link 24 hours, the monthly file link 90 days, and the unsubscribe or delete link 2 years.
- Unconfirmed sign-ups are deleted after 7 days.
- Opening a file restarts the reader's 2-year retention clock.
- **Unsubscribing stops the emails but keeps past answers**, which are deleted after 2 years. "Delete my data" removes everything immediately.
- A saved flight recorder isn't shown again in the app. Readers get it back by email.
- **Email delivery figures** (sent, delivered, bounced) come from SES once sending is built in Phase 6. The summary spreadsheet starts from "opened their link".
- The export runs locally for now. How the owner downloads it on AWS is settled in Phase 3.

- The code for sign-up, confirming an email, opening a magic link, saving and changing answers, unsubscribing, deleting data, and the CSV export.
- Security built in:
  - Magic links can't be guessed, they expire, and they are stored only in scrambled form.
  - Every input is checked.
  - Limits on how often someone can submit.
  - Each piece of code can reach only what it needs.
- Automated tests using fake people only (for example "Alex Example").
- **You check:** I explain the test results.

### Phase 3: A test copy on AWS (needs your OK to deploy). Written, ready for the owner's Deploy button

Steps for the owner: `docs/phase-3-deploy.md`. Deploys run from GitHub buttons with short-lived access (no stored keys). A basic "Send Incident File" button (plain-text email) was added so the test copy can be tried end to end. Phase 6 replaces it with the designed email.

- Use the setup recipe to create a **test copy** in London (`eu-west-2`) in the new account.
- It isn't on your domain yet; it uses a temporary AWS address.
- **You check:** sign up with your own email, and go through the scenario on your phone.

### Phase 4: Your address and email (you add the DNS records in Squarespace)

The **email part was brought forward** on 26 October 2026, because Google held the test emails. Steps: `docs/phase-4-email.md`. The bounce subdomain is `tma-mail`. The web address part (and lifting the SES sandbox) follows later.

- About 8 **new** DNS records:
  - 1 for the website
  - 1 for the HTTPS certificate
  - 3 for email signing (DKIM)
  - 2 for the `mail.` sending address
  - 1 DMARC record in monitor-only mode (`p=none`), approved by the owner
- No existing record is changed.
- Ask AWS to take SES out of "sandbox" mode so it can email any subscriber.
- **You check:** `themondayafter.capstoneglobaladvisory.com` loads with a padlock, and a test email arrives in your inbox (not spam), sent from the new address.

### Phase 5: Privacy and launch checks

- A privacy notice naming Capstone Global Advisory, linked from the sign-up page and from every email.
- Check that unsubscribe, "delete my data" and 2-year deletion work.
- A security review of the whole thing.
- A trial with you and, if you like, one or two people who have agreed to help.

### Phase 6: Sending Incident File 01 (needs your OK each time)

- A simple command that sends that month's email to confirmed subscribers, each with their own link. I run it only when you say so.
- The 30-day follow-up emails go out automatically, only to people who ticked the box.

## Expected running cost (about 50 subscribers)

| Item | Expected cost |
|---|---|
| Web pages (S3 + CloudFront) | Likely within AWS's free allowance |
| Saving answers (Lambda, API Gateway, DynamoDB) | Likely within AWS's free allowance, or pennies |
| Email (SES) | Around $0.10 per 1,000 emails, so pennies |
| HTTPS certificate | Free |
| Domain and DNS | Nothing extra (Squarespace, already paid) |
| Flight recorder encryption key (KMS) | About $1 a month |
| **Total** | **About £1–£2 a month** |

These are estimates; prices will be confirmed before anything is switched on. The spending alert is the safety net.

## Decisions made

1. The plan and scope are approved.
2. **Spam protection:** only free, built-in measures:
   - the "confirm your email" step
   - a hidden trap field
   - limits on how often someone can submit

   A CAPTCHA is considered only if bots get through.
3. The 30-day follow-up stays as an opt-in tick. "First hour" stays required in the flight recorder. The scenario wording still needs the owner's final review before launch.
4. Building tools are installed inside this project folder only.
5. Analytics are measured inside the app, and email opens are not tracked.

6. **The flight recorder's encryption key** (AWS KMS, about $1 a month) is approved. The expected total is now about £1–£2 a month.
7. **The flight recorder is sent back on request:** the reader taps "Email me my flight recorder". Sending it in the 30-day follow-up may come later.
