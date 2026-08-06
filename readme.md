# transmission-api

A small TypeScript/Express HTTP API that wraps Transmission's own RPC
interface, so you can monitor and control your `transmission-daemon` (or
Transmission's built-in web server) over regular REST calls.

## How it works

Transmission daemons expose a JSON-RPC endpoint (default
`http://localhost:9091/transmission/rpc`) that uses a CSRF-style session
token: the first request gets rejected with `409` and a
`X-Transmission-Session-Id` header, which must be echoed on every request
after that. `src/transmissionClient.ts` handles this handshake
automatically, so the rest of the app just calls plain async methods like
`client.listTorrents()`.

## Setup

1. Make sure `transmission-daemon` is running with RPC enabled (it usually
   is by default), e.g. in `settings.json`:
   ```json
   "rpc-enabled": true,
   "rpc-port": 9091,
   "rpc-whitelist-enabled": false
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your Transmission host/port and
   credentials (if `rpc-authentication-required` is on):
   ```bash
   cp .env.example .env
   ```
4. Run in dev mode (auto-restarts on change):
   ```bash
   npm run dev
   ```
   Or build and run compiled JS:
   ```bash
   npm run build
   npm start
   ```

The API listens on `PORT` (default `3000`).

## Running with Docker

```bash
docker compose up -d --build
```

This brings up two containers: `transmission` (a full Transmission daemon,
using the [linuxserver/transmission](https://docs.linuxserver.io/images/docker-transmission/)
image) and `api` (this project, built from the included `Dockerfile`). The
API is reachable at `http://localhost:3000`, and Transmission's own web UI
at `http://localhost:9091`, if you want it.

Torrent data persists in two named Docker volumes (`transmission-config`,
`transmission-downloads`) so it survives container restarts.

**Already running Transmission natively on the host** (e.g. via
`transmission-daemon` from earlier in this README) and just want to
containerize the API? Comment out the `transmission` service in
`docker-compose.yml` and point `TRANSMISSION_HOST` at the host machine
instead — see the notes at the bottom of that file for the exact steps
(they differ slightly between Docker Desktop and native Linux Docker).

To rebuild after code changes:
```bash
docker compose up -d --build api
```

To view logs:
```bash
docker compose logs -f api
```

## API documentation (Swagger)

Interactive docs are served at:

```
http://localhost:3000/docs
```

The raw OpenAPI 3.0 spec (also usable in Postman, Insomnia, etc.) is at:

```
http://localhost:3000/openapi.json
```

or read directly from [`openapi.yaml`](./openapi.yaml) in this repo. The
docs page is reachable even if `API_KEY` is set — only the underlying
`/torrents`, `/session`, etc. calls (including ones made via "Try it out")
require the key.

## Endpoints

| Method | Path                          | Description                                  |
|--------|-------------------------------|-----------------------------------------------|
| GET    | `/health`                     | Liveness check for this wrapper API           |
| GET    | `/torrents`                   | List all torrents                             |
| GET    | `/torrents/:id`                | Get a single torrent's details                |
| POST   | `/torrents`                   | Add a torrent (see body below)                |
| POST   | `/torrents/:id/start`          | Resume/start a torrent                        |
| POST   | `/torrents/:id/stop`           | Pause a torrent                               |
| POST   | `/torrents/:id/verify`         | Force a hash-check                            |
| PATCH  | `/torrents/:id/location`       | Move a torrent's data to a new folder         |
| PATCH  | `/torrents/:id/speed-limit`    | Set a per-torrent download/upload speed limit |
| DELETE | `/torrents/:id`                | Remove a torrent (`?deleteLocalData=true` to also delete files) |
| GET    | `/session`                     | Raw Transmission session settings             |
| PATCH  | `/session/speed-limit`         | Set the global (daemon-wide) speed limit      |
| GET    | `/stats`                       | Session/transfer statistics                   |

### Add a torrent

```bash
# via magnet link
curl -X POST localhost:3000/torrents \
  -H "Content-Type: application/json" \
  -d '{"magnet": "magnet:?xt=urn:btih:..."}'

# via a URL to a .torrent file
curl -X POST localhost:3000/torrents \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/file.torrent"}'

# via base64-encoded .torrent file contents
curl -X POST localhost:3000/torrents \
  -H "Content-Type: application/json" \
  -d "{\"metainfo\": \"$(base64 -w0 file.torrent)\"}"
```

Optional body fields: `downloadDir` (string), `paused` (boolean).

### Limit download/upload speed

Two levels are available:

- **Global** (`PATCH /session/speed-limit`) — applies to the whole daemon,
  affecting every torrent that doesn't have its own override.
- **Per-torrent** (`PATCH /torrents/:id/speed-limit`) — overrides the global
  limit for just that torrent.

Both take the same body shape, in KB/s:

```bash
# Cap this torrent's download at 500 KB/s and upload at 100 KB/s
curl -X PATCH localhost:3000/torrents/1/speed-limit \
  -H "Content-Type: application/json" \
  -d '{"downloadKBps": 500, "uploadKBps": 100}'

# Cap the whole daemon's download at 1000 KB/s, leave upload unchanged
curl -X PATCH localhost:3000/session/speed-limit \
  -H "Content-Type: application/json" \
  -d '{"downloadKBps": 1000}'

# Remove a torrent's own limit (falls back to the global limit)
curl -X PATCH localhost:3000/torrents/1/speed-limit \
  -H "Content-Type: application/json" \
  -d '{"downloadKBps": null}'
```

Rules: send a number to set a limit, `null` to remove it for that
direction, or omit a field entirely to leave it unchanged. At least one of
`downloadKBps`/`uploadKBps` is required.

### Securing the wrapper API

Set `API_KEY` in `.env` to require an `X-API-Key: <value>` header on every
request. This is separate from Transmission's own RPC username/password,
which you set via `TRANSMISSION_USERNAME` / `TRANSMISSION_PASSWORD`.

## Troubleshooting

### `Transmission RPC HTTP error: 401 Unauthorized`

This error comes from **Transmission itself**, not from this wrapper API.
It means the daemon has `rpc-authentication-required` turned on and is
rejecting requests that don't include valid credentials.

Check what Transmission currently expects:

```bash
sudo cat /etc/transmission-daemon/settings.json | grep -i rpc-
```

- `sudo` is needed because `settings.json` is owned by the `debian-transmission`
  system user, not your login user, so a plain `cat` would fail with a
  permission error.
- `grep -i rpc-` filters the (fairly long) settings file down to just the
  `rpc-*` keys, case-insensitively, so you only see what's relevant here.

You're looking for output like:

```json
"rpc-authentication-required": true,
"rpc-username": "transmission",
"rpc-password": "{a1b2c3...hashed}",
```

**If `rpc-authentication-required` is `true`**, this API needs matching
credentials. Add them to `.env`:

```
TRANSMISSION_USERNAME=transmission
TRANSMISSION_PASSWORD=your-actual-password
```

Use the **plaintext** password here, even though `settings.json` stores it
hashed — Transmission hashes it internally when you first set it, but the
RPC client (this API, `transmission-remote`, the web UI, etc.) always
authenticates with the plaintext value. Restart `npm run dev` afterwards so
the new `.env` values are picked up.

**If you don't need daemon-level auth** (e.g. local-only development, where
RPC is already restricted to `127.0.0.1`), you can disable it instead:

```bash
sudo systemctl stop transmission-daemon
sudo nano /etc/transmission-daemon/settings.json
```

Set:

```json
"rpc-authentication-required": false,
```

Save, then:

```bash
sudo systemctl start transmission-daemon
```

The daemon must be stopped before editing `settings.json` by hand, or it
will overwrite your edits with its in-memory settings on the next restart.

## Project layout

```
openapi.yaml               OpenAPI 3.0 spec (source of truth for /docs)
Dockerfile                 multi-stage build for the api service
docker-compose.yml          api + transmission stack
.dockerignore
src/
  types.ts                  RPC + domain types
  config.ts                 env var loading
  transmissionClient.ts     RPC client (session handshake, convenience methods)
  routes.ts                 Express routes
  server.ts                 app bootstrap
  swagger.ts                loads openapi.yaml for swagger-ui-express
```

## Extending it

Anything Transmission's RPC spec supports can be added as a new method on
`TransmissionClient` using the low-level `client.call(method, args)`, then
exposed as a route. The full method/argument reference is here:
https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md