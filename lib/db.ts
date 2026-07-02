import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function runtimeDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "5");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "5");
    return url.toString();
  } catch {
    return value;
  }
}

const datasourceUrl = runtimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reutiliza um único cliente também em produção para reduzir conexões simultâneas
// com o PostgreSQL.
globalForPrisma.prisma = prisma;
