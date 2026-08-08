# Changelog

All notable changes to this project are logged here, newest first.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added
- `POST /torrents/:id/push-sftp` — uploads a finished torrent's files to a
  remote server over SFTP using SSH key authentication. Destination folder
  is passed per request; host/username/private key are fixed server-side
  config (`src/sftpClient.ts`, `src/routes.ts`, `src/config.ts`).
- `sftp-keys/` folder for the SSH private key used by the push above,
  mounted read-only into the `api` container. Gitignored/dockerignored.
- `api` service in `docker-compose.yml` now also mounts `./downloads`
  read-only at the same path Transmission uses internally
  (`/data/completed`), so the push route can locate torrent files without
  needing them exposed over RPC.
- SFTP connection settings in `.env.example` (`SFTP_HOST`, `SFTP_PORT`,
  `SFTP_USERNAME`, `SFTP_PRIVATE_KEY_PASSPHRASE`).
- "Push a torrent to a remote server over SFTP" section in the README with
  one-time key setup steps.
- "Push torrent via SFTP" request added to `postman_collection.json`.
- New `push-sftp` path documented in `openapi.yaml`.

### Security
- Generated and documented an `API_KEY` value for the wrapper API itself,
  previously unset (see `.env` / `docker-compose.yml`'s `api` service).

## Speed limits

### Added
- `PATCH /torrents/:id/speed-limit` — per-torrent download/upload cap
  (KB/s), overriding the global limit for that torrent.
- `PATCH /session/speed-limit` — global (daemon-wide) download/upload cap.
- Both support `null` to remove a limit and omitting a field to leave it
  unchanged (`src/transmissionClient.ts`: `setTorrentSpeedLimit`,
  `setGlobalSpeedLimit`).
- Documented in `openapi.yaml`, `README.md`, and `postman_collection.json`.

## VPN routing (PureVPN)

### Changed
- `transmission` service in `docker-compose.yml` switched from the plain
  `linuxserver/transmission` image to `haugene/transmission-openvpn`, which
  bundles OpenVPN with a kill switch — Transmission can't reach the
  internet at all if the VPN tunnel drops, rather than falling back to the
  real IP.
- Added `vpn_net` custom bridge network with a fixed subnet so the kill
  switch's `LOCAL_NETWORK` allowlist can be scoped correctly.

### Added
- `vpn-config/` folder for the PureVPN `.ovpn` file, mounted into the
  container. Gitignored/dockerignored.
- `PUREVPN_USERNAME`, `PUREVPN_PASSWORD`, `OPENVPN_CONFIG` added to
  `.env.example`.
- "VPN setup (PureVPN)" section in the README, including how to verify the
  tunnel is actually active (`curl ifconfig.me` from inside the container).

## Docker

### Added
- `Dockerfile` — multi-stage build (separate `builder`/`runtime` stages),
  runs as a non-root user.
- `docker-compose.yml` — `transmission` + `api` services on a shared
  network.
- `.dockerignore`.
- Bind-mounted `./downloads` folder for finished downloads (replacing an
  initial Docker-managed named volume, so files are browsable directly on
  the host).
- `.gitignore` (previously missing) covering `node_modules/`, `dist/`,
  `.env`, and the various runtime data folders above.
- "Running with Docker" section in the README.

## API documentation

### Added
- `openapi.yaml` — full OpenAPI 3.0 spec for every endpoint.
- `src/swagger.ts` — loads the spec for `swagger-ui-express`.
- `GET /docs` (interactive Swagger UI) and `GET /openapi.json` (raw spec),
  both reachable even when `API_KEY` is set.
- `postman_collection.json` — Postman collection covering every endpoint,
  using `{{baseUrl}}`/`{{apiKey}}`/`{{torrentId}}` variables.

### Fixed
- Replaced `ts-node-dev` (dev-mode watcher) with `tsx`, after `ts-node-dev`
  failed with a `chokidar`-related `SyntaxError` under Node 18 on a WSL
  path. `tsx` is actively maintained and doesn't share that issue.

## Initial release

### Added
- TypeScript/Express HTTP API wrapping Transmission's RPC interface.
- `src/transmissionClient.ts` — RPC client handling Transmission's
  session-id (CSRF) handshake, plus convenience methods: list/get/add
  torrents, start/stop/verify, remove, move download location, session
  stats/settings.
- `src/routes.ts` — REST endpoints on top of the client.
- Optional `X-API-Key` auth for the wrapper API itself
  (`src/config.ts`/`src/server.ts`).
- `README.md` with setup and endpoint documentation.