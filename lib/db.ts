import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reutiliza um único cliente também em produção para reduzir processos duplicados
// e bloqueios concorrentes no arquivo SQLite.
globalForPrisma.prisma = prisma;
