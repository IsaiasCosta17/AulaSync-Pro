import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  countActiveAdmins,
  getUserAccess,
  requireStaffSession,
} from "@/lib/user-access";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(180),
    role: z.enum(["ADMIN", "OPERATOR", "CLIENT"]),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal("reset-password"),
    password: z.string().min(8).max(128),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireStaffSession();
  if (!actor) {
    return NextResponse.json({ error: "Acesso exclusivo da equipe administrativa." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id } });
    const access = await getUserAccess(id);
    if (!user || !access) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    if (actor.role === "OPERATOR" && access.role === "ADMIN") {
      return NextResponse.json(
        { error: "Operadores não podem alterar contas de administradores." },
        { status: 403 },
      );
    }
    if (body.action === "update" && actor.role === "OPERATOR" && body.role === "ADMIN") {
      return NextResponse.json(
        { error: "Operadores não podem promover usuários a administrador." },
        { status: 403 },
      );
    }

    if (body.action === "reset-password") {
      const passwordHash = await bcrypt.hash(body.password, 12);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { passwordHash } });
        await tx.$executeRaw`
          UPDATE "UserAccess"
          SET "mustChangePassword" = 1,
              "sessionVersion" = "sessionVersion" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "userId" = ${id}
        `;
      });
      await prisma.log.create({
        data: { level: "info", message: `Senha redefinida pela equipe: ${user.email}` },
      });
      return NextResponse.json({ ok: true, mustChangePassword: true });
    }

    if (id === actor.userId && (!body.isActive || body.role !== actor.role)) {
      return NextResponse.json(
        { error: "Você não pode bloquear nem alterar o perfil da sua própria conta." },
        { status: 400 },
      );
    }

    if (
      access.role === "ADMIN" &&
      access.isActive &&
      (body.role !== "ADMIN" || !body.isActive) &&
      (await countActiveAdmins()) <= 1
    ) {
      return NextResponse.json(
        { error: "O sistema precisa manter pelo menos um administrador ativo." },
        { status: 400 },
      );
    }

    const email = body.email.toLowerCase();
    const duplicate = await prisma.user.findFirst({ where: { email, NOT: { id } } });
    if (duplicate) {
      return NextResponse.json({ error: "Este e-mail já está em uso." }, { status: 409 });
    }

    const accessChanged = body.role !== access.role || body.isActive !== access.isActive;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { name: body.name, email } });
      await tx.$executeRaw`
        UPDATE "UserAccess"
        SET "role" = ${body.role},
            "isActive" = ${body.isActive ? 1 : 0},
            "sessionVersion" = "sessionVersion" + ${accessChanged ? 1 : 0},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${id}
      `;
    });

    await prisma.log.create({
      data: { level: "info", message: `Usuário atualizado pela equipe: ${email}` },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados do usuário inválidos." }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireStaffSession();
  if (!actor) {
    return NextResponse.json({ error: "Acesso exclusivo da equipe administrativa." }, { status: 403 });
  }

  const { id } = await params;
  if (id === actor.userId) {
    return NextResponse.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  const access = await getUserAccess(id);
  if (!user || !access) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  if (actor.role === "OPERATOR" && access.role === "ADMIN") {
    return NextResponse.json(
      { error: "Operadores não podem excluir administradores." },
      { status: 403 },
    );
  }
  if (access.role === "ADMIN" && access.isActive && (await countActiveAdmins()) <= 1) {
    return NextResponse.json(
      { error: "O sistema precisa manter pelo menos um administrador ativo." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "UploadItem"
      SET "status" = 'CANCELLED', "encryptedResumableUri" = NULL
      WHERE "jobId" IN (SELECT "id" FROM "UploadJob" WHERE "userId" = ${id})
        AND "status" IN ('PENDING', 'UPLOADING', 'ERROR')
    `;
    await tx.$executeRaw`
      UPDATE "UploadJob"
      SET "status" = 'CANCELLED', "completedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${id} AND "status" IN ('PENDING', 'RUNNING', 'PAUSED', 'QUOTA_REACHED')
    `;
    await tx.$executeRaw`
      UPDATE "GoogleDriveAccount"
      SET "isActive" = 0, "encryptedTokens" = ''
      WHERE "userId" = ${id}
    `;
    await tx.$executeRaw`
      UPDATE "YoutubeChannel"
      SET "isActive" = 0, "encryptedTokens" = ''
      WHERE "userId" = ${id}
    `;
    await tx.$executeRaw`DELETE FROM "UserAccess" WHERE "userId" = ${id}`;
    await tx.user.delete({ where: { id } });
  });
  await prisma.log.create({
    data: { level: "warning", message: `Usuário excluído pela equipe: ${user.email}` },
  });
  return NextResponse.json({ ok: true });
}
