// The check before every send, as promised to AWS: is the account healthy, and
// are bounce and complaint rates below our limits? If not, nothing is sent.

import { SENDING_LIMITS } from "./config.ts";
import type { SendingHealthSource } from "./types.ts";

export interface SendingHealth {
  ok: boolean;
  reasons: string[]; // plain-English reasons sending was stopped
  bounceRate: number | null;
  complaintRate: number | null;
}

const pct = (r: number) => (r * 100).toFixed(2).replace(/\.?0+$/, "") + "%";

export async function checkSendingHealth(source: SendingHealthSource): Promise<SendingHealth> {
  const h = await source.read();
  const reasons: string[] = [];
  if (!h.sendingEnabled) reasons.push("AWS has paused sending for this account.");
  if (h.enforcement !== "HEALTHY") reasons.push("AWS says the account needs attention (status: " + h.enforcement.toLowerCase() + ").");
  if (h.bounceRate !== null && h.bounceRate >= SENDING_LIMITS.maxBounceRate) reasons.push(`Bounce rate is ${pct(h.bounceRate)}; the limit is ${pct(SENDING_LIMITS.maxBounceRate)}.`);
  if (h.complaintRate !== null && h.complaintRate >= SENDING_LIMITS.maxComplaintRate) reasons.push(`Complaint rate is ${pct(h.complaintRate)}; the limit is ${pct(SENDING_LIMITS.maxComplaintRate)}.`);
  return { ok: reasons.length === 0, reasons, bounceRate: h.bounceRate, complaintRate: h.complaintRate };
}

export const describeRate = (r: number | null) => (r === null ? "no data yet" : pct(r));
