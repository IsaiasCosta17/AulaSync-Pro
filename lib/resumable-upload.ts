import type { Readable } from "node:stream";
import type { youtubeAuth } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";

type OAuth2Client = ReturnType<typeof youtubeAuth>;
type VideoResult = { id?: string | null };

type UploadOptions = {
  auth: OAuth2Client;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: string;
  rateLimitKey?: string;
  mimeType: string;
  totalSize: bigint;
  sessionUri?: string | null;
  getMediaStream: (start: bigint, end: bigint) => Promise<Readable>;
  onSession: (uri: string | null) => Promise<void>;
  onProgress: (progress: number) => void;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
  signal?: AbortSignal;
};

type SessionState =
  | { kind: "active"; offset: bigint }
  | { kind: "complete"; videoId: string }
  | { kind: "expired" };

const CHUNK_GRANULARITY = 256 * 1024;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const rateLimitedUntilByKey = new Map<string, number>();

function positiveInt(name: string, fallback: number, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum) return fallback;
  return Math.min(value, maximum);
}

function requestTimeout() {
  return positiveInt("UPLOAD_REQUEST_TIMEOUT_MS", 120_000, 30_000, 600_000);
}

function chunkSize() {
  const megabytes = positiveInt("UPLOAD_CHUNK_SIZE_MB", 8, 1, 64);
  const bytes = megabytes * 1024 * 1024;
  return BigInt(Math.max(
    CHUNK_GRANULARITY,
    Math.floor(bytes / CHUNK_GRANULARITY) * CHUNK_GRANULARITY,
  ));
}

function maxRetries() {
  return positiveInt("UPLOAD_MAX_RETRIES", 8, 1, 12);
}

