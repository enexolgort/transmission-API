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

/**
 * Pushes a local file or directory to a remote SFTP server using SSH key
 * authentication. `remoteFolder` is only created if it doesn't already
 * exist (see note below on why this is checked rather than always calling
 * a recursive mkdir). Connection details (host/user/key) come from
 * environment config; only the destination folder is expected to vary
 * per call.
 */
export async function pushToSftp(localPath: string, remoteFolder: string): Promise<void> {
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

  const client = new SftpClient();
  try {
    await client.connect({
      host,
      port,
      username,
      privateKey: fs.readFileSync(privateKeyPath),
      passphrase: passphrase || undefined,
    });

    // Only attempt to create the folder if it isn't already there. Calling
    // recursive mkdir unconditionally can fail with a permission error on
    // some servers (e.g. chrooted SFTP-only accounts) when a parent segment
    // of the path already exists but isn't owned/creatable by this user —
    // even though no actual creation is needed for that segment.
    const remoteType = await client.exists(remoteFolder);
    if (!remoteType) {
      await client.mkdir(remoteFolder, true);
    }

    const stat = fs.statSync(localPath);
    if (stat.isDirectory()) {
      const remoteTarget = path.posix.join(remoteFolder, path.basename(localPath));
      await client.uploadDir(localPath, remoteTarget);
    } else {
      const remoteTarget = path.posix.join(remoteFolder, path.basename(localPath));
      await client.put(localPath, remoteTarget);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}