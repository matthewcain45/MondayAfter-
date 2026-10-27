# Security review: The Monday After (Phase 5, 26 October 2026)

**Scope:** the whole system as it stands:
- the website and app
- the backend code
- the AWS setup
- the GitHub buttons
- the email setup and the accounts around them

**Not in scope:** the penetration test (later in Phase 5) and a legal or data-protection review (needs a professional).

**Overall:** the design is sound, with no serious holes. There was one real fault, now fixed. A few improvements need your decision, and a few checks are only things you can do.

---

## Fixed in this review

### 1. Sign-up limits were counting the wrong address (medium)
**What was wrong:** the limit on sign-ups per internet connection was reading the address of AWS's delivery network, not the visitor's. Many genuine readers could share one, and block each other, while an attacker wasn't really limited.

**Fix:**
- The backend now reads the visitor's real address, which CloudFront passes on.
- The backend now **refuses any request that didn't come through CloudFront.** CloudFront adds a secret marker, generated inside your AWS account, so there's nothing to store and no cost. This also stops anyone going round CloudFront's protections.
- Tests cover both.

**Takes effect** after the next Deploy. During that deploy, the site's saving may refuse requests for a minute or two while CloudFront catches up. That's fine on the test copy.

---

## Your decisions: all approved and built (26 October 2026)

- **A, cap on sign-ups:** done. At most 30 confirmation emails an hour across everyone. Beyond that, people see "We're getting a lot of sign-ups right now. Please try again in an hour."
- **B, narrower GitHub access:** done in `infra/github-deploy-role.yaml`, but **you need to update the stack** (steps below). The buttons can now only:
  - deploy through AWS CDK's own deployment roles
  - request and look up the certificate
  - start Send and Export
  - read the export bucket's name

  The Deploy button no longer re-prepares ("bootstraps") the account. That was a first-time job.
- **C, backups:** done for the test copy as well, since early sign-ups land there. Every table except the throwaway rate-limit counters can be restored to any moment in the last 35 days. Cost: well under 1p a month at this size.
- **D, "page not found" page:** done (`site/404.html`). Because CloudFront shows it for every "not found", the backend no longer uses that code for messages readers need. "No saved flight recorder" now uses a different code.

### Your steps, in this order
1. **Press Deploy** (with the old, broad permissions). This brings in the CloudFront fix and A, C and D.
2. **Update the trust stack:**
   - Download the new `infra/github-deploy-role.yaml` from GitHub.
   - In the Monday After account (London), open **CloudFormation**, then **tma-github-deploy**, then **Update**.
   - Choose **Replace existing template**, then **Upload a template file**, and pick the downloaded file.
   - Keep both settings as they are, tick the IAM acknowledgement, and **Submit**.
3. **Prove it still works:** press **Deploy** again, then **Request web address certificate** (it should say "issued"), then **Export spreadsheets**. If any goes red with "not authorized", send me the message and I'll add just that permission.

### Original options

| # | What | Recommendation | Cost |
|---|---|---|---|
| A | **A cap on confirmation emails across everyone,** for example 30 an hour. It stops someone using the sign-up form to send confirmation emails to thousands of strangers ("subscription bombing"), which would damage your sending reputation with AWS. Today's limits are per address and per connection, and a determined attacker can spread out. | Yes, before launch. | None |
| B | **Narrow GitHub's access to AWS.** The Deploy role has full administrator rights inside the Monday After account, which the first build needed. It can now be cut down to "deploy this system, request the certificate, send, export". You'd update the `tma-github-deploy` stack in CloudFormation with a new template I'd write. | Yes, before launch. | None |
| C | **Backups for the live copy** (DynamoDB "point-in-time recovery"). This lets you restore any moment from the last 35 days if data is lost or damaged by mistake. | Yes, on the live copy in Phase 6. Not needed on the test copy. | Pennies a month at this size |
| D | **A friendly "page not found" page.** At the moment a mistyped address shows a bare AWS error. It reveals nothing sensitive, just looks rough. | Optional, low priority. | None |

---

## Things only you can check

