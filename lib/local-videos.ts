import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const EXTENSION_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

export type LocalVideoFileInput = {
  clientId: string;
  name: string;
  size: number;
  type?: string | null;
  relativePath?: string | null;
};

export function localVideoRoot() {
  return path.resolve(process.env.LOCAL_VIDEO_UPLOAD_DIR || path.join(process.cwd(), ".data", "local-videos"));
}

export function localCourseId() {
  return randomUUID();
}

export function isSupportedVideoName(name: string) {
  return ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function defaultMimeForName(name: string, fallback = "application/octet-stream") {
  return EXTENSION_MIME[path.extname(name).toLowerCase()] || fallback;
}

export function stripVideoExtension(name: string) {
  return name.replace(/\.(mp4|mov|avi|mkv|webm)$/i, "");
}

export function safeDisplayName(name: string) {
  return path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "video.mp4";
}

export function modulePathFromRelativePath(relativePath?: string | null) {
  if (!relativePath) return "";
  const parts = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  parts.pop();
  return parts.join(" / ");
}

export function moduleNameFromRelativePath(relativePath?: string | null) {
  const modulePath = modulePathFromRelativePath(relativePath);
  if (!modulePath) return null;
  return modulePath.split(" / ").at(-1) || null;
}

export async function ensureLocalVideoRoot() {
  const root = localVideoRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export async function prepareLocalVideoFile(userId: string, courseId: string, input: LocalVideoFileInput, index: number) {
  const displayName = safeDisplayName(input.name);
  const extension = path.extname(displayName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`Formato não suportado em ${displayName}. Use mp4, mov, avi, mkv ou webm.`);
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error(`O arquivo ${displayName} está vazio ou não informou tamanho válido.`);
  }
  const root = await ensureLocalVideoRoot();
  const folder = path.join(root, userId, courseId);
  await mkdir(folder, { recursive: true });
  const storedName = `${String(index + 1).padStart(4, "0")}-${randomUUID()}${extension}`;
  const absolutePath = path.join(folder, storedName);
  const localPath = path.relative(root, absolutePath).replaceAll("\\", "/");
  const modulePath = modulePathFromRelativePath(input.relativePath);
  return {
    clientId: input.clientId,
    id: `local:${courseId}:${input.clientId}`,
    sourceType: "local" as const,
    localPath,
    name: displayName,
    title: stripVideoExtension(displayName),
    mimeType: input.type?.startsWith("video/") ? input.type : defaultMimeForName(displayName),
    size: String(input.size),
    moduleName: modulePath ? modulePath.split(" / ").at(-1) || null : null,
    modulePath,
  };
}

export function resolveLocalVideoPath(userId: string, localPath: string) {
  const root = localVideoRoot();
  const normalized = localPath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error("Caminho local inválido.");
  }
  if (!normalized.startsWith(`${userId}/`)) {
    throw new Error("Este arquivo local não pertence ao usuário atual.");
  }
  const absolutePath = path.resolve(root, normalized);
  const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
  if (!absolutePath.startsWith(rootWithSeparator)) {
    throw new Error("Caminho local fora da área segura.");
  }
  return absolutePath;
}

export async function writeLocalVideoChunk(userId: string, localPath: string, offset: number, chunk: Buffer) {
  if (!Number.isInteger(offset) || offset < 0) throw new Error("Posição do bloco inválida.");
  const absolutePath = resolveLocalVideoPath(userId, localPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const handle = await open(absolutePath, "a+");
  try {
    await handle.write(chunk, 0, chunk.length, offset);
  } finally {
    await handle.close();
  }
}

export async function localVideoStats(userId: string, localPath: string) {
  const absolutePath = resolveLocalVideoPath(userId, localPath);
  return stat(absolutePath);
}

export function openLocalVideoStream(userId: string, localPath: string, start: bigint, end: bigint): Readable {
  const absolutePath = resolveLocalVideoPath(userId, localPath);
  return createReadStream(absolutePath, {
    start: Number(start),
    end: Number(end),
  });
}
