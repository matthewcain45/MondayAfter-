// Plain-text emails sent by the system. The monthly scenario email itself is
// built in Phase 6.

import type { Email } from "./types.ts";

function footer(manageUrl: string): string {
  return [
    "",
    "--",
    "The Monday After, from Capstone Global Advisory.",
    "Take a break, unsubscribe or delete your data: " + manageUrl,
  ].join("\n");
}

export function confirmEmail(to: string, brand: string, confirmUrl: string): Email {
  return {
    to,
    subject: "Confirm your email for " + brand,
    text: [
      "Someone (hopefully you) asked to receive " + brand + ", a short monthly incident file for technology leaders.",
      "",
      "Confirm your email here:",
      confirmUrl,
      "",
      "This link works for 24 hours. If you didn't ask for this, ignore this email and nothing more will happen: we delete unconfirmed sign-ups after 7 days.",
    ].join("\n"),
  };
}

export interface FileEmailContent {
  subject: string;
  time: string;
  paragraphs: string[];
  question: string;
  button: string;
  footnote: string;
}

// Plain-text version of the monthly email (screen 1). Phase 6 adds the designed version.
export function fileEmail(to: string, c: FileEmailContent, fileUrl: string, manageUrl: string): Email {
  return {
    to,
    subject: c.subject,
    text: [
      c.subject,
      "",
      c.time,
      "",
      ...c.paragraphs.flatMap((p) => [p, ""]),
      c.question,
      "",
      c.button.replace(/\s*→\s*$/, "") + ":",
      fileUrl,
      "",
      c.footnote,
      "This link is personal to you. Please don't forward it; use Share this file at the end instead.",
      footer(manageUrl),
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
      "Only you can see this. " + brand + " team can't read your flight recorder.",
      footer(manageUrl),
    ].join("\n"),
  };
}

// The 30-day follow-up, sent once, only to readers who ticked "Ask me in 30 days".
export function followUpEmail(to: string, fileTitle: string, action: string, answerUrl: string, manageUrl: string): Email {
  return {
    to,
    subject: "Did you do it? " + fileTitle,
    text: [
      "30 days ago, at the end of " + fileTitle + ", you chose one thing to take back:",
      "",
      action,
      "",
      "Did you do it? Tell us with one tap:",
      answerUrl,
      "",
      "Your answer is kept with your other answers for this file. This is the only reminder we'll send about it.",
      footer(manageUrl),
    ].join("\n"),
  };
}
