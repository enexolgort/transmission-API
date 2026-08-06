import {
  AddTorrentArgs,
  AddTorrentResult,
  DEFAULT_TORRENT_FIELDS,
  RpcRequest,
  RpcResponse,
  SessionStats,
  Torrent,
  TransmissionConfig,
} from "./types";

const SESSION_HEADER = "X-Transmission-Session-Id";

/**
 * Thrown when Transmission itself returns a non-"success" result
 * (as opposed to a network/HTTP-level failure).
 */
export class TransmissionRpcError extends Error {
  constructor(message: string, public readonly raw: unknown) {
    super(message);
    this.name = "TransmissionRpcError";
  }
}

export class TransmissionClient {
  private sessionId: string | undefined;
  private readonly url: string;
  private readonly authHeader: string | undefined;

  constructor(private readonly config: TransmissionConfig) {
    this.url = `${config.protocol}://${config.host}:${config.port}${config.path}`;
    if (config.username) {
      const creds = Buffer.from(
        `${config.username}:${config.password ?? ""}`
      ).toString("base64");
      this.authHeader = `Basic ${creds}`;
    }
  }

  /**
   * Sends a single RPC call, transparently handling Transmission's CSRF-style
   * session id handshake (a fresh session id is required after the daemon
   * restarts or on the very first request; Transmission signals this with a
   * 409 response containing the new id in a response header).
   */
  async call<TArgs extends object = Record<string, never>, TResult = Record<string, unknown>>(
    method: string,
    args?: TArgs
  ): Promise<TResult> {
    const body: RpcRequest<TArgs> = { method, arguments: args };

    const response = await this.send(body);

    if (response.status === 409) {
      const newSessionId = response.headers.get(SESSION_HEADER);
      if (!newSessionId) {
        throw new Error(
          "Transmission returned 409 but did not provide a session id"
        );
      }
      this.sessionId = newSessionId;
      return this.call<TArgs, TResult>(method, args); // retry once with fresh id
    }

    if (!response.ok) {
      throw new Error(
        `Transmission RPC HTTP error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as RpcResponse<TResult>;
    if (json.result !== "success") {
      throw new TransmissionRpcError(
        `Transmission RPC call "${method}" failed: ${json.result}`,
        json
      );
    }
    return json.arguments;
  }

  private send(body: RpcRequest<object>): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.sessionId) headers[SESSION_HEADER] = this.sessionId;
    if (this.authHeader) headers.Authorization = this.authHeader;

    return fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  // ---- Convenience methods on top of the raw RPC call ----

  async listTorrents(fields: readonly string[] = DEFAULT_TORRENT_FIELDS): Promise<Torrent[]> {
    const result = await this.call<{ fields: readonly string[] }, { torrents: Torrent[] }>(
      "torrent-get",
      { fields }
    );
    return result.torrents;
  }

  async getTorrent(id: number, fields: readonly string[] = DEFAULT_TORRENT_FIELDS): Promise<Torrent | undefined> {
    const result = await this.call<
      { ids: number[]; fields: readonly string[] },
      { torrents: Torrent[] }
    >("torrent-get", { ids: [id], fields });
    return result.torrents[0];
  }

  async addTorrent(args: AddTorrentArgs): Promise<AddTorrentResult> {
    return this.call<AddTorrentArgs, AddTorrentResult>("torrent-add", args);
  }

  async startTorrent(id: number): Promise<void> {
    await this.call("torrent-start", { ids: [id] });
  }

  async stopTorrent(id: number): Promise<void> {
    await this.call("torrent-stop", { ids: [id] });
  }

  async verifyTorrent(id: number): Promise<void> {
    await this.call("torrent-verify", { ids: [id] });
  }

  async removeTorrent(id: number, deleteLocalData = false): Promise<void> {
    await this.call("torrent-remove", {
      ids: [id],
      "delete-local-data": deleteLocalData,
    });
  }

  async setTorrentDownloadDir(id: number, location: string, move = true): Promise<void> {
    await this.call("torrent-set-location", { ids: [id], location, move });
  }

  /**
   * Sets a per-torrent speed limit. Values are in KB/s. Pass `undefined` for
   * a given direction to leave it unchanged; pass `null` to disable the
   * limit for that direction (falls back to the global/session limit).
   */
  async setTorrentSpeedLimit(
    id: number,
    limits: { downloadKBps?: number | null; uploadKBps?: number | null }
  ): Promise<void> {
    const args: Record<string, unknown> = { ids: [id] };
    if (limits.downloadKBps !== undefined) {
      args.downloadLimited = limits.downloadKBps !== null;
      if (limits.downloadKBps !== null) args.downloadLimit = limits.downloadKBps;
    }
    if (limits.uploadKBps !== undefined) {
      args.uploadLimited = limits.uploadKBps !== null;
      if (limits.uploadKBps !== null) args.uploadLimit = limits.uploadKBps;
    }
    await this.call("torrent-set", args);
  }

  /**
   * Sets the daemon-wide (global) speed limits. Values are in KB/s. Pass
   * `undefined` for a given direction to leave it unchanged; pass `null` to
   * disable that global limit entirely (unlimited).
   */
  async setGlobalSpeedLimit(
    limits: { downloadKBps?: number | null; uploadKBps?: number | null }
  ): Promise<void> {
    const args: Record<string, unknown> = {};
    if (limits.downloadKBps !== undefined) {
      args["speed-limit-down-enabled"] = limits.downloadKBps !== null;
      if (limits.downloadKBps !== null) args["speed-limit-down"] = limits.downloadKBps;
    }
    if (limits.uploadKBps !== undefined) {
      args["speed-limit-up-enabled"] = limits.uploadKBps !== null;
      if (limits.uploadKBps !== null) args["speed-limit-up"] = limits.uploadKBps;
    }
    await this.call("session-set", args);
  }

  async getSessionStats(): Promise<SessionStats> {
    return this.call<Record<string, never>, SessionStats>("session-stats");
  }

  async getSession(): Promise<Record<string, unknown>> {
    return this.call("session-get");
  }
}