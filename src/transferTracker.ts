/**
 * Minimal in-memory tracker for background SFTP push jobs, so progress can
 * be polled over HTTP instead of the request blocking until the whole
 * transfer finishes. Intentionally not persisted anywhere — jobs vanish on
 * server restart, which is fine for this use case (transient transfer
 * status, not something anyone needs history of).
 */

export type TransferStatus = "pending" | "uploading" | "completed" | "failed";

export interface TransferJob {
  id: string;
  torrentId: number;
  remoteFolder: string;
  localPath: string;
  status: TransferStatus;
  bytesTransferred: number;
  totalBytes: number;
  currentFile?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, TransferJob>();

// Keeps the in-memory map from growing unbounded over a long-running
// server. Only completed/failed jobs older than this are ever pruned;
// anything pending/uploading is always kept.
const MAX_COMPLETED_JOB_AGE_MS = 60 * 60 * 1000; // 1 hour

function pruneOldJobs(): void {
  const cutoff = Date.now() - MAX_COMPLETED_JOB_AGE_MS;
  for (const [id, job] of jobs) {
    if (job.finishedAt && new Date(job.finishedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createJob(torrentId: number, remoteFolder: string, localPath: string): TransferJob {
  pruneOldJobs();
  const job: TransferJob = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    torrentId,
    remoteFolder,
    localPath,
    status: "pending",
    bytesTransferred: 0,
    totalBytes: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): TransferJob | undefined {
  return jobs.get(id);
}

export function listJobs(): TransferJob[] {
  return Array.from(jobs.values()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function updateJob(id: string, patch: Partial<TransferJob>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}