/**
 * Minimal typings for the subset of the Transmission RPC spec this API uses.
 * Full spec: https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md
 */

export interface TransmissionConfig {
  host: string;
  port: number;
  path: string; // usually /transmission/rpc
  protocol: "http" | "https";
  username?: string;
  password?: string;
}

export interface RpcRequest<T = Record<string, unknown>> {
  method: string;
  arguments?: T;
  tag?: number;
}

export interface RpcResponse<T = Record<string, unknown>> {
  result: "success" | string;
  arguments: T;
  tag?: number;
}

// Torrent status codes as defined by Transmission
export enum TorrentStatus {
  Stopped = 0,
  QueuedToVerify = 1,
  Verifying = 2,
  QueuedToDownload = 3,
  Downloading = 4,
  QueuedToSeed = 5,
  Seeding = 6,
}

export interface Torrent {
  id: number;
  hashString: string;
  name: string;
  status: TorrentStatus;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  totalSize: number;
  downloadedEver: number;
  uploadedEver: number;
  uploadRatio: number;
  error: number;
  errorString: string;
  downloadDir: string;
  isFinished: boolean;
  peersConnected: number;
  addedDate: number;
}

// Common field set requested when listing/inspecting torrents.
export const DEFAULT_TORRENT_FIELDS = [
  "id",
  "hashString",
  "name",
  "status",
  "percentDone",
  "rateDownload",
  "rateUpload",
  "eta",
  "totalSize",
  "downloadedEver",
  "uploadedEver",
  "uploadRatio",
  "error",
  "errorString",
  "downloadDir",
  "isFinished",
  "peersConnected",
  "addedDate",
] as const;

export interface SessionStats {
  activeTorrentCount: number;
  downloadSpeed: number;
  pausedTorrentCount: number;
  torrentCount: number;
  uploadSpeed: number;
  "cumulative-stats": {
    downloadedBytes: number;
    uploadedBytes: number;
    filesAdded: number;
    sessionCount: number;
    secondsActive: number;
  };
  "current-stats": {
    downloadedBytes: number;
    uploadedBytes: number;
    filesAdded: number;
    sessionCount: number;
    secondsActive: number;
  };
}

export interface AddTorrentArgs {
  filename?: string; // magnet link or URL to a .torrent file
  metainfo?: string; // base64-encoded .torrent file contents
  "download-dir"?: string;
  paused?: boolean;
}

export interface AddTorrentResult {
  "torrent-added"?: { id: number; name: string; hashString: string };
  "torrent-duplicate"?: { id: number; name: string; hashString: string };
}