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
  expiresAt: number; // epoch seconds; the database deletes the record after this
}

export type LinkPurpose = "confirm" | "file" | "manage";

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
  expiresAt: number;
}

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
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

export interface Clock {
  now(): Date;
}
