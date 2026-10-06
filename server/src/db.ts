/**
 * The MongoDB connection, plus the indexes the API needs.
 *
 * One client for the whole server, reused by every request: connecting is
 * slow, so doing it per request would make every request slow.
 */

import { MongoClient } from "mongodb";
import type { Collection, Db } from "mongodb";

/** A person with an account. The password itself is never stored. */
export interface UserDoc {
  _id?: unknown;
  email: string; // lowercased, so Landon@x.com and landon@x.com are one account
  passwordHash: string; // "salt:hash", see auth.ts
  createdAt: Date;
}

/** A signed-in session. The token is stored hashed, like a password. */
export interface SessionDoc {
  _id?: unknown;
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * One lab, as the server keeps it.
 *
 * Note the shape: on the app's own disk a lab is spread over six SQLite
 * tables, but here the whole thing is one document. The server never needs
 * to query inside a lab — it hands labs out and takes them back whole — and
 * sync compares whole labs, so splitting them up would buy nothing.
 */
export interface LabDoc {
  _id?: unknown;
  userId: string; // who owns it; every query filters on this
  title: string;
  course: string;
  info: Record<string, string>;
  content: Record<string, string>;
  tables: unknown[];
  calculations: unknown[];
  questions: unknown[];
  appUpdatedAt: string; // when the APP last changed it — decides who wins
  updatedAt: Date; // when the SERVER last wrote it — used by ?since=
  deleted: boolean; // a tombstone, so other devices learn about deletions
}

let db: Db | null = null;

export async function connect(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing — check server/.env");

  // Without this the driver spends 30 seconds deciding a database is
  // unreachable, and the app just sits there. Ten is long enough for a slow
  // link and short enough to tell someone the truth.
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  db = client.db("labfiller");

  // Indexes, created once on startup.
  //   unique email  -> two accounts can never share an address, enforced by
  //                    the database rather than by remembering to check
  //   sessions TTL  -> Mongo deletes expired sessions by itself
  //   labs by user  -> the query every lab route runs
  await db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true });
  await db.collection<SessionDoc>("sessions").createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection<SessionDoc>("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection<LabDoc>("labs").createIndex({ userId: 1, updatedAt: -1 });

  return db;
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await connect()).collection<UserDoc>("users");
}

export async function sessions(): Promise<Collection<SessionDoc>> {
  return (await connect()).collection<SessionDoc>("sessions");
}

export async function labs(): Promise<Collection<LabDoc>> {
  return (await connect()).collection<LabDoc>("labs");
}
