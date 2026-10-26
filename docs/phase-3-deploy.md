# Phase 3: putting a test copy on AWS

This creates a **test copy** of The Monday After in your Monday After AWS account, in London. It runs at a temporary AWS web address, not your own domain yet (that's Phase 4). It costs about £1–£2 a month, mostly the flight recorder's encryption key.

**Never paste passwords, sign-in codes or keys into the chat.** Nothing here needs you to.

---

## Part A: let GitHub's buttons into the Monday After account (one-off, 10 minutes)

This creates a "trust" setting in AWS. It lets this GitHub project's buttons get a short-lived pass (at most one hour) into the **Monday After account only**. No keys are stored anywhere.

1. **Download the template.** On GitHub, open the project, then the folder `infra`, then the file `github-deploy-role.yaml`. Click the **Download raw file** button (a downward arrow, top right of the file).
2. **Sign in to the Monday After account** through your AWS access portal. Click **The Monday After**, then **AdministratorAccess**.
3. Check that the region (top right) says **Europe (London)**.
4. In the search bar, type **CloudFormation** and open it. Click **Create stack**, then **With new resources (standard)**.
5. Choose **Upload a template file**, then **Choose file**, and pick the file you downloaded. Click **Next**.
6. **Stack name:** `tma-github-deploy`. Leave both settings as they are. Click **Next**, then **Next** again. (If the Deploy button later fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity", compare the `sub:` line in the run's **Sign-in details** with these settings.)
7. At the bottom, tick **"I acknowledge that AWS CloudFormation might create IAM resources with custom names"**, then **Submit**.
8. Wait until the status says **CREATE_COMPLETE**, about a minute. Click the **Outputs** tab and copy the **RoleArn** value. It starts `arn:aws:iam::`.
9. **Tell GitHub about it:** in the GitHub project, go to **Settings**, then **Secrets and variables**, then **Actions**. Open the **Variables** tab and click **New repository variable**.
   - **Name:** `AWS_DEPLOY_ROLE_ARN`
   - **Value:** paste the RoleArn
   - Click **Add variable**.

---

## Part B: press Deploy (about 15 minutes, mostly waiting)

1. In the GitHub project, open the **Actions** tab. If GitHub asks whether to enable workflows, say yes.
2. On the left, click **Deploy test copy**. Then click **Run workflow** (right-hand side), keep the branch shown, and click the green **Run workflow** button.
3. Click the run that appears to watch it. It runs every check first (about 70 automated tests), then builds everything on AWS. The first time takes 10–15 minutes.
4. When it shows a green tick, the run's **Summary** page shows the **site address** and **sign-up page**. They look like `https://d1234abcd.cloudfront.net`.

If it shows a red cross, tell me which step failed. Nothing half-built is left behind: AWS rolls back automatically.

---

## Part C: approve the sending address (2 minutes)

During the deploy, AWS emails a verification link to `themondayafter@capstoneglobaladvisory.com`, which arrives in your inbox through the alias. **Click the link** within 24 hours.

**About test mode:** new AWS email accounts start in a "sandbox". They can only send to email addresses that have been verified in the account. So for now:
- Sign up using **`themondayafter@capstoneglobaladvisory.com`** itself, because that address is already verified.
- To test with another address of yours, verify it first: go to **Amazon SES**, then **Identities**, then **Create identity**, choose **Email address**, then click the link AWS sends to it.

We'll ask AWS to lift the sandbox in Phase 4.

---

## Part D: try it on your phone

1. Open the **sign-up page** address from the deploy summary. Sign up with `themondayafter@capstoneglobaladvisory.com`.
2. Open the confirm email and tap the link. You should see **"You're in."**
3. **Send yourself the file:** on GitHub, go to **Actions**, then **Send Incident File (test copy)**, then **Run workflow**. Leave the file as `incident-file-01`, type `SEND` in the confirm box, and click **Run workflow**. The summary shows how many were sent.
4. Open the email, tap **Make your first call**, and play it through. Try:
   - reloading part-way through
   - "Email me my flight recorder" at the end
   - the unsubscribe or delete link at the bottom of the email
5. **Your spreadsheets:** on GitHub, go to **Actions**, then **Export spreadsheets (test copy)**, then **Run workflow**. The summary names a storage bucket and folder. In the AWS console (Monday After account), open **S3**, then that bucket, then that folder, and download the files. They delete themselves after 7 days. **The spreadsheets never pass through GitHub.**

---

## What's running, and what it costs

| Part | What it does | Expected cost |
|---|---|---|
| CloudFront + S3 | Serves the pages | Free allowance / pennies |
| API Gateway + Lambda | Saving, sign-up, emails, export | Free allowance / pennies |
| DynamoDB (6 tables) | Subscribers, links, answers, recorders, analytics, limits | Pennies |
| KMS key | Locks flight recorders | About $1 a month |
| SES | Emails | About $0.10 per 1,000 |
| CloudWatch logs | Error logs, kept 1 month, no personal data | Pennies |

**GitHub:** each deploy uses about 10 minutes of GitHub's free monthly allowance (2,000 minutes for private projects).
