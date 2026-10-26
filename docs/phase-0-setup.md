# Phase 0: accounts and safety nets

These are things only you can do, because they involve your accounts and passwords. Allow about 45 minutes. **Never paste passwords, sign-in codes or access keys into the chat with Claude.** None of the steps need you to.

AWS changes its screens from time to time. If a button has a slightly different name, look for the nearest match, or ask.

---

## Step 1: Lock down your existing AWS account (5 minutes)

Your existing account will become the "management" account that pays the bill for both accounts.

1. Sign in to the AWS console as the **root user** (the email and password you created the account with).
2. Click your account name (top right), then **Security credentials**.
3. Under **Multi-factor authentication (MFA)**, check that a device is listed. If not, click **Assign MFA device** and follow the steps. An authenticator app on your phone or a passkey both work.

**Why:** the root user can do anything, including closing the account. Two-factor sign-in means a stolen password isn't enough.

---

## Step 2: Turn on AWS Organizations (2 minutes, free)

1. In the search bar at the top of the console, type **Organizations** and open it.
2. Click **Create an organization**. Accept the default, which has all features turned on.
3. AWS emails you to verify your address. Click the link in that email.

**Why:** this lets you create a second account that's kept fully separate but shares one bill.

---

## Step 3: Create the Monday After account (5 minutes, free)

1. In Organizations, go to **AWS accounts**, then **Add an AWS account**, then **Create an AWS account**.
2. **Account name:** `The Monday After`
3. **Email address:** this must be an address that isn't already used by another AWS account. The easiest option is a "plus" version of your own work email, for example `yourname+aws-tma@capstoneglobaladvisory.com`. Google Workspace delivers these to your normal inbox automatically.
4. Leave the **IAM role name** as it is (`OrganizationAccountAccessRole`).
5. Click **Create AWS account**. It takes a few minutes to show as "Active".

**Why:** anything built for The Monday After lives in this account. It can never touch your business website, and your website can never touch it.

---

## Step 4: Set up safe sign-in with IAM Identity Center (15 minutes, free)

This gives you a personal sign-in page for both accounts. Sign-ins are short-lived and protected by two-factor, and no permanent keys are stored anywhere.

1. In the console search bar, type **IAM Identity Center** and open it.
2. Check that the region (top right) shows **Europe (London) eu-west-2**. Change it if not, because this is hard to move later.
3. Click **Enable**. If asked, choose to enable it **with AWS Organizations**.
   - **Check the type:** after enabling, go to **Settings**. **Instance type** must say **Organization instance**. An "Account instance" can't give access to other AWS accounts. If you have one and nothing uses it (no applications, and no users other than yours), delete it from **Settings**, then the **Management** tab, and enable again in London. This is what we did on 26 October 2026.
   - **If you see "You have already registered another region":** Identity Center is already switched on in a different region, and only one is allowed. Find it by changing the region selector (top right) and reopening IAM Identity Center. Try **US East (N. Virginia)** first, then **Europe (Ireland)**. The region where the dashboard opens normally is the right one. **Keep using that region.** It only decides where your sign-in details are kept, not where The Monday After runs. Don't delete it to start again in London. Carry on from point 4 there.
4. **Make two-factor sign-in compulsory:** go to **Settings**, then **Authentication**, then **Multi-factor authentication**, then **Configure**. Choose to prompt users **every time they sign in**, and to **require them to register an MFA device** at sign-in. Save.
5. **Create your user:** go to **Users**, then **Add user**. Enter a username (for example your first name) and your work email. Skip the groups step and finish.
6. You'll receive an invitation email. Accept it, choose a password, and register your phone or passkey as the second factor.
7. **Create the permission:** go to **Permission sets**, then **Create permission set**. Choose **Predefined permission set**, then **AdministratorAccess**. Set the **session duration** to **1 hour**, then create it.
8. **Give yourself access to the Monday After account only:** go to **AWS accounts**, tick **The Monday After** (not your main account), then click **Assign users or groups**. Choose your user, then the **AdministratorAccess** permission set, then **Submit**.
9. On the Identity Center **Dashboard**, copy the **AWS access portal URL**. It looks like `https://d-xxxxxxxxxx.awsapps.com/start`. Bookmark it: this is how you'll sign in to the Monday After account from now on.

**Check it worked:** open the portal URL, sign in, and you should see **The Monday After** listed. Click it, then **AdministratorAccess**, and you'll arrive in that account's console.

**Why "Administrator" for now:** setting up the system for the first time needs broad permissions inside the Monday After account. They don't reach your main account. Once everything is built, I'll suggest narrower day-to-day permissions.

---

## Step 5: Set the £5 spending alert (5 minutes, free)

Do this in your **main** account (the one that pays the bill), signed in as before.

1. In the console search bar, type **Budgets** and open **AWS Budgets** (part of Billing and Cost Management).
2. Click **Create budget**. Choose **Use a template**, then **Monthly cost budget**.
3. **Budget amount:** `6` (AWS budgets are in US dollars; $6 is roughly £5).
4. **Email recipients:** your work email.
5. Click **Create budget**.

You'll be emailed if the month's spending is forecast to go over the budget, and again if it actually does. Expected spending is about £1–£2 a month, so an alert means something needs looking at.

---

## Step 6: Create the sending address in Google Workspace (5 minutes, free)

1. Go to **admin.google.com** and sign in as an administrator.
2. Go to **Directory**, then **Users**, and click your own user.
3. Open **User information**, then **Alternate email addresses** (email aliases), and click **Add**.
4. Enter `themondayafter`, so the full address is `themondayafter@capstoneglobaladvisory.com`. Save.

**Check it worked:** about an hour later, send a test email to `themondayafter@capstoneglobaladvisory.com` from another account. It should arrive in your normal inbox.

---

## Step 7: Check your DMARC setting (2 minutes, look only, don't change anything)

1. In Squarespace, go to **Domains**, then `capstoneglobaladvisory.com`, then **DNS** (or **DNS settings**).
2. Look for a **TXT** record whose host or name is `_dmarc`.
3. Tell me whether it exists, and if so, the part of its value that starts `p=` (for example `p=none`, `p=quarantine` or `p=reject`). That part isn't secret.

**Please don't edit or delete any records.** We'll only ever add new ones, in Phase 4.

---

## When you're done, tell me

- [ ] Step 1: root two-factor on (yes/no)
- [ ] Steps 2–3: Monday After account created and shows "Active"
- [ ] Step 4: you can sign in through the access portal and open the Monday After account
- [ ] Step 5: budget created
- [ ] Step 6: alias created
- [ ] Step 7: DMARC value (`p=…`) or "no `_dmarc` record"

You don't need to send account numbers, passwords or the portal URL.
