import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { EmailStack } from "../lib/email-stack.ts";

const app = new cdk.App();
const stack = new EmailStack(app, "Email", { env: { account: "111111111111", region: "eu-west-2" }, domain: "example.com", mailFromHost: "tma-mail" });
const template = Template.fromStack(stack);
const outputs = Object.values(template.toJSON().Outputs as Record<string, { Value: unknown }>).map((o) => JSON.stringify(o.Value));

describe("sending as the domain", () => {
  it("verifies the whole domain with DKIM signing and a separate bounce subdomain", () => {
    template.hasResourceProperties("AWS::SES::EmailIdentity", {
      EmailIdentity: "example.com",
      DkimAttributes: { SigningEnabled: true },
      MailFromAttributes: { MailFromDomain: "tma-mail.example.com", BehaviorOnMxFailure: "USE_DEFAULT_VALUE" },
    });
  });

  it("lists exactly six new DNS records for the owner", () => {
    assert.equal(outputs.length, 6);
    assert.equal(outputs.filter((o) => o.includes("CNAME")).length, 3);
    assert.ok(outputs.some((o) => o.includes("MX") && o.includes("feedback-smtp.eu-west-2.amazonses.com") && o.includes("10")));
    assert.ok(outputs.some((o) => o.includes("v=spf1 include:amazonses.com ~all")));
  });

  it("adds DMARC in monitor-only mode, never stricter", () => {
    assert.ok(outputs.some((o) => o.includes("_dmarc") && o.includes("v=DMARC1; p=none")));
    assert.ok(!outputs.some((o) => /p=(quarantine|reject)/.test(o)));
  });

  it("never touches the main domain's own SPF record", () => {
    assert.ok(!outputs.some((o) => o.includes("v=spf1") && !o.includes("tma-mail")));
    template.resourceCountIs("AWS::Route53::RecordSet", 0);
    void Match;
  });
});
