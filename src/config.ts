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