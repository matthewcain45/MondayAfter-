// Lets AWS send email as @capstoneglobaladvisory.com, with the domain vouching
// for it, so Gmail and Outlook trust The Monday After's emails. Shared by the
// test and live copies (a domain can be set up once per account and region).
//
// The DNS records this needs are added by the owner in Squarespace. They are
// shown on the Deploy button's summary page. Only new records, never changes.

import cdk from "aws-cdk-lib";
import ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";

export interface EmailProps extends cdk.StackProps {
  domain: string; // e.g. capstoneglobaladvisory.com
  mailFromHost: string; // bounce-handling subdomain, e.g. tma-mail
}

// What to type into Squarespace: a host (the part before the domain) and its value.
export interface DnsRecord {
  type: "CNAME" | "MX" | "TXT";
  host: string;
  value: string;
  priority?: number;
}

export class EmailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EmailProps) {
    super(scope, id, props);
    const { domain, mailFromHost } = props;

    const identity = new ses.EmailIdentity(this, "Domain", {
      identity: ses.Identity.domain(domain),
      dkimSigning: true, // AWS signs each email; the domain publishes the matching keys
      mailFromDomain: `${mailFromHost}.${domain}`,
      // If the bounce records are missing, fall back to AWS's own address rather than fail.
      mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
    });

    const hostOf = (fullName: string) => cdk.Fn.select(0, cdk.Fn.split(`.${domain}`, fullName));
    const records: DnsRecord[] = [
      { type: "CNAME", host: hostOf(identity.dkimDnsTokenName1), value: identity.dkimDnsTokenValue1 },
      { type: "CNAME", host: hostOf(identity.dkimDnsTokenName2), value: identity.dkimDnsTokenValue2 },
      { type: "CNAME", host: hostOf(identity.dkimDnsTokenName3), value: identity.dkimDnsTokenValue3 },
      { type: "MX", host: mailFromHost, value: `feedback-smtp.${this.region}.amazonses.com`, priority: 10 },
      { type: "TXT", host: mailFromHost, value: "v=spf1 include:amazonses.com ~all" },
      { type: "TXT", host: "_dmarc", value: "v=DMARC1; p=none" }, // monitor only, approved by the owner
    ];
    records.forEach((r, i) => {
      new cdk.CfnOutput(this, `DnsRecord${i + 1}`, {
        value: cdk.Fn.join(" | ", [r.type, r.host, r.value, r.priority ? String(r.priority) : ""]),
        description: "Type | Host | Value | Priority",
      });
    });
  }
}
