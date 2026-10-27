// The Monday After on AWS, described as code. One "stack" is one complete
// copy of the system. "TheMondayAfter-test" became the copy for real readers
// on 27 October 2026 (Option A): it keeps its name, and now keeps its data.

import cdk from "aws-cdk-lib";
import acm from "aws-cdk-lib/aws-certificatemanager";
import apigw from "aws-cdk-lib/aws-apigatewayv2";
import integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import cloudfront from "aws-cdk-lib/aws-cloudfront";
import origins from "aws-cdk-lib/aws-cloudfront-origins";
import dynamodb from "aws-cdk-lib/aws-dynamodb";
import eventbridge from "aws-cdk-lib/aws-events";
import targets from "aws-cdk-lib/aws-events-targets";
import iam from "aws-cdk-lib/aws-iam";
import kms from "aws-cdk-lib/aws-kms";
import lambda from "aws-cdk-lib/aws-lambda";
import nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import logs from "aws-cdk-lib/aws-logs";
import s3 from "aws-cdk-lib/aws-s3";
import s3deploy from "aws-cdk-lib/aws-s3-deployment";
import ses from "aws-cdk-lib/aws-ses";
import ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface TmaProps extends cdk.StackProps {
  stage: "test" | "live";
  // Readers' data is kept even if this copy's code is ever removed, and the
  // database refuses to be deleted. On for the copy that holds real readers.
  keepData: boolean;
  fromAddress: string; // the "From" address on emails
  replyTo: string; // where replies go
  // The site's own web address, once its certificate (padlock) has been issued.
  // Until then the site uses CloudFront's temporary address.
  webAddress?: { domainName: string; certificateArn: string };
}

