# Putting the API on the internet

Right now the server runs on one Mac at `127.0.0.1:8787`, which means
accounts only work on that Mac. This puts it on a machine that is always
reachable, so a released copy of the app can sign in from anywhere.

Render's free plan is the one used here: no card, and a web service plus a
health check is all this needs. The catch is that a free service **falls
asleep after about 15 minutes with no traffic**, and the next request has to
wake it up — that first sign-in can take most of a minute. The app says so
instead of looking frozen (see `waking()` in `tauri/src/account.ts`).

## 1. Let the server reach the database

Atlas only answers machines on its allow list, and a free Render service has
no fixed address — it can come back on a different one after any restart.

* Atlas → **Network Access** → **Add IP Address** → **Allow access from
  anywhere** (`0.0.0.0/0`).

That sounds worse than it is: the allow list is the outer fence, not the
lock. Getting past it still leaves you needing the database user's password,
which only ever exists in `server/.env` and in Render's environment
variables. If that password is ever pasted somewhere it shouldn't be, change
it in Atlas and update it in both places.

## 2. Create the web service

Render → **New** → **Web Service** → connect the GitHub repo
`Foxie9190/lab-report-filler`.

| Setting | Value |
| --- | --- |
| Name | `lab-report-filler-api` |
| Language | Node |
| Branch | `main` |
| Root Directory | `server` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

The name matters: it decides the address. `lab-report-filler-api` becomes
`https://lab-report-filler-api.onrender.com`, which is what
`tauri/.env.production` already points at. A different name means editing
that one line.

Root Directory is what keeps Render out of the Tauri app — without it, it
would try to build the whole repo.

## 3. Give it the connection string

Still on the create screen (or **Environment** afterwards):

* **Add Environment Variable** → key `MONGODB_URI`, value: the same string
  that is in your local `server/.env`.

Copy it straight from that file into Render. It should not pass through a
chat window, a screenshot or a commit — anything that has been through one
of those should be treated as leaked and changed in Atlas.

`PORT` is not needed. Render sets it, and `src/server.ts` reads it.

## 4. Check it

Open `https://lab-report-filler-api.onrender.com/health`. The answer should
be:

```json
{ "ok": true, "database": "reachable" }
```

`{"ok":false}` means the server is up but can't get to Atlas — nearly always
step 1, or a wrong password in `MONGODB_URI`. Render's **Logs** tab says
which.

## 5. Build the app against it

Nothing to do by hand. `tauri/.env.production` holds the address, `vite
build` bakes it in, and the release workflow runs a production build, so the
next tagged version signs in to the hosted server. `npm run dev` ignores that
file and still talks to `127.0.0.1:8787`, so your own server stays the one
you develop against.

## What "free" means here

* The service sleeps after ~15 minutes of quiet and takes ~30–60 seconds to
  wake. Fine for a lab report app nobody uses at 3am.
* Free instance hours are a monthly pool, so one always-on service is about
  the whole allowance.
* Pinging it on a schedule to keep it awake works but spends those hours, and
  Render is not fond of it. Living with the wake-up is the honest option.

If it ever outgrows this, the paid instance is the same service without the
sleeping — no code change.
