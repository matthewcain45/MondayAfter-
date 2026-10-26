# Launch checklist: The Monday After

Status on 26 October 2026. ✅ done · 🔲 to do.

## Already done
- ✅ The site at its own address, emails from the domain, out of SES test mode
- ✅ Incident File 01 built, with copy for all original gaps
- ✅ Sign-up, confirm, pause, unsubscribe, delete, spreadsheets
- ✅ Security review and fixes; GitHub access narrowed; backups
- ✅ Privacy notice, with consent as the legal basis

## Must do before launch

| # | What | Who |
|---|---|---|
| 1 | **Penetration test:** fix any real findings, redeploy, then remove the verification file and clean up the test reader and AWS Security Agent | Owner runs the test; Claude fixes |
| 2 | **The 30-day follow-up email.** Screen 11 promises "Ask me in 30 days whether I did it". It isn't built yet: either build it, or remove the tick until it is | Owner decides; Claude builds |
| 3 | **The bounce and complaint check before each send,** as promised to AWS. A simple version would have the Send button show the current rates and refuse to send if they're too high | Claude builds |
| 4 | **Make the current copy safe for real data.** It's set up as a "test" copy: if it were ever removed, its data would go with it. Either turn it into the live copy (keep data on removal, the same address, and early sign-ups kept), or build a separate live copy and move the address and sign-ups across | Owner decides; Claude builds |
| 5 | **The 10 "flipped" ledger lines** in `docs/copy-needed.md`, plus confirming the 5 small copy choices | Owner writes; Claude adds |
| 6 | **Read through all the new wording** Claude wrote: the sign-up page, the confirm and manage pages, the two emails and the flight recorder card | Owner |
| 7 | **Open privacy questions:** a check of "The clock" thread, and whether early sign-ups need anything | Owner / adviser |
| 8 | **A final run-through on your phone,** through several different routes, plus a small trial with people you invite | Owner and trial readers |

## Should do before launch

| # | What | Who |
|---|---|---|
| 9 | **The bare web address.** `themondayafter.capstoneglobaladvisory.com` currently shows "Open this file from your email". It should probably show the sign-up page | Claude, a quick change |
| 10 | **"Share this file"** currently shares that same bare address. It should share the sign-up page | Claude, a quick change |
| 11 | **One-click unsubscribe headers** in emails, which Gmail and Yahoo expect from newsletters | Claude |
| 12 | **Tie the GitHub buttons to a stable `main` branch** instead of this working branch name. Then a future Claude session working on a different branch can't break Deploy | Claude prepares; owner updates one IAM setting |

## Can wait until after launch
- The **designed HTML version** of the monthly email. The plain-text version works today.
- Scheduling sends, reports to readers, replaying files
- Tightening DMARC from monitor-only
