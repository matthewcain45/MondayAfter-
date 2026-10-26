# The Monday After: briefing for the data protection review

**For:** the data protection adviser reviewing The Monday After before launch.
**From:** Capstone Global Advisory (data controller).
**What to read:** the draft privacy notice at `https://themondayafter.capstoneglobaladvisory.com/privacy.html` (or `site/privacy.html`), the sign-up page at `/signup.html`, and "The clock" thread in Incident File 01. A summary of the facts and the open questions follows.

## The service in one paragraph

A free monthly email for aspiring CIOs. Each email holds a personal, expiring link to a short fictional incident scenario on the website. Readers make choices, see the assumptions behind them, and get a "ledger" of consequences. About 50 subscribers are expected. Sign-up uses double opt-in (a confirmation email). There's no login.

## What is processed

| Data | Purpose | Kept for | Where |
|---|---|---|---|
| Email address | Sending the monthly file and confirmations, and replies on request | 2 years after last activity (unconfirmed: 7 days) | AWS, London |
| Answers (choices, threads opened, flags, forecast, "take back" action and date) | Letting the reader return; future reports to the reader; understanding responses in aggregate | 2 years after last saved | AWS, London |
| Screens reached, with timestamps, against an internal ID | Improving scenarios (where people drop out) | 2 years | AWS, London |
| Flight recorder (free text about what the reader would do) | Emailed back to the reader on request | 2 years | AWS, London, encrypted with a dedicated key that the main application cannot decrypt; never exported or logged |
| Subscription status (signed up, confirmed, paused until, unsubscribed) | Running the service | 2 years | AWS, London |
| Hashed IP address and hashed email address | Rate limiting against abuse | Up to 1 hour (IP) and up to 1 day (email) | AWS, London |
| Replies to our emails | Answering questions | Until deleted by the owner | Google Workspace |

- **Not processed:** no cookies, tracking pixels, email open tracking, advertising or third-party analytics. CloudFront and API access logging is off. Application logs hold errors only, with no request bodies, email addresses or links, and are kept 1 month.
- **Owner's view:** a named and an anonymous spreadsheet export (answers, status, funnel). The exports never include flight recorder text. They are stored in a private bucket and deleted after 7 days.

## Processors

- **Amazon Web Services:** hosting (S3, CloudFront), database (DynamoDB), email sending (SES), encryption keys (KMS), all in London (`eu-west-2`). CloudFront may serve a visit from an edge location in Europe or North America (price class 100).
- **Google Workspace:** the owner's inbox, where replies land.

## Questions for you

1. **Lawful basis.** The draft proposes consent for the emails and for storing answers and the flight recorder, and legitimate interests for recording which screens readers reach. Is that right? Should legitimate interests cover more, or less? Does the analytics use need a written legitimate interests assessment?
2. **Sign-up wording.** Under the button, the sign-up page says: *"One file a month, plus one email now to confirm it's you. Every email lets you pause, unsubscribe or delete your data. No tracking, no adverts. How we use your data."* Is that sufficient for valid consent, including under PECR for the monthly emails? Should it say plainly that answers are kept with the email address?
3. **Transfers.** Is the draft's wording enough for CloudFront edge processing outside the UK and for Google Workspace? Which safeguards should be named?
4. **Erasure and backups.** Deletion is immediate in the live system. Point-in-time backups keep data for up to 35 days, and the SES suppression list keeps addresses that bounced or complained. Is the disclosure in the draft adequate?
5. **Flight recorder.** It's free text. Readers are told "No names or confidential detail. Write it as a pattern." Could it attract special category data in practice? Is a DPIA advisable, or a short screening note enough?
6. **Owner's obligations:**
   - Is the ICO data protection fee due?
   - Should there be a record of processing activities?
   - Should the email footer carry a postal address?
7. **"The clock" thread.** It asks questions about breach notification (controller or processor, and when the clock starts) and is labelled "Not legal advice". Please check that it doesn't mislead.
8. **Early sign-ups.** The sign-up page is already public, and people who sign up before launch see this draft. Does anything need to happen for them once the final notice is published?

## Rights handling

- **Self-service from any email:** pause for 3 months, unsubscribe, delete everything.
- **Other requests:** sent by reply to `themondayafter@capstoneglobaladvisory.com`. The owner can export a reader's answers from the spreadsheet.