// Locks the site down in the browser: only our own files can load, nothing
// can be embedded in other sites, and no referrer leaves the page.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export class TmaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TmaProps) {
    super(scope, id, props);
    const { stage, keepData } = props;
    // A throwaway copy can be removed completely; a copy with real readers keeps its data.
    const removalPolicy = keepData ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ---------- Storage ----------

    // Backups: any moment from the last 35 days can be restored (pennies a month at
    // this size). Not for the rate-limit counters, which are throwaway.
    const table = (name: string, pk: string, sk?: string, backups = true) => new dynamodb.Table(this, name, {
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: backups },
      tableName: `tma-${stage}-${name.toLowerCase()}`,
      partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
      sortKey: sk ? { name: sk, type: dynamodb.AttributeType.STRING } : undefined,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // pay only for use: pennies at this size
      timeToLiveAttribute: "expiresAt", // the database deletes records when they expire
      deletionProtection: keepData,
      removalPolicy,
    });
    const subscribers = table("Subscribers", "id");
    subscribers.addGlobalSecondaryIndex({ indexName: "byEmail", partitionKey: { name: "email", type: dynamodb.AttributeType.STRING } });
    const links = table("Links", "tokenHash");
    links.addGlobalSecondaryIndex({ indexName: "bySubscriber", partitionKey: { name: "subscriberId", type: dynamodb.AttributeType.STRING }, projectionType: dynamodb.ProjectionType.KEYS_ONLY });
    const answers = table("Answers", "subscriberId", "scenarioId");
    const recorders = table("Recorders", "subscriberId", "scenarioId");
    const events = table("Events", "subscriberId", "sk");
    const limits = table("Limits", "key", undefined, false);

    // The flight recorder's own key (about $1 a month). Rotated automatically every year.
    const recorderKey = new kms.Key(this, "RecorderKey", {
      alias: `tma-${stage}-flight-recorder`,
      description: "Encrypts readers' flight recorders. Only the recorder mailer may decrypt.",
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(7),
      removalPolicy,
    });

    // ---------- Email ----------

    // Until the domain is set up (Phase 4), SES sends from this single verified
    // address. Creating it makes AWS email a verification link to that address.
    new ses.EmailIdentity(this, "FromAddress", { identity: ses.Identity.email(props.fromAddress) });

    // ---------- Code that runs on request ----------

    const siteUrlParam = `/tma/${stage}/site-url`;
    // A secret marker CloudFront adds to every request it sends to the API, so the
    // API can refuse requests that try to go round CloudFront. It's the unique,
    // unguessable ID AWS gave this stack, visible only inside the account.
    const originSecret = cdk.Fn.select(2, cdk.Fn.split("/", this.stackId));
    const common: nodejs.NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      entry: `${repoRoot}backend/src/lambda.ts`,
      projectRoot: `${repoRoot}backend`,
      depsLockFilePath: `${repoRoot}backend/package-lock.json`,
      bundling: { target: "node22", minify: true, sourceMap: false },
      environment: {
        SUBSCRIBERS_TABLE: subscribers.tableName,
        LINKS_TABLE: links.tableName,
        ANSWERS_TABLE: answers.tableName,
        RECORDERS_TABLE: recorders.tableName,
        EVENTS_TABLE: events.tableName,
        LIMITS_TABLE: limits.tableName,
        RECORDER_KEY_ID: recorderKey.keyArn,
        FROM_ADDRESS: props.fromAddress,
        REPLY_TO: props.replyTo,
        SITE_URL_PARAM: siteUrlParam,
        ORIGIN_SECRET: originSecret,
      },
    };
    const fn = (name: string, handler: string, extra: Partial<nodejs.NodejsFunctionProps> = {}) => new nodejs.NodejsFunction(this, name, {
      ...common,
      ...extra,
      functionName: `tma-${stage}-${name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`,
      handler,
      logGroup: new logs.LogGroup(this, name + "Logs", { retention: logs.RetentionDays.THREE_MONTHS, removalPolicy }),
    });

    const apiFn = fn("Api", "apiHandler");
    const mailerFn = fn("RecorderMailer", "recorderMailerHandler");
    const exportFn = fn("Export", "exportHandler", { timeout: cdk.Duration.seconds(60), memorySize: 512 });
    const senderFn = fn("Sender", "sendFileHandler", { timeout: cdk.Duration.minutes(5) });
    const followUpFn = fn("FollowUp", "followUpHandler", { timeout: cdk.Duration.minutes(5) });

    // Every morning at about 9am UK time, send any 30-day follow-ups that are due.
    new eventbridge.Rule(this, "FollowUpEveryMorning", {
      schedule: eventbridge.Schedule.cron({ minute: "7", hour: "9" }), // 09:07 UTC
      targets: [new targets.LambdaFunction(followUpFn)],
    });

    // Who may do what. Each part gets only what it needs.
    for (const t of [subscribers, links, answers, recorders, events, limits]) t.grantReadWriteData(apiFn);
    subscribers.grantReadData(mailerFn);
    recorders.grantReadData(mailerFn);
    links.grantReadWriteData(mailerFn); // checks the link, and adds a fresh unsubscribe link to the email
    limits.grantReadWriteData(mailerFn);
    for (const t of [subscribers, answers, events]) t.grantReadData(exportFn); // never recorders
    subscribers.grantReadData(senderFn);
    links.grantWriteData(senderFn); // creates each reader's personal link
    events.grantWriteData(senderFn); // records "sent", for the summary
    subscribers.grantReadData(followUpFn);
    answers.grantReadWriteData(followUpFn); // finds follow-ups due, and marks them sent
    links.grantWriteData(followUpFn); // the "did you do it?" link
    events.grantWriteData(followUpFn);

    // The API can only lock flight recorders; only the mailer can unlock them.
    recorderKey.grant(apiFn, "kms:GenerateDataKey");
    recorderKey.grant(mailerFn, "kms:Decrypt");

    const sendEmail = new iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: [this.formatArn({ service: "ses", resource: "identity", resourceName: "*" })],
    });
    const readSiteUrl = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [this.formatArn({ service: "ssm", resource: "parameter", resourceName: siteUrlParam.slice(1) })],
    });
    for (const f of [apiFn, mailerFn, senderFn, followUpFn]) {
      f.addToRolePolicy(sendEmail);
      f.addToRolePolicy(readSiteUrl);
    }
    // The check before every send: SES's account status and the bounce and complaint
    // rates. Read-only; these AWS actions can't be limited to one resource.
    const readSendingHealth = new iam.PolicyStatement({ actions: ["ses:GetAccount", "cloudwatch:GetMetricData"], resources: ["*"] });
    for (const f of [senderFn, followUpFn]) f.addToRolePolicy(readSendingHealth);

    // ---------- Web address for the code (API) ----------

    const api = new apigw.HttpApi(this, "HttpApi", { apiName: `tma-${stage}`, createDefaultStage: false });
    new apigw.HttpStage(this, "ApiStage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 20, burstLimit: 40 }, // a ceiling on requests per second, against floods
    });
    api.addRoutes({ path: "/api/{proxy+}", methods: [apigw.HttpMethod.ANY], integration: new integrations.HttpLambdaIntegration("ApiIntegration", apiFn) });
    api.addRoutes({ path: "/api/file/recorder/email", methods: [apigw.HttpMethod.POST], integration: new integrations.HttpLambdaIntegration("MailerIntegration", mailerFn) });

    // ---------- The website ----------

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // only CloudFront can read it
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Only the site's own files, rebuilt from the project on every deploy: no reader data.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      responseHeadersPolicyName: `tma-${stage}-security-headers`,
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: false, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()", override: true }],
      },
    });

    // Passes our personal-link header (and the rest of the request) through to the API.
    const apiRequests = new cloudfront.OriginRequestPolicy(this, "ApiRequests", {
      originRequestPolicyName: `tma-${stage}-api-requests`,
      // CloudFront-Viewer-Address is the visitor's own internet address, added by CloudFront.
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList("X-TMA-Link", "Content-Type", "CloudFront-Viewer-Address"),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.none(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    const distribution = new cloudfront.Distribution(this, "Site", {
      comment: `The Monday After (${stage})`,
      defaultRootObject: "signup.html", // the bare web address shows the sign-up page; files open at /index.html
      // A friendly "page not found" instead of a bare AWS error. (S3 answers 403 for
      // missing files.) This applies to the API too, so the API avoids 403/404 for
      // anything a reader needs to read.
      errorResponses: [403, 404].map((httpStatus) => ({ httpStatus, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: cdk.Duration.minutes(5) })),
      ...(props.webAddress
        ? {
            domainNames: [props.webAddress.domainName],
            certificate: acm.Certificate.fromCertificateArn(this, "WebAddressCertificate", props.webAddress.certificateArn),
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021, // modern, secure connections only
          }
        : {}),
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Europe and North America edges only: cheapest
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(`${api.apiId}.execute-api.${this.region}.${this.urlSuffix}`, {
            customHeaders: { "X-TMA-Origin": originSecret },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiRequests,
          responseHeadersPolicy: headers,
        },
      },
    });

    new s3deploy.BucketDeployment(this, "SiteFiles", {
      sources: [s3deploy.Source.asset(`${repoRoot}site`, { exclude: ["preview", "preview/*"] })],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      cacheControl: [s3deploy.CacheControl.fromString("public, max-age=300")],
      memoryLimit: 256,
    });

    const siteUrl = props.webAddress ? `https://${props.webAddress.domainName}` : `https://${distribution.distributionDomainName}`;
    new ssm.StringParameter(this, "SiteUrl", { parameterName: siteUrlParam, stringValue: siteUrl });

    // ---------- The owner's spreadsheets ----------

    const exportBucket = new s3.Bucket(this, "ExportBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }], // exports delete themselves after a week
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    exportBucket.grantPut(exportFn);
    exportFn.addEnvironment("EXPORT_BUCKET", exportBucket.bucketName);

    new cdk.CfnOutput(this, "SiteAddress", { value: siteUrl, description: "Open this to see the site" });
    new cdk.CfnOutput(this, "SignUpPage", { value: `${siteUrl}/signup.html` });
    if (props.webAddress) {
      // The record the owner adds in Squarespace so the address reaches this site.
      const host = props.webAddress.domainName.split(".")[0];
      new cdk.CfnOutput(this, "WebAddressRecord", { value: cdk.Fn.join(" | ", ["CNAME", host, distribution.distributionDomainName, ""]), description: "Type | Host | Value | Priority" });
    }
    new cdk.CfnOutput(this, "ExportBucketName", { value: exportBucket.bucketName });
    new cdk.CfnOutput(this, "ExportFunctionName", { value: exportFn.functionName });
    new cdk.CfnOutput(this, "SenderFunctionName", { value: senderFn.functionName });
  }
}
