// Checks on requests arriving from CloudFront, the delivery network in front of
// the site. Kept separate from lambda.ts so they can be tested without AWS.

import { timingSafeEqual } from "node:crypto";

// CloudFront adds a secret marker header to every request it passes on. Anything
// without it came straight to the API's own address, bypassing CloudFront, and
// is refused. That also means the visitor-address header below can be trusted.
export function cameThroughCloudFront(headers: Record<string, string | undefined>, secret: string | undefined): boolean {
  if (!secret) return true; // not configured (local preview and tests)
  const given = Buffer.from(headers["x-tma-origin"] || "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The visitor's own internet address, which CloudFront passes on as "address:port".
// Without it, the API would only see CloudFront's address, shared by many readers.
export function visitorAddress(headers: Record<string, string | undefined>, fallback: string): string {
  const v = headers["cloudfront-viewer-address"];
  if (!v) return fallback;
  const i = v.lastIndexOf(":");
  return i > 0 ? v.slice(0, i) : v;
}
