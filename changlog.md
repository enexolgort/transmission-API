# Changelog

All notable changes to this project are documented here, newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning
follows [SemVer](https://semver.org/).

Each version header below corresponds to a `git tag` you can cut once
you're ready to mark that point in history — see "Tagging a release" at
the bottom.

## Unreleased

### Changed
- `docker-compose.yml`'s `api` service now maps host port `3001` → container
  port `3000` (was `3000:3000`), since host port `3000` was already bound
  by Forgejo on the deployment machine. The app itself still listens on
  `3000` inside the container. `postman_collection.json`'s `baseUrl` updated
  to match (`http://localhost:3001`). Added a callout in the README under
  "Running with Docker" explaining this is host-specific and how to remap
  it back if `3000` is free on a different machine.

### Changed
- `POST /torrents/:id/push-sftp` no longer blocks until the transfer
  finishes — it now starts the upload in the background and returns `202`
  immediately with a job id.
- `src/sftpClient.ts`'s `pushToSftp` takes an optional progress callback:
  byte-level for single-file torrents (via `fastPut`'s `step` option),
  per-file-completed for directory torrents (via `uploadDir`'s `upload`
  event, since the library doesn't expose byte-level progress for
  directory transfers).

### Added
- `src/transferTracker.ts` — in-memory job store (`pending` →
  `uploading` → `completed`/`failed`), auto-pruning finished jobs after
  about an hour.
- `GET /transfers` — list all SFTP push jobs, most recent first.
- `GET /transfers/:jobId` — get a single job's status/progress
  (`bytesTransferred`, `totalBytes`, `currentFile`, `error` if failed).
- Both endpoints documented in `openapi.yaml` (new `TransferJob` schema,
  new `transfers` tag) and `postman_collection.json` (new "Transfers"
  folder, `{{jobId}}` variable).
- "Push a torrent to a remote server over SFTP" section in the README
  rewritten to cover polling for progress, plus a note on how
  `remoteFolder` should be an absolute path from the SFTP server's own
  root — not a path relative to the login directory, and not prefixed
  with the real host filesystem path if connecting to a chrooted account.

## v0.5.0 — SFTP push

### Added
- `POST /torrents/:id/push-sftp` — uploads a finished torrent's files to a
  remote server over SFTP using SSH key authentication. Destination folder
  is passed per request; host/username/private key are fixed server-side
  config (`src/sftpClient.ts`, `src/routes.ts`, `src/config.ts`).
- `sftp-keys/` folder for the SSH private key used by the push above,
  mounted read-only into the `api` container. Gitignored/dockerignored.
- `api` service in `docker-compose.yml` now also mounts `./downloads`
  read-only at the same path Transmission uses, so the push route can
  locate torrent files without needing them exposed over RPC.
- SFTP connection settings in `.env.example` (`SFTP_HOST`, `SFTP_PORT`,
  `SFTP_USERNAME`, `SFTP_PRIVATE_KEY_PASSPHRASE`).
- "Push a torrent to a remote server over SFTP" section in the README with
  one-time key setup steps.
- "Push torrent via SFTP" request added to `postman_collection.json`.
- New `push-sftp` path documented in `openapi.yaml`.

### Security
- Generated and documented an `API_KEY` value for the wrapper API itself,
  previously unset.

## v0.4.0 — Speed limits

### Added
- `PATCH /torrents/:id/speed-limit` — per-torrent download/upload cap
  (KB/s), overriding the global limit for that torrent.
- `PATCH /session/speed-limit` — global (daemon-wide) download/upload cap.
- Both support `null` to remove a limit and omitting a field to leave it
  unchanged (`src/transmissionClient.ts`: `setTorrentSpeedLimit`,
  `setGlobalSpeedLimit`).
- Documented in `openapi.yaml`, `README.md`, and `postman_collection.json`.

## v0.3.0 — Docker support

### Added
- `Dockerfile` — multi-stage build (separate `builder`/`runtime` stages),
  runs as a non-root user.
- `docker-compose.yml` — `transmission` (linuxserver/transmission image) +
  `api` services on a shared Docker network.
- `.dockerignore`.
- Bind-mounted `./downloads` and `./transmission-config` folders, so
  torrent data and Transmission's own state are browsable directly on the
  host rather than hidden inside Docker-managed volumes.
- `.gitignore` (previously missing) covering `node_modules/`, `dist/`,
  `.env`, and the various runtime data folders above.
- "Running with Docker" section in the README.

## v0.2.0 — API documentation

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

## v0.1.0 — Initial release

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

---

## Tagging a release

Once you're happy with a point in history and want it to exist as a real
git tag (not just a changelog section), from the project root:

```bash
git add -A
git commit -m "v0.1.0"
git tag v0.1.0
```

Repeat for each version as you reach it — e.g. after committing the Docker
work, `git tag v0.3.0`. Since none of these have been tagged yet, all of
the above is currently still "unreleased" in the strict sense; the version
numbers here are a roadmap for where each `git tag` should land once you
start committing, grouped by what actually shipped rather than every
individual back-and-forth along the way (an OpenVPN/PureVPN routing setup
was tried and then fully reverted before ever being tagged, so it isn't
listed here — nothing was ever released with it in place).
