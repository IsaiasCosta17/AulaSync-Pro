import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

let initialization: Promise<void> | undefined;

async function initializeDatabase() {
  const email = (process.env.ADMIN_EMAIL || "admin@aulasync.pro").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "Administrador").trim();
  const password = (process.env.ADMIN_PASSWORD || "troque-esta-senha").trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  await Promise.all([
    prisma.userAccess.upsert({
      where: { userId: user.id },
      update: { role: "ADMIN", isActive: true, mustChangePassword: false },
      create: {
        userId: user.id,
        role: "ADMIN",
        isActive: true,
        mustChangePassword: false,
        sessionVersion: 1,
      },
    }),
    prisma.appSettings.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id },
    }),
    prisma.notificationState.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, lastReadAt: new Date(0) },
    }),
  ]);
}

export function ensureDatabaseReady() {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
