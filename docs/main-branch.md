# Moving the buttons to the `main` branch

**Why:** today the GitHub buttons only work from one Claude working branch. If a future Claude session used a different branch, the buttons would stop working, or would run unreviewed changes. From now on:

- `main` is the stable version of The Monday After. AWS only accepts buttons run from `main`.
- Claude works on its own branch and asks you to approve each change into `main` (a "pull request"). Nothing reaches `main`, or the live site, without your click.

Claude has created `main` with everything built so far. Four steps for you, about 10 minutes.

## 1. Make `main` the default branch on GitHub

1. Open the project on GitHub, then **Settings** (top right of the project) → **General**.
2. Under **Default branch**, click the two-arrows button, choose **main**, then **Update**, then **I understand, update the default branch**.

## 2. Tell AWS to accept `main` (one setting in IAM)

1. Sign in to **The Monday After** AWS account (not the main business account).
2. Open **IAM** → **Roles** → **tma-github-deploy** → the **Trust relationships** tab → **Edit trust policy**.
3. Find this text:
   `ref:refs/heads/claude/monday-after-claude-md-tnf5n3`
   and change it to:
   `ref:refs/heads/main`
   Change nothing else.
4. Click **Update policy**.

After this, buttons run from the old Claude branch will be refused. That's intended.

## 3. Protect `main` (recommended, free)

So nothing can be added to `main` without a pull request you approve:

1. **Settings** → **Branches** → **Add branch ruleset** (or **Add rule**).
2. Name it `main`, set **Enforcement status** to **Active**, and under **Target branches** add **Include default branch**.
3. Tick **Restrict deletions**, **Require a pull request before merging** and **Block force pushes**. Leave the rest unticked.
4. Click **Create**.

## 4. Deploy from `main`

1. **Actions** → **Deploy test copy** → **Run workflow**.
2. Under **Use workflow from**, choose **main**, then **Run workflow**.
3. It should go green. If it says "Could not assume role", step 2 needs another look.

## How changes work from now on

1. You ask Claude for a change. Claude builds and checks it on its own branch, then opens a pull request into `main` and sends you the link.
2. You open the link, read Claude's summary, and click **Merge pull request** → **Confirm merge**.
3. You press **Deploy test copy** (from `main`).

The Send and Export buttons work the same way: always run them from `main`.
