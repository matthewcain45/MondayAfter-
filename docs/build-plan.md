# Build plan: The Monday After (first version)

Status: **draft, awaiting the owner's approval.** No code has been written yet.

## What the first version includes

- The full Incident File 01 journey from `/screens`: the 12 main screens, plus the 5 optional threads.
- A sign-up page, with a "confirm your email" step.
- A personal magic link in each email. No passwords and no login.
- Saving answers, with each reader able to change them. Only the latest choice is kept.
- An opt-in follow-up email 30 days later (screen 11).
- Unsubscribe and "delete my data", and automatic deletion after 2 years.
- A private spreadsheet (CSV) export for the owner.

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

### Phase 2: Saving answers and sign-up (still no AWS)

- The code for sign-up, confirming an email, opening a magic link, saving and changing answers, unsubscribing, deleting data, and the CSV export.
- Security built in:
  - Magic links can't be guessed, they expire, and they are stored only in scrambled form.
  - Every input is checked.
  - Limits on how often someone can submit.
  - Each piece of code can reach only what it needs.
- Automated tests using fake people only (for example "Alex Example").
- **You check:** I explain the test results.

### Phase 3: A test copy on AWS (needs your OK to deploy)

- Use the setup recipe to create a **test copy** in London (`eu-west-2`) in the new account.
- It isn't on your domain yet; it uses a temporary AWS address.
- **You check:** sign up with your own email, and go through the scenario on your phone.

### Phase 4: Your address and email (you add the DNS records in Squarespace)

- About 7 **new** DNS records:
  - 1 for the website
  - 1 for the HTTPS certificate
  - 3 for email signing (DKIM)
  - 2 for the `mail.` sending address
- No existing record is changed.
- Confirm your existing DMARC setting is compatible. With email signing set up correctly, it should be.
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
| **Total** | **Probably under £1 a month** |

These are estimates; prices will be confirmed before anything is switched on. The spending alert is the safety net.

## Decisions needed before building

1. **Approve this plan and scope**, including what's left for later.
2. **Spam protection on the sign-up form.** Recommended: free, built-in measures that send no data to anyone else:
   - the "confirm your email" step
   - a hidden trap field that bots fill in and people don't
   - limits on how often someone can submit

   A CAPTCHA can be added later if bots get through. Cloudflare's is free but sends visitor data to Cloudflare; AWS's costs about $5 or more a month.
3. **Open questions from `screens/README.md`:**
   - Should the 30-day follow-up stay as an opt-in tick? Recommended: yes.
   - Should "first hour" be required in the flight recorder? Recommended: yes, as designed.
   - The scenario wording needs your final review before launch.
4. **Installing project tools:** the CDK and the other building tools would be installed **inside this project folder only**, not system-wide. Do you approve?
