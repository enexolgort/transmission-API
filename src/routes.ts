import { Router, Request, Response, NextFunction } from "express";
import path from "path";
import { TransmissionClient, TransmissionRpcError } from "./transmissionClient";
import { pushToSftp, SftpConfigError } from "./sftpClient";

export function buildRouter(client: TransmissionClient): Router {
  const router = Router();

  // Wraps async handlers so thrown errors reach Express's error middleware.
  const h =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next);
    };

  router.get(
    "/torrents",
    h(async (_req, res) => {
      const torrents = await client.listTorrents();
      res.json({ torrents });
    })
  );

  router.get(
    "/torrents/:id",
    h(async (req, res) => {
      const id = Number(req.params.id);
      const torrent = await client.getTorrent(id);
      if (!torrent) {
        res.status(404).json({ error: `Torrent ${id} not found` });
        return;
      }
      res.json({ torrent });
    })
  );

  // Add a torrent by magnet link, .torrent URL, or base64-encoded metainfo.
  router.post(
    "/torrents",
    h(async (req, res) => {
      const { magnet, url, metainfo, downloadDir, paused } = req.body ?? {};
      const filename: string | undefined = magnet ?? url;

      if (!filename && !metainfo) {
        res.status(400).json({
          error: "Provide one of: magnet, url, or metainfo (base64 .torrent contents)",
        });
        return;
      }

      const result = await client.addTorrent({
        filename,
        metainfo,
        "download-dir": downloadDir,
        paused,
      });

      const added = result["torrent-added"];
      const duplicate = result["torrent-duplicate"];
      res.status(added ? 201 : 200).json({
        added: Boolean(added),
        duplicate: Boolean(duplicate),
        torrent: added ?? duplicate,
      });
    })
  );

  router.post(
    "/torrents/:id/start",
    h(async (req, res) => {
      await client.startTorrent(Number(req.params.id));
      res.status(204).send();
    })
  );

  router.post(
    "/torrents/:id/stop",
    h(async (req, res) => {
      await client.stopTorrent(Number(req.params.id));
      res.status(204).send();
    })
  );

  router.post(
    "/torrents/:id/verify",
    h(async (req, res) => {
      await client.verifyTorrent(Number(req.params.id));
      res.status(204).send();
    })
  );

  router.patch(
    "/torrents/:id/location",
    h(async (req, res) => {
      const { location, move } = req.body ?? {};
      if (!location) {
        res.status(400).json({ error: "location is required" });
        return;
      }
      await client.setTorrentDownloadDir(Number(req.params.id), location, move ?? true);
      res.status(204).send();
    })
  );

  // Per-torrent speed limit. Body: { downloadKBps?, uploadKBps? }.
  // A number sets the limit (KB/s), null disables it (falls back to the
  // global limit), and an omitted field is left unchanged.
  router.patch(
    "/torrents/:id/speed-limit",
    h(async (req, res) => {
      const { downloadKBps, uploadKBps } = req.body ?? {};
      if (downloadKBps === undefined && uploadKBps === undefined) {
        res.status(400).json({
          error: "Provide at least one of downloadKBps or uploadKBps",
        });
        return;
      }
      await client.setTorrentSpeedLimit(Number(req.params.id), { downloadKBps, uploadKBps });
      res.status(204).send();
    })
  );

  router.delete(
    "/torrents/:id",
    h(async (req, res) => {
      const deleteLocalData = req.query.deleteLocalData === "true";
      await client.removeTorrent(Number(req.params.id), deleteLocalData);
      res.status(204).send();
    })
  );

  // Pushes a finished torrent's files to a remote server over SFTP (SSH
  // key auth). Connection details (host/user/key) come from server-side
  // config; only the destination folder is provided in the request body,
  // since it's the one thing expected to vary per call.
  router.post(
    "/torrents/:id/push-sftp",
    h(async (req, res) => {
      const { remoteFolder } = req.body ?? {};
      if (!remoteFolder || typeof remoteFolder !== "string") {
        res.status(400).json({ error: "remoteFolder (string) is required in the request body" });
        return;
      }

      const id = Number(req.params.id);
      const torrent = await client.getTorrent(id);
      if (!torrent) {
        res.status(404).json({ error: `Torrent ${id} not found` });
        return;
      }
      if (!torrent.isFinished && torrent.percentDone < 1) {
        res.status(409).json({
          error: `Torrent ${id} isn't finished downloading yet (${Math.round(torrent.percentDone * 100)}%)`,
        });
        return;
      }

      const localPath = path.join(torrent.downloadDir, torrent.name);

      try {
        await pushToSftp(localPath, remoteFolder);
      } catch (err) {
        if (err instanceof SftpConfigError) {
          res.status(500).json({ error: err.message });
          return;
        }
        throw err;
      }

      res.json({
        pushed: true,
        torrentId: id,
        localPath,
        remoteFolder,
      });
    })
  );

  router.get(
    "/session",
    h(async (_req, res) => {
      const session = await client.getSession();
      res.json({ session });
    })
  );

  // Global (daemon-wide) speed limit. Body: { downloadKBps?, uploadKBps? }.
  // A number sets the limit (KB/s), null disables it (unlimited), and an
  // omitted field is left unchanged.
  router.patch(
    "/session/speed-limit",
    h(async (req, res) => {
      const { downloadKBps, uploadKBps } = req.body ?? {};
      if (downloadKBps === undefined && uploadKBps === undefined) {
        res.status(400).json({
          error: "Provide at least one of downloadKBps or uploadKBps",
        });
        return;
      }
      await client.setGlobalSpeedLimit({ downloadKBps, uploadKBps });
      res.status(204).send();
    })
  );

  router.get(
    "/stats",
    h(async (_req, res) => {
      const stats = await client.getSessionStats();
      res.json({ stats });
    })
  );

  // Error handler: translates Transmission-level failures into 502s and
  // leaves anything unexpected as a 500.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof TransmissionRpcError) {
      res.status(502).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(err);
    res.status(500).json({ error: message });
  });

  return router;
}