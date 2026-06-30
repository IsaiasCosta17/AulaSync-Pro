import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(value?: string | number | bigint | null) {
  if (value === null || value === undefined) return "—";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function lessonNumber(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const explicit = normalized.match(/(?:aula|lesson|video|capitulo|modulo)[\s._-]*(\d+)/i);
  const any = normalized.match(/(^|\D)(\d{1,4})(?=\D|$)/);
  return Number(explicit?.[1] ?? any?.[2] ?? Number.MAX_SAFE_INTEGER);
}

export function naturalLessonSort<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aNumber = lessonNumber(a.name);
    const bNumber = lessonNumber(b.name);
    if (aNumber !== bNumber) return aNumber - bNumber;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function cleanErrorMessage(value?: string | null) {
  if (!value) return "";
  if (/<!doctype|<html|<body|error 408|request timeout/i.test(value)) {
    return "O Google demorou a responder. O AulaSync preservou a sessão para retomada.";
  }
  return value
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [protegido]")
    .replace(/((?:access|refresh)[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*["']?[^\s"',}]+/gi, "$1=[protegido]")
    .replace(/https:\/\/www\.googleapis\.com\/upload\/youtube\/v3\/videos[^\s"']*/gi, "[sessão resumable protegida]")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
