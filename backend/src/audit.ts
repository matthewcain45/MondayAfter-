// Security notes: one short line for each security-relevant event, so problems
// can be noticed and looked into. Kept 90 days in the Lambda logs.
// Only fixed words and internal IDs go in: never an email address, a link,
// an internet address or anything a reader typed.

export type AuditDetails = Record<string, string | number | undefined>;
export type Audit = (event: string, details?: AuditDetails) => void;

export const noAudit: Audit = () => {};

export const consoleAudit: Audit = (event, details = {}) => {
  console.log(JSON.stringify({ audit: event, ...details }));
};
