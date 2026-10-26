// Checks the security rules are really in the AWS setup, before anything is deployed.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CONTENT_SECURITY_POLICY, TmaStack } from "../lib/stack.ts";

let template: Template;
let resources: Record<string, { Type: string; Properties: Record<string, unknown> }>;

before(() => {
  const app = new cdk.App();
  const stack = new TmaStack(app, "Test", {
    stage: "test",
    env: { account: "111111111111", region: "eu-west-2" },
    fromAddress: "test.user@example.com",
    replyTo: "test.user@example.com",
  });
  template = Template.fromStack(stack);
  resources = template.toJSON().Resources;
});

// All permission statements attached to a function's role, as JSON text.
function permissionsOf(functionName: string): string {
  const fn = Object.values(resources).find((r) => r.Type === "AWS::Lambda::Function" && r.Properties.FunctionName === functionName)!;
  const roleRef = JSON.stringify((fn.Properties.Role as { "Fn::GetAtt": string[] })["Fn::GetAtt"][0]);
  return JSON.stringify(Object.values(resources).filter((r) => r.Type === "AWS::IAM::Policy" && JSON.stringify(r.Properties.Roles).includes(roleRef)));
}
const logicalId = (type: string, match: (p: Record<string, unknown>) => boolean) => Object.entries(resources).find(([, r]) => r.Type === type && match(r.Properties))![0];

describe("flight recorder protection", () => {
  it("lets the API lock recorders but not unlock them", () => {
    const p = permissionsOf("tma-test-api");
    assert.match(p, /kms:GenerateDataKey/);
    assert.doesNotMatch(p, /kms:Decrypt/);
  });

  it("lets only the recorder mailer unlock them", () => {
    assert.match(permissionsOf("tma-test-recorder-mailer"), /kms:Decrypt/);
    assert.doesNotMatch(permissionsOf("tma-test-export"), /kms:/);
  });

  it("gives the export no access to the recorders table at all", () => {
    const recorders = logicalId("AWS::DynamoDB::Table", (p) => p.TableName === "tma-test-recorders");
    assert.doesNotMatch(permissionsOf("tma-test-export"), new RegExp(recorders));
  });

  it("gives the sender no access to recorders or answers", () => {
    const p = permissionsOf("tma-test-sender");
    assert.doesNotMatch(p, /kms:/);
    for (const name of ["tma-test-recorders", "tma-test-answers"]) {
      assert.doesNotMatch(p, new RegExp(logicalId("AWS::DynamoDB::Table", (t) => t.TableName === name)));
    }
    assert.match(p, /ses:SendEmail/);
  });

  it("rotates the recorder key every year", () => {
    template.hasResourceProperties("AWS::KMS::Key", { EnableKeyRotation: true });
  });
});

describe("data storage", () => {
  it("has six tables, all deleting expired records automatically", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", 6);
    for (const r of Object.values(resources).filter((x) => x.Type === "AWS::DynamoDB::Table")) {
      assert.deepEqual(r.Properties.TimeToLiveSpecification, { AttributeName: "expiresAt", Enabled: true });
      assert.equal(r.Properties.BillingMode, "PAY_PER_REQUEST");
    }
  });

  it("backs up everything except the rate-limit counters", () => {
    for (const r of Object.values(resources).filter((x) => x.Type === "AWS::DynamoDB::Table")) {
      const on = (r.Properties.PointInTimeRecoverySpecification as { PointInTimeRecoveryEnabled: boolean } | undefined)?.PointInTimeRecoveryEnabled === true;
      assert.equal(on, r.Properties.TableName !== "tma-test-limits", String(r.Properties.TableName));
    }
  });

  it("keeps every storage bucket private and HTTPS-only", () => {
    const buckets = Object.values(resources).filter((r) => r.Type === "AWS::S3::Bucket");
    assert.equal(buckets.length, 2);
    for (const b of buckets) {
      assert.deepEqual(b.Properties.PublicAccessBlockConfiguration, { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });
    }
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } })]) },
    });
  });

  it("deletes exports after 7 days", () => {
    template.hasResourceProperties("AWS::S3::Bucket", { LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 7, Status: "Enabled" })] } });
  });
});

