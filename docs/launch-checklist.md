# Launch checklist: The Monday After

Status on 27 October 2026. ✅ done · 🔲 to do.

## Already done
- ✅ The site at its own address, emails from the domain, out of SES test mode
- ✅ Incident File 01 built, with copy for all original gaps
- ✅ Sign-up, confirm, pause, unsubscribe, delete, spreadsheets
- ✅ Security review and fixes; GitHub access narrowed; backups
- ✅ Privacy notice, with consent as the legal basis
- ✅ AWS Continuum code review: all four findings fixed (stricter input checks, sign-up limits that can't be dodged, 90-day security notes)
- ✅ All ledger copy written, including the flipped versions, and the owner's first round of wording edits applied

## Must do before launch

| # | What | Who |
|---|---|---|
| 1 | **Penetration test: done.** The verification file is removed. Left: send Claude the findings; delete the test reader; stop AWS Security Agent so it doesn't keep charging | Owner; Claude fixes findings |
| 2 | ✅ **The 30-day follow-up email: built.** Sent each morning when due, with a "Yes / Partly / Not yet" page | Done |
| 3 | ✅ **The bounce and complaint check before each send: built.** Sending stops at 4% bounces or 0.08% complaints | Done |
| 4 | ✅ **The current copy is now the real one (Option A).** Its data survives if the code is ever removed | Done |
| 5 | **Confirm the 5 small copy choices** in `docs/copy-needed.md` (the ledger lines themselves are done) | Owner |
| 6 | **Finish the read-through** of the wording spreadsheet (`docs/app-text.xlsx`): the confirm and manage pages, the emails and the closing screen | Owner |
| 7 | **Open privacy questions:** a check of "The clock" thread, and whether early sign-ups need anything | Owner / adviser |
| 8 | **A final run-through on your phone,** through several different routes, plus a small trial with people you invite | Owner and trial readers |

## Should do before launch

| # | What | Who |
|---|---|---|
| 9 | ✅ **The bare web address shows the sign-up page** | Done |
| 10 | ✅ **"Share this file" shares the sign-up page** | Done |
| 11 | **One-click unsubscribe headers** in emails, which Gmail and Yahoo expect from newsletters | Claude |
| 12 | **Tie the GitHub buttons to a stable `main` branch** instead of this working branch name. Then a future Claude session working on a different branch can't break Deploy | Claude prepares; owner updates one IAM setting |

## Can wait until after launch
- The **designed HTML version** of the monthly email. The plain-text version works today.
- Scheduling sends, reports to readers, replaying files
- Tightening DMARC from monitor-only
