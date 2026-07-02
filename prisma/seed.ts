import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@aulasync.pro").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || "troque-esta-senha").trim();
  const name = (process.env.ADMIN_NAME || "Administrador").trim();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const passwordChanged = existingUser
    ? !(await bcrypt.compare(password, existingUser.passwordHash))
    : true;
  const passwordHash = passwordChanged
    ? await bcrypt.hash(password, 12)
    : existingUser!.passwordHash;

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, ...(passwordChanged ? { passwordHash } : {}) },
    create: { email, name, passwordHash },
  });

  await prisma.$transaction([
    prisma.userAccess.upsert({
      where: { userId: user.id },
      update: {
        role: "ADMIN",
        isActive: true,
        mustChangePassword: false,
        ...(passwordChanged ? { sessionVersion: { increment: 1 } } : {}),
      },
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

  console.log(`Administrador sincronizado: ${email}`);
}

main()
  .catch((error) => {
    console.error("Falha ao sincronizar o administrador.", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
