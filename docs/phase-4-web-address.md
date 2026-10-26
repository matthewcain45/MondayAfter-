# Phase 4 (web address part): `themondayafter.capstoneglobaladvisory.com`

**What changes:** the test site moves from `https://d3v5rd12ftqam2.cloudfront.net` to **`https://themondayafter.capstoneglobaladvisory.com`**. New emails use the new address. Links in emails already sent keep working.

**Safety:** you only **add** two new records in Squarespace. Nothing existing is changed, and your business website and email aren't affected.

---

## Step 1: one quick check (1 minute, look only)

In Squarespace, go to **Domains**, then `capstoneglobaladvisory.com`, then **DNS**. Look for any record of type **CAA**.
- **No CAA records:** fine, carry on.
- **There are CAA records:** tell me what they say before going further. They control which companies may issue padlock certificates for your domain, and Amazon might need adding. That would be a change, so I'd ask first.

Also check there's no existing record with host `themondayafter`.

---

## Step 2: ask AWS for the padlock certificate (2 minutes)

In GitHub, go to **Actions**, then **Request web address certificate**, then **Run workflow**. Its **Summary** shows one record:

| Type | Host | Value |
|---|---|---|
| CNAME | `_…something….themondayafter` | `_…something….acm-validations.aws` |

Add it in Squarespace: under **Custom records**, click **Add record** and copy the Type, Host and Value exactly. Don't add `.capstoneglobaladvisory.com` to the host. **Keep this record for good**, because AWS uses it to renew the certificate every year.

---

## Step 3: wait for AWS to confirm (usually 5–30 minutes)

Press **Request web address certificate** again. When its summary says **"Certificate issued"**, carry on. If it still says waiting after an hour, tell me.

---

## Step 4: press Deploy (about 10 minutes)

In GitHub, go to **Actions**, then **Deploy test copy**, then **Run workflow**. It finds the certificate by itself, and the site starts answering on its own address. The summary then shows a section **"Web address: add this record in Squarespace"**:

| Type | Host | Value |
|---|---|---|
| CNAME | `themondayafter` | `d3v5rd12ftqam2.cloudfront.net` |

Add it in Squarespace the same way.

---

## Step 5: check it (a few minutes after adding the record)

Open **https://themondayafter.capstoneglobaladvisory.com/signup.html** on your phone. You should see the sign-up page with a padlock. If it doesn't load at first, wait 10 minutes: new records take a little while to spread.

From now on, confirm, manage and file links in new emails use this address.

---

## Step 6: ask AWS to lift email test mode (5 minutes, then usually a day's wait)

At the moment AWS will only send to addresses you've verified. To email real subscribers, ask AWS once:

1. Sign in to the **Monday After** account (London), open **Amazon SES**, then **Account dashboard**, and click **Request production access** (or **"View Get set up page"**, then **Request production access**).
2. Fill it in. Suggested answers (please check they're true for you):
   - **Mail type:** Marketing
   - **Website URL:** `https://themondayafter.capstoneglobaladvisory.com/signup.html`
   - **Use case description:**

     > The Monday After is a free monthly email for aspiring CIOs, run by Capstone Global Advisory. Each month subscribers receive one email containing a personal link to a short, fictional incident scenario on our website. We expect about 50 subscribers and around 50–100 emails a month in total (the monthly email, sign-up confirmations, and emails a subscriber asks for, such as a copy of their own notes).
     >
     > Every subscriber signs up on our website and must click a confirmation link before receiving anything (double opt-in). We never buy, rent or import lists. Every email includes a link to pause, unsubscribe or delete their data immediately. We rely on the SES account-level suppression list to stop sending to addresses that bounce or complain, and we review bounce and complaint rates before each monthly send. Unconfirmed sign-ups are deleted after 7 days.
   - **Additional contacts:** your work email.
   - Tick the box agreeing to AWS's terms, and submit.
3. AWS usually replies by email within 24 hours. If they ask questions, forward them to me and I'll help you answer.

Until they approve it, keep testing with verified addresses only.