describe("the website", () => {
  it("sends strict security headers", () => {
    template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
          ReferrerPolicy: { ReferrerPolicy: "no-referrer", Override: true },
          FrameOptions: { FrameOption: "DENY", Override: true },
        }),
      }),
    });
    assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'(;|$)/);
  });

  it("passes the personal-link header to the API, and nothing is cached there", () => {
    template.hasResourceProperties("AWS::CloudFront::OriginRequestPolicy", {
      OriginRequestPolicyConfig: Match.objectLike({ HeadersConfig: { HeaderBehavior: "whitelist", Headers: Match.arrayWith(["X-TMA-Link"]) }, CookiesConfig: { CookieBehavior: "none" } }),
    });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [Match.objectLike({ PathPattern: "/api/*", CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", ViewerProtocolPolicy: "https-only" })],
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }),
      }),
    });
  });

  it("only lets the API be reached through CloudFront, and passes on the visitor's address", () => {
    const dist = Object.values(resources).find((r) => r.Type === "AWS::CloudFront::Distribution")!;
    const apiOrigin = (dist.Properties.DistributionConfig as { Origins: { CustomOriginConfig?: unknown; OriginCustomHeaders?: { HeaderName: string; HeaderValue: unknown }[] }[] }).Origins.find((o) => o.CustomOriginConfig)!;
    const marker = apiOrigin.OriginCustomHeaders!.find((h) => h.HeaderName === "X-TMA-Origin")!;
    const fns = Object.values(resources).filter((r) => r.Type === "AWS::Lambda::Function" && String(r.Properties.FunctionName).startsWith("tma-test-"));
    for (const f of fns) {
      assert.deepEqual((f.Properties.Environment as { Variables: Record<string, unknown> }).Variables.ORIGIN_SECRET, marker.HeaderValue, String(f.Properties.FunctionName));
    }
    template.hasResourceProperties("AWS::CloudFront::OriginRequestPolicy", {
      OriginRequestPolicyConfig: Match.objectLike({ HeadersConfig: { HeaderBehavior: "whitelist", Headers: Match.arrayWith(["CloudFront-Viewer-Address"]) } }),
    });
  });

  it("routes 'email me my flight recorder' to the mailer and everything else to the API", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "POST /api/file/recorder/email" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "ANY /api/{proxy+}" });
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", { DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 } });
  });

  it("shows a friendly page for missing pages", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: [
          { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: "/404.html", ErrorCachingMinTTL: 300 },
          { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: "/404.html", ErrorCachingMinTTL: 300 },
        ],
      }),
    });
  });

  it("doesn't publish the preview pages", () => {
    const deploy = Object.values(resources).find((r) => r.Type === "Custom::CDKBucketDeployment")!;
    assert.ok(deploy, "site files are deployed");
  });
});

describe("the site's own web address", () => {
  const withAddress = (certificateArn?: string) => Template.fromStack(new TmaStack(new cdk.App(), "Addr", {
    stage: "test",
    env: { account: "111111111111", region: "eu-west-2" },
    fromAddress: "test.user@example.com",
    replyTo: "test.user@example.com",
    webAddress: certificateArn ? { domainName: "themondayafter.example.com", certificateArn } : undefined,
  }));

  it("uses the address and its certificate once the certificate exists, with modern encryption only", () => {
    const t = withAddress("arn:aws:acm:us-east-1:111111111111:certificate/test-cert");
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: ["themondayafter.example.com"],
        ViewerCertificate: Match.objectLike({ AcmCertificateArn: "arn:aws:acm:us-east-1:111111111111:certificate/test-cert", MinimumProtocolVersion: "TLSv1.2_2021" }),
      }),
    });
    t.hasResourceProperties("AWS::SSM::Parameter", { Value: "https://themondayafter.example.com" });
    assert.ok(t.toJSON().Outputs.WebAddressRecord, "shows the record to add in Squarespace");
  });

  it("keeps the temporary address until then", () => {
    const t = withAddress();
    const dist = Object.values(t.toJSON().Resources as Record<string, { Type: string; Properties: { DistributionConfig: Record<string, unknown> } }>).find((r) => r.Type === "AWS::CloudFront::Distribution")!;
    assert.equal(dist.Properties.DistributionConfig.Aliases, undefined);
    assert.equal(t.toJSON().Outputs.WebAddressRecord, undefined);
  });
});
