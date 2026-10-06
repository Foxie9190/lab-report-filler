/**
 * The API the app talks to.
 *
 * Why this exists at all: the desktop app can never talk to MongoDB
 * directly. The connection string would have to ship inside the app, and
 * anyone could pull it out and read or delete everyone's labs. The string
 * lives here instead, on a machine you control, and this server only ever
 * answers requests it recognises — each one tied to a signed-in account.
 *
 *     npm run dev     # restarts on save
 *     npm start       # plain run
 */

import "dotenv/config";
import express from "express";
import { connect } from "./db.js";
import { login, logout, me, requireUser, signup } from "./auth.js";
import { createLab, deleteLab, listLabs, updateLab } from "./labs.js";

const app = express();

// A lab is text, so 1mb is generous. Without a limit, one request could try
// to hand the server a gigabyte.
app.use(express.json({ limit: "1mb" }));

/*
 * The app isn't a web page on a domain — in the Tauri window its origin is
 * tauri://localhost, and in `npm run dev` it's localhost:1420. Rather than
 * listing those, any origin is allowed to CALL the API, because being
 * allowed to call it is worth nothing without a token: every real route
 * needs an Authorization header, and headers aren't sent automatically the
 * way cookies are. That's also why there's no CSRF protection to write —
 * there are no cookies to ride on.
 */
app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (request.method === "OPTIONS") {
    response.sendStatus(204); // the browser's "may I?" request
    return;
  }
  next();
});

/** Is the server up, and can it reach the database? */
app.get("/health", async (_request, response) => {
  try {
    const db = await connect();
    await db.command({ ping: 1 });
    response.json({ ok: true, database: "reachable" });
  } catch (err) {
    // The reason goes to the server's log, not the reply: database errors
    // can describe how things are set up.
    console.error("health check failed", err);
    response.status(500).json({ ok: false });
  }
});

app.post("/auth/signup", signup);
app.post("/auth/login", login);
app.post("/auth/logout", logout);
app.get("/me", requireUser, me);

// Everything below needs a signed-in account.
app.get("/labs", requireUser, listLabs);
app.post("/labs", requireUser, createLab);
app.put("/labs/:id", requireUser, updateLab);
app.delete("/labs/:id", requireUser, deleteLab);

// A thrown error anywhere above lands here instead of killing the process.
app.use((err: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("unhandled", err);
  response.status(500).json({ error: "Something went wrong." });
});

// The host picks the port when this runs on a server — Render, Fly and the
// rest all hand it over in PORT. 8787 is only the fallback for your own Mac.
const PORT = Number(process.env.PORT ?? 8787);

connect()
  .then(() => console.log("database reachable, indexes ready"))
  .catch((err) => console.error("could not reach the database yet:", (err as Error).message));

app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
