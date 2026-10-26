// Settings that shape privacy and security. Changing any of these is an
// "ask first" decision (see CLAUDE.md).

const DAY = 24 * 60 * 60;

export const LIMITS = {
  confirmLinkSeconds: 1 * DAY, // "confirm your email" link
  fileLinkSeconds: 90 * DAY, // the monthly magic link
  manageLinkSeconds: 730 * DAY, // unsubscribe / delete-my-data link in every email
  pendingSignupSeconds: 7 * DAY, // unconfirmed sign-ups are deleted after this
  retentionSeconds: 730 * DAY, // keep data for 2 years
  pauseSeconds: 91 * DAY, // "take a break" pauses the monthly emails for about 3 months

  signupsPerIpPerHour: 5,
  signupsPerEmailPerDay: 3,
  requestsPerLinkPerHour: 600,
  recorderEmailsPerDay: 3,

  recorderFieldChars: 1000,
  stateBytes: 16 * 1024,
};

export interface Settings {
  siteUrl: string; // e.g. https://themondayafter.capstoneglobaladvisory.com
  brand: string;
}

export const DEFAULT_SETTINGS: Settings = {
  siteUrl: "http://localhost:8080",
  brand: "The Monday After",
};
