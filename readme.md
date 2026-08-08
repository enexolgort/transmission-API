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

Transmission's traffic is routed through OpenVPN with a kill switch (via
[haugene/transmission-openvpn](https://github.com/haugene/docker-transmission-openvpn)),
so it can't leak outside the VPN tunnel even if the connection drops. See
**VPN setup (PureVPN)** below before your first `docker compose up`.

```bash
docker compose up -d --build
```

This brings up two containers: `transmission` (Transmission + OpenVPN) and
`api` (this project, built from the included `Dockerfile`). The API is
reachable at `http://localhost:3000`, and Transmission's own web UI at
`http://localhost:9091`.

Torrent data lands in real folders on your machine, not hidden Docker
volumes:
- `./downloads` — finished downloads
- `./transmission-config` — Transmission's own state (settings, resume data)
- `./vpn-config` — your PureVPN `.ovpn` file (see below)

### VPN setup (PureVPN)

1. **Get PureVPN's OpenVPN config file and credentials** — these are
   different from your PureVPN account login:
   - Log in to PureVPN's [Member Area](https://my.purevpn.com/), go to
     **Subscriptions**, and reveal your VPN-specific username/password
     (separate from your account email/password).
   - Download an `.ovpn` file for a P2P-friendly server location from the
     **Manual Setup / OpenVPN Config Files** section of the same site.
2. **Place the file** in this project at `./vpn-config/purevpn.ovpn`
   (create the `vpn-config` folder if it doesn't exist).
3. **Set your credentials** in `.env` (copy `.env.example` first if you
   haven't already):
   ```
   PUREVPN_USERNAME=your-purevpn-vpn-username
   PUREVPN_PASSWORD=your-purevpn-vpn-password
   OPENVPN_CONFIG=purevpn
   ```
   `OPENVPN_CONFIG` should match your `.ovpn` filename without the
   extension — leave it as `purevpn` if you followed step 2 exactly.
4. Bring up the stack and check the logs to confirm the tunnel connected:
   ```bash
   docker compose up -d --build
   docker compose logs -f transmission
   ```
   Look for a line like `Initialization Sequence Completed` — that means
   OpenVPN is up.
5. **Verify traffic is actually going through the VPN**, not just that
   OpenVPN reports connected:
   ```bash
   docker exec transmission curl -s https://ifconfig.me
   ```
   The IP printed here should be a PureVPN server IP, not your real ISP
   IP (compare it against `curl -s https://ifconfig.me` run directly on
   your host, outside any container).

If the VPN tunnel ever drops, the container's firewall blocks Transmission
from reaching the internet at all (rather than falling back to your real
IP) — you'll see torrents simply stop transferring rather than leak.

**Already running Transmission natively on the host** and just want to
containerize the API instead of using the VPN-routed setup above? See the
commented-out notes at the bottom of `docker-compose.yml` for pointing
`TRANSMISSION_HOST` at the host machine — but note that bypasses the VPN
routing entirely, so only do this if your host's own network traffic is
already routed through PureVPN some other way.

To rebuild after code changes:
```bash
docker compose up -d --build api
```

To view logs:
```bash
docker compose logs -f api
docker compose logs -f transmission
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
| POST   | `/torrents/:id/push-sftp`      | Push a finished torrent's files to a remote server over SFTP |
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

### Push a torrent to a remote server over SFTP

`POST /torrents/:id/push-sftp` uploads a finished torrent's files to
another server using SSH key authentication. The torrent must be fully
downloaded first, or this returns `409`.

Connection details (host, username, private key) are configured once on
the server side — only the destination folder is passed per request:

```bash
curl -X POST localhost:3000/torrents/1/push-sftp \
  -H "Content-Type: application/json" \
  -d '{"remoteFolder": "/incoming/movies"}'
```

**One-time setup:**

1. Generate a key pair dedicated to this (don't reuse a personal key):
   ```bash
   ssh-keygen -t ed25519 -f ./sftp-keys/id_ed25519 -C "transmission-api push"
   ```
2. Add the **public** key (`./sftp-keys/id_ed25519.pub`) to the remote
   server's `~/.ssh/authorized_keys` for whichever user you're connecting
   as.
3. Set the connection details in `.env`:
   ```
   SFTP_HOST=your.remote.server
   SFTP_PORT=22
   SFTP_USERNAME=someuser
   ```
   Leave `SFTP_PRIVATE_KEY_PASSPHRASE` blank unless you passphrase-protected
   the key in step 1.
4. Rebuild/restart: `docker compose up -d --build api`

The private key itself is never an environment variable — it's mounted
read-only into the container from `./sftp-keys/id_ed25519` (see
`docker-compose.yml`). That folder is gitignored; never commit it.

**How it finds the files:** the API asks Transmission for the torrent's
`downloadDir`/`name`, then reads that same path itself — this only works
because the `api` container mounts `./downloads` read-only at the exact
same internal path (`/data/completed`) that the `transmission` container
uses, so both containers agree on where a given torrent's files live.

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
docker-compose.yml          transmission (via VPN) + api stack
.dockerignore
vpn-config/                 your PureVPN .ovpn file goes here (gitignored)
downloads/                  finished downloads land here (gitignored)
transmission-config/        Transmission's own state (gitignored)
sftp-keys/                  your SSH private key for push-sftp goes here (gitignored)
src/
  types.ts                  RPC + domain types
  config.ts                 env var loading
  transmissionClient.ts     RPC client (session handshake, convenience methods)
  routes.ts                 Express routes
  server.ts                 app bootstrap
  swagger.ts                loads openapi.yaml for swagger-ui-express
  sftpClient.ts              SFTP push helper (SSH key auth)
```

## Extending it

Anything Transmission's RPC spec supports can be added as a new method on
`TransmissionClient` using the low-level `client.call(method, args)`, then
exposed as a route. The full method/argument reference is here:
https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md