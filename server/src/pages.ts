/**
 * The maths-page routes: pull, push, delete.
 *
 * The same four moves as labs, against a different collection. THE ONE RULE
 * is the same too: every query filters on userId taken from the session,
 * never from anything the caller sent.
 *
 * Why this isn't shared code with labs.ts: the two collections store
 * different things, and the one thing they have in common — the sync rules —
 * is six lines. A generic "syncable resource" layer would be harder to read
 * than both files put together, and a mistake in it would be a mistake in
 * both.
 */

import type { RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { pages } from "./db.js";
import type { PageDoc } from "./db.js";
import type { WithUser } from "./auth.js";

function userOf(request: unknown): string {
  return (request as WithUser).userId;
}

interface PageBody {
  title?: unknown;
  degrees?: unknown;
  variables?: unknown;
  lines?: unknown;
  curves?: unknown;
  appUpdatedAt?: unknown;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Nothing from the request is trusted as-is.
 *
 * The caps matter: without them one request could store a hundred thousand
 * lines and make every later read of that account slow. 2000 lines is far
 * more than a page of homework and far less than a problem.
 */
function clean(body: PageBody): Omit<PageDoc, "_id" | "userId" | "updatedAt" | "deleted"> {
  return {
    title: asText(body.title).slice(0, 300),
    degrees: body.degrees !== false,
    variables: Array.isArray(body.variables) ? body.variables.slice(0, 200) : [],
    lines: Array.isArray(body.lines) ? body.lines.slice(0, 2000) : [],
    curves: Array.isArray(body.curves) ? body.curves.slice(0, 50) : [],
    appUpdatedAt: asText(body.appUpdatedAt) || new Date().toISOString(),
  };
}

/** GET /pages?since=<ISO date> — everything of mine, or just what changed. */
export const listPages: RequestHandler = async (request, response) => {
  const filter: Record<string, unknown> = { userId: userOf(request) };
  const since = request.query.since;
  if (typeof since === "string") {
    const when = new Date(since);
    if (!Number.isNaN(when.getTime())) filter.updatedAt = { $gt: when };
  }

  const found = await (await pages()).find(filter).sort({ updatedAt: -1 }).limit(500).toArray();
  response.json({
    pages: found.map((page) => ({
      id: String(page._id),
      title: page.title,
      degrees: page.degrees,
      variables: page.variables,
      lines: page.lines,
      curves: page.curves,
      appUpdatedAt: page.appUpdatedAt,
      updatedAt: page.updatedAt.toISOString(),
      deleted: page.deleted,
    })),
    serverTime: new Date().toISOString(),
  });
};

/** POST /pages — a page this device has never pushed before. */
export const createPage: RequestHandler = async (request, response) => {
  const now = new Date();
  const result = await (await pages()).insertOne({
    userId: userOf(request),
    ...clean(request.body ?? {}),
    updatedAt: now,
    deleted: false,
  });
  response.json({ id: String(result.insertedId), updatedAt: now.toISOString() });
};

/**
 * PUT /pages/:id — replace a page that already exists up here.
 *
 * The filter has both _id AND userId. With only _id, anyone could overwrite
 * any page whose id they guessed; with both, a wrong owner matches nothing.
 */
export const updatePage: RequestHandler = async (request, response) => {
  const raw = String(request.params.id);
  const id = ObjectId.isValid(raw) ? new ObjectId(raw) : null;
  if (!id) {
    response.status(400).json({ error: "Not a valid page id." });
    return;
  }

  const body = clean(request.body ?? {});
  const now = new Date();
  const existing = await (await pages()).findOne({ _id: id, userId: userOf(request) });
  if (!existing) {
    response.status(404).json({ error: "No page of yours with that id." });
    return;
  }

  // Last write wins, and "last" means when the APP changed it, not when the
  // request arrived — otherwise a slow upload could beat a newer edit.
  if (existing.appUpdatedAt > body.appUpdatedAt) {
    response.json({
      id: String(id),
      updatedAt: existing.updatedAt.toISOString(),
      kept: "server",
    });
    return;
  }

  await (await pages()).updateOne(
    { _id: id, userId: userOf(request) },
    { $set: { ...body, updatedAt: now, deleted: false } },
  );
  response.json({ id: String(id), updatedAt: now.toISOString(), kept: "yours" });
};

/**
 * DELETE /pages/:id
 *
 * A tombstone, not a real delete: the row stays with deleted: true so the
 * next sync on another device learns it went. A hard delete would look
 * exactly like "never synced", and the other device would push it back.
 */
export const deletePage: RequestHandler = async (request, response) => {
  const raw = String(request.params.id);
  const id = ObjectId.isValid(raw) ? new ObjectId(raw) : null;
  if (!id) {
    response.status(400).json({ error: "Not a valid page id." });
    return;
  }
  const now = new Date();
  const result = await (await pages()).updateOne(
    { _id: id, userId: userOf(request) },
    {
      $set: {
        deleted: true,
        updatedAt: now,
        appUpdatedAt: now.toISOString(),
        // The working goes, so a deleted page isn't still sitting up here.
        title: "",
        variables: [],
        lines: [],
        curves: [],
      },
    },
  );
  if (result.matchedCount === 0) {
    response.status(404).json({ error: "No page of yours with that id." });
    return;
  }
  response.json({ ok: true, updatedAt: now.toISOString() });
};
