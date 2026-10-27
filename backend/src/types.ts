// Shapes of the records we store, and the interfaces the service depends on.
// Each interface has an AWS version (adapters/aws-*.ts) and an in-memory
// version (adapters/memory.ts) used by tests and the local preview.

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  createdAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
  pausedUntil?: string; // no monthly files are sent before this date
  expiresAt: number; // epoch seconds; the database deletes the record after this
}

export type LinkPurpose = "confirm" | "file" | "manage" | "followup" | "unsubscribe";

export interface Link {
  tokenHash: string; // only a scrambled (hashed) version of the token is stored
  purpose: LinkPurpose;
  subscriberId: string;
  scenarioId?: string;
  createdAt: string;
  expiresAt: number;
}

export interface AnswersRecord {
  subscriberId: string;
  scenarioId: string;
  state: ReaderState;
  updatedAt: string;
  followUpDue?: string; // date the 30-day follow-up email is due, if opted in
  followUpSentAt?: string; // when it was sent (it's only ever sent once)
  followUpAnswer?: { answer: FollowUpAnswer; at: string }; // what the reader said
  expiresAt: number;
}

export type FollowUpAnswer = "done" | "partly" | "not-yet";

export interface RecorderRecord {
  subscriberId: string;
  scenarioId: string;
  sealed: string; // encrypted flight recorder text; never readable without the key
  savedAt: string;
  expiresAt: number;
}

export interface EventRecord {
  subscriberId: string;
  scenarioId: string;
  at: string;
  name: string;
  target?: string;
  expiresAt: number;
}

// What the reader's browser saves. Never contains flight recorder text.
export interface ReaderState {
  v: 1;
  answers: Record<string, string | string[]>;
  threads: Record<string, string>;
  pulled: string[];
  flags: string[];
  recorder: null | { skipped: true } | { saved: true; savedAt: string };
  takeBack: null | { skipped: true } | { item: string | null; when: string; followUp: boolean; draft?: boolean; savedAt?: string };
  closed?: boolean;
  reached: string[];
  last: string | null;
}

export interface Store {
  getSubscriber(id: string): Promise<Subscriber | undefined>;
  findSubscriberByEmail(email: string): Promise<Subscriber | undefined>;
  putSubscriber(s: Subscriber): Promise<void>;
  listSubscribers(): Promise<Subscriber[]>;
  deleteSubscriber(id: string): Promise<void>;

  putLink(l: Link): Promise<void>;
  getLink(tokenHash: string): Promise<Link | undefined>;
  deleteLink(tokenHash: string): Promise<void>;
  deleteLinksFor(subscriberId: string): Promise<void>;

  getAnswers(subscriberId: string, scenarioId: string): Promise<AnswersRecord | undefined>;
  putAnswers(a: AnswersRecord): Promise<void>;
  listAnswers(): Promise<AnswersRecord[]>;
  deleteAnswersFor(subscriberId: string): Promise<void>;

  getRecorder(subscriberId: string, scenarioId: string): Promise<RecorderRecord | undefined>;
  putRecorder(r: RecorderRecord): Promise<void>;
  deleteRecordersFor(subscriberId: string): Promise<void>;

  putEvent(e: EventRecord): Promise<void>;
  listEvents(): Promise<EventRecord[]>;
  deleteEventsFor(subscriberId: string): Promise<void>;

  // Counts hits on a key within a time window; used to limit how often
  // someone can submit. Returns the count including this hit.
  hit(key: string, windowSeconds: number): Promise<number>;
}

// Wraps the encryption key service (AWS KMS). The part of the system that
// saves flight recorders can only lock; only the "email it back" part can unlock.
export interface KeyService {
  generateDataKey(context: Record<string, string>): Promise<{ plain: Uint8Array; encrypted: Uint8Array }>;
  decryptDataKey?(encrypted: Uint8Array, context: Record<string, string>): Promise<Uint8Array>;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  // The address mail apps use for their own "Unsubscribe" button (one-click, RFC 8058).
  oneClickUnsubscribeUrl?: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

// Whether it's safe to send: SES's own view of the account, and the bounce and
// complaint rates AWS watches. Rates are fractions (0.01 = 1%); null = no data yet.
export interface SendingHealthSource {
  read(): Promise<{ sendingEnabled: boolean; enforcement: string; bounceRate: number | null; complaintRate: number | null }>;
}

export interface Clock {
  now(): Date;
}
