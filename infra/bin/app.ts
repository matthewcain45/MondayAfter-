// Which copies of The Monday After exist. Run by the "Deploy" button on GitHub.

import cdk from "aws-cdk-lib";
import { TmaStack } from "../lib/stack.ts";

const app = new cdk.App();

new TmaStack(app, "TheMondayAfter-test", {
  stage: "test",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-west-2" }, // London
  fromAddress: "themondayafter@capstoneglobaladvisory.com",
  replyTo: "themondayafter@capstoneglobaladvisory.com",
  tags: { project: "the-monday-after", stage: "test" },
});
