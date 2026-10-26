import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cameThroughCloudFront, visitorAddress } from "../src/edge.ts";

describe("requests from CloudFront", () => {
  it("refuses requests without CloudFront's secret marker", () => {
    assert.equal(cameThroughCloudFront({}, "s3cret-marker"), false);
    assert.equal(cameThroughCloudFront({ "x-tma-origin": "wrong" }, "s3cret-marker"), false);
    assert.equal(cameThroughCloudFront({ "x-tma-origin": "s3cret-marker" }, "s3cret-marker"), true);
  });

  it("allows everything when no marker is configured (local preview)", () => {
    assert.equal(cameThroughCloudFront({}, undefined), true);
  });

  it("reads the visitor's own address, for IPv4 and IPv6", () => {
    assert.equal(visitorAddress({ "cloudfront-viewer-address": "203.0.113.7:46532" }, "198.51.100.1"), "203.0.113.7");
    assert.equal(visitorAddress({ "cloudfront-viewer-address": "2001:db8::1:46532" }, "198.51.100.1"), "2001:db8::1");
    assert.equal(visitorAddress({}, "198.51.100.1"), "198.51.100.1");
  });
});
