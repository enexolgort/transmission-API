import "dotenv/config";
import { TransmissionConfig } from "./types";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const transmissionConfig: TransmissionConfig = {
  host: required("TRANSMISSION_HOST", "127.0.0.1"),
  port: Number(required("TRANSMISSION_PORT", "9091")),
  path: required("TRANSMISSION_RPC_PATH", "/transmission/rpc"),
  protocol: (process.env.TRANSMISSION_PROTOCOL as "http" | "https") ?? "http",
  username: process.env.TRANSMISSION_USERNAME,
  password: process.env.TRANSMISSION_PASSWORD,
};

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  apiKey: process.env.API_KEY, // optional shared-secret auth for this wrapper API
};

// SFTP push destination. Deliberately not validated at startup — only the
// push route needs these, so a server without this feature configured
// shouldn't fail to boot. The route itself returns a clear error if any
// of these are missing when actually called.
export const sftpConfig = {
  host: process.env.SFTP_HOST,
  port: Number(process.env.SFTP_PORT ?? 22),
  username: process.env.SFTP_USERNAME,
  privateKeyPath: process.env.SFTP_PRIVATE_KEY_PATH,
  passphrase: process.env.SFTP_PRIVATE_KEY_PASSPHRASE, // only if the key itself is encrypted
};