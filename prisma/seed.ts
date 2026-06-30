import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@aulasync.pro").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "troque-esta-senha";
  const name = (process.env.ADMIN_NAME || "Administrador").trim();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

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
  await prisma.$executeRaw`
    INSERT INTO "UserAccess"
      ("userId", "role", "isActive", "mustChangePassword", "sessionVersion", "updatedAt")
    VALUES
      (${user.id}, 'ADMIN', 1, 0, 1, CURRENT_TIMESTAMP)
    ON CONFLICT("userId") DO UPDATE SET
      "role" = 'ADMIN',
      "isActive" = 1,
      "mustChangePassword" = 0,
      "sessionVersion" = "UserAccess"."sessionVersion" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  `;


  for (const table of ["GoogleDriveAccount", "YoutubeChannel", "UploadJob"]) {
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
    if (!columns.some((column) => column.name === "userId")) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "userId" TEXT`);
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "userId" = ? WHERE "userId" IS NULL OR "userId" = ''`,
      user.id,
    );
  }

  await prisma.$executeRawUnsafe(
    'INSERT OR IGNORE INTO "AppSettings" SELECT ?, "maxConcurrentUploads", "temporaryRetrySeconds", ' +
    '"quotaRetryMinutes", "defaultPrivacy", "defaultDescription", "defaultTags", ' +
    '"defaultThumbnailDriveFileId", "duplicateCheckEnabled", "adaptiveConcurrencyEnabled", CURRENT_TIMESTAMP ' +
    'FROM "AppSettings" WHERE "id" = \'global\'',
    user.id,
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe(
    'INSERT OR IGNORE INTO "NotificationState" ("id", "lastReadAt") ' +
    'SELECT ?, "lastReadAt" FROM "NotificationState" WHERE "id" = \'global\'',
    user.id,
  ).catch(() => undefined);

  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
