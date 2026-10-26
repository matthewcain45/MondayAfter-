// Which copies of The Monday After exist. Run by the "Deploy" button on GitHub.

import cdk from "aws-cdk-lib";
import { EmailStack } from "../lib/email-stack.ts";
import { TmaStack } from "../lib/stack.ts";

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-west-2" }; // London

// Sending email as @capstoneglobaladvisory.com (shared by every copy).
new EmailStack(app, "TheMondayAfter-email", {
  env,
  domain: "capstoneglobaladvisory.com",
  mailFromHost: "tma-mail",
  tags: { project: "the-monday-after" },
});

new TmaStack(app, "TheMondayAfter-test", {
  stage: "test",
  env,
  fromAddress: "themondayafter@capstoneglobaladvisory.com",
  replyTo: "themondayafter@capstoneglobaladvisory.com",
  tags: { project: "the-monday-after", stage: "test" },
});