function readHeader(headers: unknown, name: string) {
  const bag = headers as {
    get?: (key: string) => string | null;
    [key: string]: unknown;
  };
  if (typeof bag?.get === "function") return bag.get(name);
  const value = bag?.[name] ?? bag?.[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? null : String(value);
}

function statusFromError(error: unknown) {
  const candidate = error as { code?: string | number; response?: { status?: number } };
  const status = candidate?.response?.status;
  if (typeof status === "number") return status;
  return typeof candidate?.code === "number" ? candidate.code : undefined;
}

function googleErrorContext(error: unknown) {
  const candidate = error as {
    config?: { url?: string };
    response?: { config?: { url?: string }; data?: unknown };
  };
  const url = candidate?.response?.config?.url || candidate?.config?.url || "";
  const service = /drive\.googleapis|\/drive\/v3/i.test(url)
    ? "Google Drive"
    : /youtube|upload\/youtube/i.test(url)
      ? "YouTube"
      : "Google";
  let reason = "";
  const data = candidate?.response?.data;
  if (data && typeof data === "object") {
    const payload = data as {
      error?: { errors?: Array<{ reason?: string }>; status?: string; message?: string };
    };
    reason = payload.error?.errors?.[0]?.reason || payload.error?.status || "";
  }
  return { service, reason };
}

export function isRetryableGoogleError(error: unknown) {
  const status = statusFromError(error);
  if (status && RETRYABLE_STATUS.has(status)) return true;
  const candidate = error as { code?: string | number; message?: string };
  const text = `${candidate?.code ?? ""} ${candidate?.message ?? ""}`;
  return /ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|ENETUNREACH|EAI_AGAIN|socket hang up|network error|fetch failed|bloco incompleto/i.test(text);
}

function retryAfterMs(error: unknown) {
  const candidate = error as { response?: { headers?: unknown } };
  const value = readHeader(candidate?.response?.headers, "retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function retryDelay(attempt: number, error?: unknown) {
  const requested = error ? retryAfterMs(error) : null;
  const status = error ? statusFromError(error) : undefined;
  if (requested !== null) return Math.min(requested, status === 429 ? 5 * 60_000 : 60_000);
  const exponential = status === 429
    ? Math.min(120_000, 5000 * 2 ** Math.max(0, attempt - 1))
    : Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return exponential + Math.floor(Math.random() * (status === 429 ? 5000 : 500));
}

function retryReason(error: unknown) {
  const status = statusFromError(error);
  const { service, reason } = googleErrorContext(error);
  const detail = reason ? " (" + reason + ")" : "";
  if (status === 408) return "tempo limite no " + service + detail;
  if (status === 429) return "muitas solicitações ao " + service + detail;
  if (status && status >= 500) return "instabilidade temporária no " + service + " (" + status + ")" + detail;
  return "interrupção temporária de rede no " + service + detail;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Upload interrompido.");
  error.name = "AbortError";
  throw error;
}

async function wait(delayMs: number, signal?: AbortSignal) {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      const error = new Error("Upload interrompido.");
      error.name = "AbortError";
      reject(error);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function waitForRateLimitWindow(options: UploadOptions) {
  const key = options.rateLimitKey || "youtube";
  const delay = Math.max(0, (rateLimitedUntilByKey.get(key) ?? 0) - Date.now());
  if (delay) await wait(delay, options.signal);
}

function rememberRateLimit(options: UploadOptions, error: unknown, delayMs: number) {
  if (statusFromError(error) !== 429) return;
  const key = options.rateLimitKey || "youtube";
  rateLimitedUntilByKey.set(
    key,
    Math.max(rateLimitedUntilByKey.get(key) ?? 0, Date.now() + delayMs),
  );
}

export function friendlyGoogleError(error: unknown) {
  const status = statusFromError(error);
  const candidate = error as {
    name?: string;
    message?: string;
    response?: { data?: unknown };
  };
  if (candidate?.name === "AbortError") {
    return "Upload interrompido. A sessão foi preservada para continuar depois.";
  }
  if (status === 408) return "O Google demorou a responder. A sessão foi preservada e pode ser retomada.";
  if (status === 401) return "A autorização Google expirou. Reconecte a conta e tente novamente.";
  if (status === 403) return "O Google recusou a operação. Verifique as permissões, a quota e o canal selecionado.";
  if (status === 429) {
    const { service, reason } = googleErrorContext(error);
    const detail = reason ? " (" + reason + ")" : "";
    return "O " + service + " aplicou um limite temporário" + detail + ". A retomada será automática.";
  }
  if (status && status >= 500) return "O Google apresentou uma instabilidade temporária. A sessão foi preservada para retomada.";

  let apiMessage = "";
  const data = candidate?.response?.data;
  if (data && typeof data === "object") {
    const payload = data as { error?: { message?: string }; message?: string };
    apiMessage = payload.error?.message || payload.message || "";
  }
  const message = apiMessage || candidate?.message || "Falha inesperada durante o envio.";
  if (/<!doctype|<html|<body|error 408/i.test(message)) {
    return "O Google demorou a responder. A sessão foi preservada e pode ser retomada.";
  }
  return cleanErrorMessage(message);
}

async function withRetry<T>(options: UploadOptions, operation: () => Promise<T>) {
  let attempt = 0;
  while (true) {
    throwIfAborted(options.signal);
    try {
      await waitForRateLimitWindow(options);
      return await operation();
    } catch (error) {
      const retryLimit = statusFromError(error) === 429 ? 3 : maxRetries();
      if (!isRetryableGoogleError(error) || attempt >= retryLimit) throw error;
      attempt += 1;
      const delay = retryDelay(attempt, error);
      rememberRateLimit(options, error, delay);
      options.onRetry?.(attempt, delay, retryReason(error));
      await wait(delay, options.signal);
    }
  }
}

function offsetFromRange(range: string | null) {
  if (!range) return 0n;
  const match = range.match(/bytes=0-(\d+)/i);
  return match ? BigInt(match[1]) + 1n : 0n;
}

function resumableUrl() {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");
  return url.toString();
}

async function createSession(options: UploadOptions) {
  const response = await withRetry(options, () => options.auth.request({
    url: resumableUrl(),
    method: "POST",
    timeout: requestTimeout(),
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": options.totalSize.toString(),
      "X-Upload-Content-Type": options.mimeType,
    },
    signal: options.signal,
    data: {
      snippet: {
        title: options.title,
        description: options.description,
        tags: options.tags,
      },
      status: {
        privacyStatus: options.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
  }));

  const location = readHeader(response.headers, "location");
  if (!location) throw new Error("O YouTube não devolveu a URL da sessão resumable.");
  await options.onSession(location);
  return location;
}

async function inspectSession(
  auth: OAuth2Client,
  sessionUri: string,
  totalSize: bigint,
  options: UploadOptions,
): Promise<SessionState> {
  const response = await withRetry(options, () => auth.request<VideoResult>({
    url: sessionUri,
    method: "PUT",
    timeout: requestTimeout(),
    headers: {
      "Content-Length": "0",
      "Content-Range": `bytes */${totalSize}`,
    },
    signal: options.signal,
    validateStatus: (status) => [200, 201, 308, 404, 410].includes(status),
  }));

  if (response.status === 404 || response.status === 410) return { kind: "expired" };
  if (response.status === 200 || response.status === 201) {
    if (!response.data.id) throw new Error("A sessão terminou sem devolver o ID do vídeo.");
    return { kind: "complete", videoId: response.data.id };
  }
  return {
    kind: "active",
    offset: offsetFromRange(readHeader(response.headers, "range")),
  };
}

async function readChunk(stream: Readable, expectedSize: number, signal?: AbortSignal) {
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for await (const value of stream) {
      throwIfAborted(signal);
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      chunks.push(chunk);
      received += chunk.length;
      if (received > expectedSize) {
        throw new Error("O Drive devolveu mais dados do que o bloco solicitado.");
      }
    }
  } finally {
    if (signal?.aborted) stream.destroy();
  }
  if (received !== expectedSize) {
    throw new Error(`O Drive devolveu um bloco incompleto (${received} de ${expectedSize} bytes).`);
  }
  return Buffer.concat(chunks, received);
}

async function loadChunk(options: UploadOptions, start: bigint, end: bigint) {
  const expectedSize = Number(end - start + 1n);
  return withRetry(options, async () => {
    const stream = await options.getMediaStream(start, end);
    return readChunk(stream, expectedSize, options.signal);
  });
}

export async function uploadVideoResumable(options: UploadOptions) {
  let sessionUri = options.sessionUri || null;
  let offset = 0n;
  let sessionRestarts = 0;

  if (sessionUri) {
    const state = await inspectSession(options.auth, sessionUri, options.totalSize, options);
    if (state.kind === "complete") {
      options.onProgress(100);
      return state.videoId;
    }
    if (state.kind === "expired") {
      await options.onSession(null);
      sessionUri = null;
    } else {
      offset = state.offset;
    }
  }

  if (!sessionUri) sessionUri = await createSession(options);

  while (offset < options.totalSize) {
    throwIfAborted(options.signal);
    const end = offset + chunkSize() >= options.totalSize
      ? options.totalSize - 1n
      : offset + chunkSize() - 1n;
    const data = await loadChunk(options, offset, end);
    let attempt = 0;

    while (true) {
      throwIfAborted(options.signal);
      try {
        await waitForRateLimitWindow(options);
        const chunkStart = offset;
        const response = await options.auth.request<VideoResult>({
          url: sessionUri,
          method: "PUT",
          timeout: requestTimeout(),
          headers: {
            "Content-Type": options.mimeType,
            "Content-Length": data.length.toString(),
            "Content-Range": `bytes ${chunkStart}-${end}/${options.totalSize}`,
          },
          data,
          signal: options.signal,
          onUploadProgress: ({ bytesRead }) => {
            const completed = Number(chunkStart) + bytesRead;
            const progress = Math.min(
              99,
              Math.max(1, Math.round((completed / Number(options.totalSize)) * 100)),
            );
            options.onProgress(progress);
          },
          validateStatus: (status) => [200, 201, 308, 404, 410].includes(status),
        });

        if (response.status === 404 || response.status === 410) {
          if (sessionRestarts >= 2) throw new Error("A sessão de upload expirou repetidamente.");
          sessionRestarts += 1;
          await options.onSession(null);
          sessionUri = await createSession(options);
          offset = 0n;
          break;
        }
        if (response.status === 200 || response.status === 201) {
          if (!response.data.id) throw new Error("O YouTube não devolveu o ID do vídeo.");
          options.onProgress(100);
          return response.data.id;
        }

        const confirmedOffset = offsetFromRange(readHeader(response.headers, "range"));
        offset = confirmedOffset > chunkStart ? confirmedOffset : end + 1n;
        options.onProgress(Math.min(
          99,
          Math.max(1, Math.round((Number(offset) / Number(options.totalSize)) * 100)),
        ));
        break;
      } catch (error) {
        const retryLimit = statusFromError(error) === 429 ? 3 : maxRetries();
      if (!isRetryableGoogleError(error) || attempt >= retryLimit) throw error;
        attempt += 1;
        const delay = retryDelay(attempt, error);
        rememberRateLimit(options, error, delay);
        options.onRetry?.(attempt, delay, retryReason(error));
        await wait(delay, options.signal);
        const state = await inspectSession(options.auth, sessionUri, options.totalSize, options);
        if (state.kind === "complete") {
          options.onProgress(100);
          return state.videoId;
        }
        if (state.kind === "expired") {
          if (sessionRestarts >= 2) throw error;
          sessionRestarts += 1;
          await options.onSession(null);
          sessionUri = await createSession(options);
          offset = 0n;
          break;
        }
        if (state.offset !== offset) {
          offset = state.offset;
          break;
        }
      }
    }
  }

  const finalState = await inspectSession(options.auth, sessionUri, options.totalSize, options);
  if (finalState.kind === "complete") {
    options.onProgress(100);
    return finalState.videoId;
  }
  throw new Error("A sessão resumable não confirmou a conclusão do vídeo.");
}
