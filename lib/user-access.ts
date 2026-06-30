import { prisma } from "@/lib/db";
import { getSession, SessionPayload } from "@/lib/auth";

export type UserRole = "ADMIN" | "OPERATOR" | "CLIENT";

export type UserAccess = {
  userId: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdById: string | null;
  updatedAt: Date;
};

type RawAccess = {
  userId: string;
  role: string;
  isActive: number | boolean;
  mustChangePassword: number | boolean;
  sessionVersion: number;
  lastLoginAt: Date | string | null;
  createdById: string | null;
  updatedAt: Date | string;
};

let schemaPromise: Promise<void> | null = null;

function normalize(row: RawAccess): UserAccess {
  return {
    userId: row.userId,
    role: row.role === "ADMIN" ? "ADMIN" : row.role === "OPERATOR" ? "OPERATOR" : "CLIENT",
    isActive: Boolean(row.isActive),
    mustChangePassword: Boolean(row.mustChangePassword),
    sessionVersion: Number(row.sessionVersion || 1),
    lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt) : null,
    createdById: row.createdById,
    updatedAt: new Date(row.updatedAt),
  };
}

export async function ensureUserAccessSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserAccess" (
          "userId" TEXT NOT NULL PRIMARY KEY,
          "role" TEXT NOT NULL DEFAULT 'OPERATOR',
          "isActive" INTEGER NOT NULL DEFAULT 1,
          "mustChangePassword" INTEGER NOT NULL DEFAULT 1,
          "sessionVersion" INTEGER NOT NULL DEFAULT 1,
          "lastLoginAt" DATETIME,
          "createdById" TEXT,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const users = await prisma.user.findMany({
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const existing = await prisma.$queryRawUnsafe<Array<{ userId: string; role: string }>>(
        'SELECT "userId", "role" FROM "UserAccess"',
      );
      const existingIds = new Set(existing.map((row) => row.userId));
      let hasAdmin = existing.some((row) => row.role === "ADMIN");
      const configuredAdmin = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

      for (const user of users) {
        if (existingIds.has(user.id)) continue;
        const role: UserRole =
          user.email.toLowerCase() === configuredAdmin || !hasAdmin ? "ADMIN" : "OPERATOR";
        await prisma.$executeRaw`
          INSERT OR IGNORE INTO "UserAccess"
            ("userId", "role", "isActive", "mustChangePassword", "sessionVersion", "updatedAt")
          VALUES
            (${user.id}, ${role}, 1, ${role === "ADMIN" ? 0 : 1}, 1, CURRENT_TIMESTAMP)
        `;
        if (role === "ADMIN") hasAdmin = true;
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function getUserAccess(userId: string): Promise<UserAccess | null> {
  await ensureUserAccessSchema();
  const rows = await prisma.$queryRaw<RawAccess[]>`
    SELECT "userId", "role", "isActive", "mustChangePassword", "sessionVersion",
           "lastLoginAt", "createdById", "updatedAt"
    FROM "UserAccess"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;
  return rows[0] ? normalize(rows[0]) : null;
}

export async function getValidatedSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  const access = await getUserAccess(session.userId);
  if (!access || !access.isActive || access.sessionVersion !== session.sessionVersion) return null;
  return {
    ...session,
    role: access.role,
    mustChangePassword: access.mustChangePassword,
    sessionVersion: access.sessionVersion,
  };
}

export async function requireAdminSession(): Promise<SessionPayload | null> {
  const session = await getValidatedSession();
  return session?.role === "ADMIN" ? session : null;
}

export async function requireStaffSession(): Promise<SessionPayload | null> {
  const session = await getValidatedSession();
  return session && (session.role === "ADMIN" || session.role === "OPERATOR") ? session : null;
}

export async function countActiveAdmins() {
  await ensureUserAccessSchema();
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS "total"
    FROM "UserAccess"
    WHERE "role" = 'ADMIN' AND "isActive" = 1
  `;
  return Number(rows[0]?.total || 0);
}

export async function recordSuccessfulLogin(userId: string) {
  await ensureUserAccessSchema();
  await prisma.$executeRaw`
    UPDATE "UserAccess"
    SET "lastLoginAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
}

export async function bumpSessionVersion(userId: string) {
  await ensureUserAccessSchema();
  await prisma.$executeRaw`
    UPDATE "UserAccess"
    SET "sessionVersion" = "sessionVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = ${userId}
  `;
}
