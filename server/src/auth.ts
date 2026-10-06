/**
 * Accounts: signing up, signing in, and knowing who is asking.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP:
 *
 * 1. The password is never stored. What's stored is a scrypt hash with a
 *    random salt, so even with a copy of the database nobody can read the
 *    passwords back out. scrypt is deliberately slow and memory-hungry,
 *    which is what makes guessing expensive.
 *
 * 2. The session token is never stored either — only its hash. If the
 *    database leaked, the tokens in it still couldn't be used to sign in.
 *
 * Node's own crypto does all of this, so there's no password library to
 * keep up to date.
 */

import { randomBytes, scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ObjectId } from "mongodb";
import type { RequestHandler } from "express";
import { sessions, users } from "./db.js";

const scryptAsync = promisify(scrypt);

const SESSION_DAYS = 30;
const MIN_PASSWORD = 8;

/** "salt:hash", both hex. The salt is random per password. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Check a password against a stored hash.
 *
 * timingSafeEqual, not ===, because === stops at the first wrong byte. How
 * long the comparison takes would then leak how much of the hash was right.
 */
async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Tokens are long random strings; only their hash goes in the database. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function newSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await (await sessions()).insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
  return token;
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 254;
}

/**
 * A crude limit on sign-in attempts, kept in memory.
 *
 * It stops someone trying thousands of passwords a minute. It resets when
 * the server restarts, and it can't see other servers — fine for one small
 * server, and far better than nothing.
 */
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key: string): boolean {
  const found = attempts.get(key);
  if (!found || Date.now() > found.until) return false;
  return found.count >= MAX_ATTEMPTS;
}

function countAttempt(key: string): void {
  const found = attempts.get(key);
  if (!found || Date.now() > found.until) {
    attempts.set(key, { count: 1, until: Date.now() + WINDOW });
    return;
  }
  found.count++;
}

/** POST /auth/signup  { email, password } */
export const signup: RequestHandler = async (request, response) => {
  const { email, password } = request.body ?? {};
  if (!looksLikeEmail(email)) {
    response.status(400).json({ error: "That doesn't look like an email address." });
    return;
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    response.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the password.` });
    return;
  }

  const address = email.trim().toLowerCase();
  try {
    const result = await (await users()).insertOne({
      email: address,
      passwordHash: await hashPassword(password),
      createdAt: new Date(),
    });
    const userId = String(result.insertedId);
    response.json({ token: await newSession(userId), user: { id: userId, email: address } });
  } catch (err) {
    // 11000 is Mongo's "unique index violated" — the email is taken.
    if ((err as { code?: number }).code === 11000) {
      response.status(409).json({ error: "There's already an account with that email." });
      return;
    }
    console.error("signup failed", err);
    response.status(500).json({ error: "Couldn't create the account." });
  }
};

/** POST /auth/login  { email, password } */
export const login: RequestHandler = async (request, response) => {
  const { email, password } = request.body ?? {};
  const key = request.ip ?? "unknown";

  if (tooManyAttempts(key)) {
    response.status(429).json({ error: "Too many tries. Wait a few minutes." });
    return;
  }
  if (typeof email !== "string" || typeof password !== "string") {
    response.status(400).json({ error: "Email and password are both needed." });
    return;
  }

  const found = await (await users()).findOne({ email: email.trim().toLowerCase() });
  // Same message whether the email is unknown or the password is wrong:
  // "no account with that email" tells an attacker which emails exist.
  const ok = found ? await passwordMatches(password, found.passwordHash) : false;
  if (!found || !ok) {
    countAttempt(key);
    response.status(401).json({ error: "Email or password is wrong." });
    return;
  }

  const userId = String(found._id);
  response.json({ token: await newSession(userId), user: { id: userId, email: found.email } });
};

/** POST /auth/logout — throws away this one session, not the others. */
export const logout: RequestHandler = async (request, response) => {
  const token = bearer(request.headers.authorization);
  if (token) await (await sessions()).deleteOne({ tokenHash: hashToken(token) });
  response.json({ ok: true });
};

function bearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token === "" ? null : token;
}

/** Express doesn't know about our users, so the type gets widened here. */
export interface WithUser {
  userId: string;
}

/**
 * Gatekeeper for every route that touches someone's data.
 *
 * It turns a token into a user id, and nothing past it ever has to wonder
 * whether the caller is signed in.
 */
export const requireUser: RequestHandler = async (request, response, next) => {
  const token = bearer(request.headers.authorization);
  if (!token) {
    response.status(401).json({ error: "Not signed in." });
    return;
  }
  const session = await (await sessions()).findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    response.status(401).json({ error: "That session has expired. Sign in again." });
    return;
  }
  (request as typeof request & WithUser).userId = session.userId;
  next();
};

/** GET /me — who am I? Handy for checking a saved token still works. */
export const me: RequestHandler = async (request, response) => {
  const { userId } = request as typeof request & WithUser;
  const id = toId(userId);
  const found = id ? await (await users()).findOne({ _id: id }) : null;
  if (!found) {
    response.status(404).json({ error: "That account is gone." });
    return;
  }
  response.json({ user: { id: userId, email: found.email } });
};

/**
 * Mongo ids are ObjectId objects, not strings, so they have to be converted
 * back before a lookup. An id that isn't valid hex would throw, which would
 * be a 500 for what is really a bad request — so it returns null instead.
 */
export function toId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}
