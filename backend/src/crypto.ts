// Tokens for magic links, and sealing (encrypting) flight recorder text.

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { KeyService } from "./types.ts";

// 32 random bytes: far too many possibilities to guess.
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// We store only this one-way scrambled version, so a leaked database can't be
// used to open anyone's file.
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function hashForLimit(value: string): string {
  return createHash("sha256").update("tma-limit:" + value, "utf8").digest("base64url").slice(0, 32);
}

export const newId = (): string => randomUUID();

// Envelope encryption: the key service hands out a one-off key, we encrypt
// with it (AES-256-GCM), and keep only the locked copy of that key alongside.
export async function seal(keys: KeyService, plaintext: string, context: Record<string, string>): Promise<string> {
  const { plain, encrypted } = await keys.generateDataKey(context);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", plain, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(context)));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  plain.fill(0);
  return [Buffer.from(encrypted), iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export async function unseal(keys: KeyService, sealed: string, context: Record<string, string>): Promise<string> {
  if (!keys.decryptDataKey) throw new Error("This part of the system is not allowed to unlock flight recorders");
  const [k, iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const plain = await keys.decryptDataKey(k, context);
  const decipher = createDecipheriv("aes-256-gcm", plain, iv);
  decipher.setAAD(Buffer.from(JSON.stringify(context)));
  decipher.setAuthTag(tag);
  const text = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  plain.fill(0);
  return text;
}
