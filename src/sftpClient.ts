import fs from "fs";
import path from "path";
import SftpClient from "ssh2-sftp-client";
import { sftpConfig } from "./config";

export class SftpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SftpConfigError";
  }
}

export interface PushProgress {
  bytesTransferred: number;
  totalBytes: number;
  currentFile?: string;
}

export function isSftpConfigured(): boolean {
  const { host, username, privateKeyPath } = sftpConfig;
  return Boolean(host && username && privateKeyPath && fs.existsSync(privateKeyPath));
}

/** Recursively sums file sizes under a local path (0 for an empty dir). */
function getLocalSize(localPath: string): number {
  const stat = fs.statSync(localPath);
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  for (const entry of fs.readdirSync(localPath)) {
    total += getLocalSize(path.join(localPath, entry));
  }
  return total;
}

/**
 * Pushes a local file or directory to a remote SFTP server using SSH key
 * authentication, reporting progress via `onProgress` as it goes (byte-level
 * for a single file; per-file-completed for a directory, since the
 * underlying library only exposes chunk-level progress for single
 * transfers). `remoteFolder` is only created if it doesn't already exist
 * (recursive mkdir on an already-existing parent segment can fail with a
 * permission error on some servers, e.g. chrooted SFTP-only accounts, even
 * though no creation is actually needed). Connection details (host/user/key)
 * come from environment config; only the destination folder is expected to
 * vary per call.
 */
export async function pushToSftp(
  localPath: string,
  remoteFolder: string,
  onProgress?: (progress: PushProgress) => void
): Promise<void> {
  const { host, port, username, privateKeyPath, passphrase } = sftpConfig;

  if (!host || !username || !privateKeyPath) {
    throw new SftpConfigError(
      "SFTP is not configured: set SFTP_HOST, SFTP_USERNAME, and SFTP_PRIVATE_KEY_PATH"
    );
  }
  if (!fs.existsSync(privateKeyPath)) {
    throw new SftpConfigError(`SFTP private key not found at ${privateKeyPath}`);
  }
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local path does not exist: ${localPath}`);
  }

  const totalBytes = getLocalSize(localPath);
  const client = new SftpClient();

  try {
    await client.connect({
      host,
      port,
      username,
      privateKey: fs.readFileSync(privateKeyPath),
      passphrase: passphrase || undefined,
    });

    const remoteType = await client.exists(remoteFolder);
    if (!remoteType) {
      await client.mkdir(remoteFolder, true);
    }

    const stat = fs.statSync(localPath);
    const remoteTarget = path.posix.join(remoteFolder, path.basename(localPath));

    if (stat.isDirectory()) {
      // uploadDir doesn't expose byte-level progress, but emits an 'upload'
      // event after each individual file finishes — track cumulative bytes
      // against our own precomputed per-file sizes.
      let bytesTransferred = 0;
      const onFileUploaded = ({ source }: { source: string; destination: string }) => {
        try {
          bytesTransferred += fs.statSync(source).size;
        } catch {
          // File may have been removed/renamed mid-transfer; skip sizing it.
        }
        onProgress?.({ bytesTransferred, totalBytes, currentFile: path.basename(source) });
      };
      client.on("upload", onFileUploaded);
      try {
        await client.uploadDir(localPath, remoteTarget);
      } finally {
        client.removeListener("upload", onFileUploaded);
      }
    } else {
      await client.fastPut(localPath, remoteTarget, {
        step: (totalTransferred: number, _chunk: number, total: number) => {
          onProgress?.({
            bytesTransferred: totalTransferred,
            totalBytes: total || totalBytes,
            currentFile: path.basename(localPath),
          });
        },
      });
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}