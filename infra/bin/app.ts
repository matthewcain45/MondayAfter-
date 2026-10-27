// Which copies of The Monday After exist. Run by the "Deploy" button on GitHub.

import cdk from "aws-cdk-lib";
import { EmailStack } from "../lib/email-stack.ts";
import { TmaStack } from "../lib/stack.ts";

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-west-2" }; // London
const WEB_ADDRESS = "themondayafter.capstoneglobaladvisory.com";

// Sending email as @capstoneglobaladvisory.com (shared by every copy).
new EmailStack(app, "TheMondayAfter-email", {
  env,
  domain: "capstoneglobaladvisory.com",
  mailFromHost: "tma-mail",
  tags: { project: "the-monday-after" },
});

// The web address's certificate is requested by the "Request web address
// certificate" button. Once AWS has issued it, the Deploy button passes it in
// here (as certificateArn) and the site switches to its own address.
const certificateArn = app.node.tryGetContext("certificateArn");

// This copy holds the real readers (Option A, agreed 27 October 2026). It keeps
// the name "test" because renaming would create a new, empty copy.
new TmaStack(app, "TheMondayAfter-test", {
  stage: "test",
  keepData: true,
  env,
  webAddress: certificateArn ? { domainName: WEB_ADDRESS, certificateArn } : undefined,
  fromAddress: "themondayafter@capstoneglobaladvisory.com",
  replyTo: "themondayafter@capstoneglobaladvisory.com",
  tags: { project: "the-monday-after", stage: "test" },
});
