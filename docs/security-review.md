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

## Your decisions

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
- **Logs** hold only errors: no request bodies, email addresses or links.
- **Libraries:** `npm audit` found no known vulnerabilities, and every version is pinned.
- **No secrets in the project:** a scan found no keys or passwords. GitHub reaches AWS with short-lived passes tied to this project's permanent IDs and branch.
- **Email:** the domain signs every email (DKIM), the bounce address is set up, DMARC is in monitor mode, and sign-ups need confirming.