1. **GitHub two-factor sign-in.** Whoever can push code to this project can change what Deploy does. Check that your GitHub account has two-factor sign-in on (**Settings**, then **Password and authentication**), and that nobody else has write access (the project's **Settings**, then **Collaborators**).
2. **The root user of your main AWS account** stays locked away with its two-factor device. Ideally use the access portal day to day.
3. **Decision noted: the sign-up page is open to anyone before launch.** You've decided that's fine. Two consequences to keep in mind:
   - Anyone who signs up now is stored in the **test copy**. When we build the live copy in Phase 6, we'll either move them across or make the test copy the live one. I'll ask then.
   - The privacy notice is still a draft, and the data protection read-through hasn't happened yet, so early sign-ups get the draft wording.

---

## Later, already planned

- **One-click unsubscribe headers in emails** (the standard Gmail and Yahoo expect from newsletters): Phase 6, with the designed email.
- **An easy bounce and complaint check before each send**, which you promised AWS: Phase 6.
- **The penetration test**: Phase 5, after A, B and the fix above are deployed.

---

## Checked and fine

- **Magic links:** 32 random bytes, so they can't be guessed. Only a scrambled version is stored. Each one expires, works for one purpose only, and is limited in how often it can be used. Links travel in the `#` part of the address and are removed from the address bar straight away. They're sent to the backend in a header, never in an address or a log.
- **Email scanners can't act for readers.** Confirming, pausing, unsubscribing and deleting all need the page's own button press, so a mail scanner that "clicks" links can't confirm or unsubscribe anyone.
- **Flight recorder:**
  - It's encrypted with its own key.
  - The part that saves it can't unlock it.
  - It's only ever emailed to the reader's own address.
  - It's never shown in the browser again, never in logs or exports.
  - A forwarded email link can't reveal it.

  The honest limit: an AWS administrator could deliberately change the system to read it, and AWS's records would show that.
- **Forwarded emails:** anyone holding a forwarded email can do what the email allows (play the file, pause, unsubscribe or delete). That's the normal trade-off for a no-login design. The manage page never shows the reader's email address.
- **Everything readers send is checked strictly** against the scenario's real choices, with size limits. Nothing else is stored.
- **Pages can't be hijacked:**
  - All text goes onto the page as plain text.
  - Strict browser rules allow only our own scripts, block embedding in other sites, and send no referrer.
  - Secure connections are forced.
- **Storage:**
  - All buckets are private and secure-connection-only.
  - Exports delete themselves after 7 days and never pass through GitHub.
  - Every record expires after 2 years.
- **Least privilege:**
  - Each part of the backend can only touch what it needs.
  - Automated tests check that the API can't unlock recorders, and that the export and sender can't read them.
- **Logs** hold errors and short security notes (see below): no request bodies, email addresses, links or internet addresses.
- **Libraries:** `npm audit` found no known vulnerabilities, and every version is pinned.
- **No secrets in the project:** a scan found no keys or passwords. GitHub reaches AWS with short-lived passes tied to this project's permanent IDs and branch.
- **Email:** the domain signs every email (DKIM), the bounce address is set up, DMARC is in monitor mode, and sign-ups need confirming.

## AWS Continuum code review (27 October 2026)

Four findings, all accepted by the owner and fixed.

1. **Odd saved data caused a crash (low).**
   - What was happening: a signed-in reader could send strange data that produced "Something went wrong" instead of a polite refusal. Examples were a thread called `constructor`, a date in the year 275,760, or data nested too deeply to measure.
   - Fixed by:
     - checking thread names against the real list
     - accepting only normal-format dates between 2020 and 2100
     - checking that take-back items and flags exist in the scenario
     - treating unmeasurable data as too big
     - making the follow-up date calculation unable to fail
2. **Sign-up limits could be dodged to flood one inbox.**
   - What was happening: the limits counted `alex+1@…`, `alex+2@…` and dotted Gmail addresses separately, and each IPv6 address separately.
   - Fixed by:
     - counting all variations of an address as one for the limit
     - counting a whole IPv6 block (`/64`, usually one home or phone) as one visitor
   - Unchanged: IPv4 addresses are still counted one by one, so an office isn't lumped together. The address is still stored and emailed exactly as typed. If a victim marks a confirmation email as spam, the SES account-level suppression list stops further mail to them.
3. **No record of security events (findings 3 and 4).**
   - What was added: short security notes in the Lambda logs (`backend/src/audit.ts`), kept **90 days** (previously 1 month). Each note holds only fixed words and internal IDs, never an email, link, internet address or anything typed. A note is recorded for:
     - each refused link, with the reason
     - each "too many requests" block, and each sign-up refused by a limit
     - each refused request (route and status only)
     - the hidden trap field being filled
     - sign-up, confirm, pause, resume, unsubscribe and delete
     - a flight recorder being saved or emailed
     - each Send and Export button press, with its GitHub run number
   - **Deliberately not added:** CloudFront, API Gateway and S3 access logs. They would record every visitor's internet address on every page, which is far more personal data than a 50-reader newsletter needs. AWS's own CloudTrail event history already keeps 90 days of account changes for free.
   - **Still open:** keeping logs and data if the system is ever removed is part of launch checklist item 4.
