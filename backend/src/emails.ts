// Plain-text emails sent by the system. The monthly scenario email itself is
// built in Phase 6.

import type { Email } from "./types.ts";

function footer(manageUrl: string): string {
  return [
    "",
    "--",
    "The Monday After, from Capstone Global Advisory.",
    "Unsubscribe or delete your data: " + manageUrl,
  ].join("\n");
}

export function confirmEmail(to: string, brand: string, confirmUrl: string): Email {
  return {
    to,
    subject: "Confirm your email for " + brand,
    text: [
      "Someone (hopefully you) asked to receive " + brand + ", a short monthly incident file for aspiring CIOs.",
      "",
      "Confirm your email here:",
      confirmUrl,
      "",
      "This link works for 24 hours. If you didn't ask for this, ignore this email and nothing more will happen: we delete unconfirmed sign-ups after 7 days.",
    ].join("\n"),
  };
}

export function recorderEmail(to: string, brand: string, fileTitle: string, savedAt: string, entries: { label: string; text: string }[], manageUrl: string): Email {
  const when = new Date(savedAt).toUTCString().replace(" GMT", " UTC");
  return {
    to,
    subject: "Your flight recorder: " + fileTitle,
    text: [
      "Here is what you wrote in your flight recorder for " + fileTitle + ", saved " + when + ".",
      "When the next incident hits, compare it with what you actually do.",
      "",
      ...entries.flatMap((e) => [e.label.toUpperCase(), e.text || "(left blank)", ""]),
      "Only you can see this. The author of " + brand + " can't read your flight recorder.",
      footer(manageUrl),
    ].join("\n"),
  };
}
