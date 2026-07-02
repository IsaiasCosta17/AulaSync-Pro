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
  isActive: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdById: string | null;
  updatedAt: Date;
};

let schemaPromise: Promise<void> | null = null;

function normalize(row: RawAccess): UserAccess {
  return {
    userId: row.userId,
    role: row.role === "ADMIN" ? "ADMIN" : row.role === "OPERATOR" ? "OPERATOR" : "CLIENT",
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    sessionVersion: row.sessionVersion || 1,
    lastLoginAt: row.lastLoginAt,
    createdById: row.createdById,
    updatedAt: row.updatedAt,
  };
}

export async function ensureUserAccessSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const users = await prisma.user.findMany({
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
      });
      const existing = await prisma.userAccess.findMany({
        select: { userId: true, role: true },
      });
      const existingIds = new Set(existing.map((row) => row.userId));
      let hasAdmin = existing.some((row) => row.role === "ADMIN");
      const configuredAdmin = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

      for (const user of users) {
        if (existingIds.has(user.id)) continue;
        const role: UserRole =
          user.email.toLowerCase() === configuredAdmin || !hasAdmin ? "ADMIN" : "OPERATOR";
        await prisma.userAccess.create({
          data: {
            userId: user.id,
            role,
            isActive: true,
            mustChangePassword: role !== "ADMIN",
            sessionVersion: 1,
          },
        });
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
  const row = await prisma.userAccess.findUnique({ where: { userId } });
  return row ? normalize(row) : null;
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
  return prisma.userAccess.count({
    where: { role: "ADMIN", isActive: true },
  });
}

export async function recordSuccessfulLogin(userId: string) {
  await ensureUserAccessSchema();
  await prisma.userAccess.updateMany({
    where: { userId },
    data: { lastLoginAt: new Date() },
  });
}

export async function bumpSessionVersion(userId: string) {
  await ensureUserAccessSchema();
  await prisma.userAccess.update({
    where: { userId },
    data: { sessionVersion: { increment: 1 } },
  });
}
