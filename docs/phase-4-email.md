# Phase 4 (email part): let your domain vouch for The Monday After's emails

**Why:** at the moment, emails "from" `@capstoneglobaladvisory.com` are sent by AWS without your domain backing them, so Google treats them as possibly forged. Adding six **new** DNS records lets your domain vouch for AWS, so emails reach inboxes.

**Safety:** you only **add** records. You don't edit or delete anything. Your existing Google Workspace email records (MX, SPF, DKIM) stay exactly as they are. Nothing here affects your website.

---

## Step 1: press Deploy (about 10 minutes)

In GitHub, go to **Actions**, then **Deploy test copy**, then **Run workflow**. When it shows a green tick, open the run's **Summary** page. There's now a table called **"DNS records to add in Squarespace"** with six rows, a bit like this (your values will differ):

| Type | Host | Value | Priority |
|---|---|---|---|
| CNAME | `abcd1234…._domainkey` | `abcd1234….dkim.amazonses.com` | |
| CNAME | `efgh5678…._domainkey` | `efgh5678….dkim.amazonses.com` | |
| CNAME | `ijkl9012…._domainkey` | `ijkl9012….dkim.amazonses.com` | |
| MX | `tma-mail` | `feedback-smtp.eu-west-2.amazonses.com` | 10 |
| TXT | `tma-mail` | `v=spf1 include:amazonses.com ~all` | |
| TXT | `_dmarc` | `v=DMARC1; p=none` | |

Keep that page open, because you'll copy from it.

---

## Step 2: check nothing clashes (1 minute, look only)

In Squarespace, go to **Domains**, then `capstoneglobaladvisory.com`, then **DNS** (or **DNS Settings**). Look through the existing records for any whose **host** is `tma-mail` or `_dmarc`, or ends in `._domainkey` with the same letters as in your table. **There shouldn't be any.** If there are, stop and tell me.

(You'll probably see an existing `google._domainkey` record. That's Google's own, so leave it alone.)

---

## Step 3: add the six records (about 10 minutes)

In the same DNS page, find **Custom records** and click **Add record**. For each row of the table:

1. **Type:** as in the table (CNAME, MX or TXT).
2. **Host:** copy exactly from the table, for example `tma-mail` or `abcd1234…._domainkey`. **Don't add** `.capstoneglobaladvisory.com`, because Squarespace adds it automatically.
3. **Data / Value:** copy exactly from the table.
4. **Priority:** only for the MX row, enter `10`.
5. Leave **TTL** as it is. Click **Save**.

Repeat for all six. Copy and paste rather than typing: one wrong character stops it working.

---

## Step 4: wait for AWS to check (usually under an hour, can take up to 72 hours)

In the **Monday After** AWS account (London), go to **Amazon SES**, then **Identities**, then `capstoneglobaladvisory.com`. When it's done:
- **Identity status:** Verified
- **DKIM configuration:** Successful
- **Custom MAIL FROM domain:** Successful

You don't need to do anything else. AWS keeps checking by itself.

---

## Step 5: try again

Once it says **Verified**:
1. Open the test sign-up page and sign up with `themondayafter@capstoneglobaladvisory.com`. If you've signed up 3 times today already, wait until after midnight.
2. The confirm email should now land in your inbox. Tap the link to see **"You're in."**
3. Run **Send Incident File** in GitHub (type `SEND`), and play it through on your phone.

The confirm emails sent earlier today may still be in Spam, or in Google's quarantine (Admin console: search **"Admin quarantine"**). Any of those confirm links will also work if they're under 24 hours old.
