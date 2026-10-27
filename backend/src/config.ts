// Settings that shape privacy and security. Changing any of these is an
// "ask first" decision (see CLAUDE.md).

const DAY = 24 * 60 * 60;

export const LIMITS = {
  confirmLinkSeconds: 1 * DAY, // "confirm your email" link
  fileLinkSeconds: 90 * DAY, // the monthly magic link
  manageLinkSeconds: 730 * DAY, // unsubscribe / delete-my-data link in every email
  followUpLinkSeconds: 30 * DAY, // the "did you do it?" link in the 30-day follow-up email
  pendingSignupSeconds: 7 * DAY, // unconfirmed sign-ups are deleted after this
  retentionSeconds: 730 * DAY, // keep data for 2 years
  pauseSeconds: 91 * DAY, // "take a break" pauses the monthly emails for about 3 months

  signupsPerIpPerHour: 5,
  signupsPerEmailPerDay: 3,
  signupsPerHourEveryone: 30, // stops the form being used to email thousands of strangers (approved 26 Oct 2026)
  requestsPerLinkPerHour: 600,
  recorderEmailsPerDay: 3,

  recorderFieldChars: 1000,
  stateBytes: 16 * 1024,
};

// Sending stops if either rate reaches these levels. AWS starts reviewing an
// account at 5% bounces or 0.1% complaints, so these leave a safety margin.
export const SENDING_LIMITS = {
  maxBounceRate: 0.04, // 4%
  maxComplaintRate: 0.0008, // 0.08%
};

export interface Settings {
  siteUrl: string; // e.g. https://themondayafter.capstoneglobaladvisory.com
  brand: string;
}

export const DEFAULT_SETTINGS: Settings = {
  siteUrl: "http://localhost:8080",
  brand: "The Monday After",
};
