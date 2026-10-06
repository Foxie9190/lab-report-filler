/**
 * The lab routes: pull, push, delete.
 *
 * THE ONE RULE: every query filters on userId, taken from the session —
 * never from anything the caller sent. A caller can ask for "lab 123", but
 * they get it only if lab 123 is theirs. That single habit is what keeps one
 * account out of another's labs.
 *
 * Sync is deliberately dumb: whole labs, newest appUpdatedAt wins. Clever
 * merging of two half-edited labs is a research project; last-write-wins is
 * a rule a person can predict.
 */

import type { RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { labs } from "./db.js";
import type { LabDoc } from "./db.js";
import type { WithUser } from "./auth.js";

function userOf(request: unknown): string {
  return (request as WithUser).userId;
}

/** What the app sends up for one lab. */
interface LabBody {
  title?: unknown;
  course?: unknown;
  info?: unknown;
  content?: unknown;
  tables?: unknown;
  calculations?: unknown;
  questions?: unknown;
  appUpdatedAt?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asObject(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Nothing from the request is trusted as-is. Anything missing or the wrong
 * type becomes an empty value rather than reaching the database, so a buggy
 * or hostile client can't store junk that breaks every later read.
 */
function clean(body: LabBody): Omit<LabDoc, "_id" | "userId" | "updatedAt" | "deleted"> {
  return {
    title: asText(body.title).slice(0, 300),
    course: asText(body.course).slice(0, 200),
    info: asObject(body.info),
    content: asObject(body.content),
    tables: asList(body.tables),
    calculations: asList(body.calculations),
    questions: asList(body.questions),
    appUpdatedAt: asText(body.appUpdatedAt) || new Date().toISOString(),
  };
}

/**
 * GET /labs?since=<ISO date>
 *
 * Everything of mine, or just what changed since a date. `since` is what
 * makes sync cheap: the second sync only carries what moved.
 */
export const listLabs: RequestHandler = async (request, response) => {
  const filter: Record<string, unknown> = { userId: userOf(request) };
  const since = request.query.since;
  if (typeof since === "string") {
    const when = new Date(since);
    if (!Number.isNaN(when.getTime())) filter.updatedAt = { $gt: when };
  }

  const found = await (await labs()).find(filter).sort({ updatedAt: -1 }).limit(500).toArray();
  response.json({
    labs: found.map((lab) => ({
      id: String(lab._id),
      title: lab.title,
      course: lab.course,
      info: lab.info,
      content: lab.content,
      tables: lab.tables,
      calculations: lab.calculations,
      questions: lab.questions,
      appUpdatedAt: lab.appUpdatedAt,
      updatedAt: lab.updatedAt.toISOString(),
      deleted: lab.deleted,
    })),
    serverTime: new Date().toISOString(),
  });
};

/** POST /labs — a lab this device has never pushed before. */
export const createLab: RequestHandler = async (request, response) => {
  const now = new Date();
  const result = await (await labs()).insertOne({
    userId: userOf(request),
    ...clean(request.body ?? {}),
    updatedAt: now,
    deleted: false,
  });
  response.json({ id: String(result.insertedId), updatedAt: now.toISOString() });
};

/**
 * PUT /labs/:id — replace a lab that already exists up here.
 *
 * The filter has both _id AND userId. With only _id, anyone could overwrite
 * any lab whose id they guessed; with both, a wrong owner simply matches
 * nothing and gets a 404.
 */
export const updateLab: RequestHandler = async (request, response) => {
  // String(): Express types a route parameter as possibly an array.
  const raw = String(request.params.id);
  const id = ObjectId.isValid(raw) ? new ObjectId(raw) : null;
  if (!id) {
    response.status(400).json({ error: "Not a valid lab id." });
    return;
  }

  const body = clean(request.body ?? {});
  const now = new Date();
  const existing = await (await labs()).findOne({ _id: id, userId: userOf(request) });
  if (!existing) {
    response.status(404).json({ error: "No lab of yours with that id." });
    return;
  }

  // Last write wins, and "last" means when the APP changed it, not when the
  // request arrived — otherwise a slow upload could beat a newer edit.
  if (existing.appUpdatedAt > body.appUpdatedAt) {
    response.json({
      id: String(id),
      updatedAt: existing.updatedAt.toISOString(),
      kept: "server",   // the app should take the server's copy instead
    });
    return;
  }

  await (await labs()).updateOne(
    { _id: id, userId: userOf(request) },
    { $set: { ...body, updatedAt: now, deleted: false } },
  );
  response.json({ id: String(id), updatedAt: now.toISOString(), kept: "yours" });
};

/**
 * DELETE /labs/:id
 *
 * A tombstone, not a real delete: the row stays with deleted: true so the
 * next sync on another device can learn it went. A hard delete would look
 * exactly like "never synced", and the other device would push it back.
 */
export const deleteLab: RequestHandler = async (request, response) => {
  const raw = String(request.params.id);
  const id = ObjectId.isValid(raw) ? new ObjectId(raw) : null;
  if (!id) {
    response.status(400).json({ error: "Not a valid lab id." });
    return;
  }
  const now = new Date();
  const result = await (await labs()).updateOne(
    { _id: id, userId: userOf(request) },
    {
      $set: {
        deleted: true,
        updatedAt: now,
        appUpdatedAt: now.toISOString(),
        // The contents go, so a deleted lab isn't still sitting up here.
        title: "",
        course: "",
        info: {},
        content: {},
        tables: [],
        calculations: [],
        questions: [],
      },
    },
  );
  if (result.matchedCount === 0) {
    response.status(404).json({ error: "No lab of yours with that id." });
    return;
  }
  response.json({ ok: true, updatedAt: now.toISOString() });
};
