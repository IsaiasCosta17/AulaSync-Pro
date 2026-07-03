import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureUserAccessSchema, requireStaffSession } from "@/lib/user-access";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
  role: string;
  isActive: number | boolean;
  mustChangePassword: number | boolean;
  lastLoginAt: Date | string | null;
};

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "OPERATOR", "CLIENT"]).default("CLIENT"),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const actor = await requireStaffSession();
  if (!actor) {
    return NextResponse.json({ error: "Acesso exclusivo da equipe administrativa." }, { status: 403 });
  }

  await ensureUserAccessSchema();
  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT u."id", u."name", u."email", u."createdAt",
           a."role", a."isActive", a."mustChangePassword", a."lastLoginAt"
    FROM "User" u
    INNER JOIN "UserAccess" a ON a."userId" = u."id"
    ORDER BY u."createdAt" DESC
  `;

  const users = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === "ADMIN" ? "ADMIN" : row.role === "OPERATOR" ? "OPERATOR" : "CLIENT",
    isActive: Boolean(row.isActive),
    mustChangePassword: Boolean(row.mustChangePassword),
    lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    isCurrentUser: row.id === actor.userId,
  }));

  return NextResponse.json(
    {
      users,
      currentRole: actor.role,
      permissions: {
        canManageAdmins: actor.role === "ADMIN",
        canCreateAdmins: actor.role === "ADMIN",
      },
      stats: {
        total: users.length,
        active: users.filter((user) => user.isActive).length,
        blocked: users.filter((user) => !user.isActive).length,
        admins: users.filter((user) => user.role === "ADMIN").length,
        operators: users.filter((user) => user.role === "OPERATOR").length,
        clients: users.filter((user) => user.role === "CLIENT").length,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await requireStaffSession();
  if (!actor) {
    return NextResponse.json({ error: "Acesso exclusivo da equipe administrativa." }, { status: 403 });
  }

  try {
    const body = createSchema.parse(await request.json());
    if (actor.role === "OPERATOR" && body.role === "ADMIN") {
      return NextResponse.json(
        { error: "Operadores não podem criar administradores." },
        { status: 403 },
      );
    }

    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }

    await ensureUserAccessSchema();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: body.name, email, passwordHash },
        select: { id: true, name: true, email: true, createdAt: true },
      });
      await tx.userAccess.create({
        data: {
          userId: created.id,
          role: body.role,
          isActive: body.isActive,
          mustChangePassword: true,
          sessionVersion: 1,
          createdById: actor.userId,
        },
      });
      return created;
    });

    await prisma.log.create({
      data: { level: "info", message: `Usuário criado pela equipe: ${user.email}` },
    });

    return NextResponse.json(
      {
        user: {
          ...user,
          createdAt: user.createdAt.toISOString(),
          role: body.role,
          isActive: body.isActive,
          mustChangePassword: true,
          lastLoginAt: null,
          isCurrentUser: false,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Confira nome, e-mail, senha e perfil do usuário." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Não foi possível criar o usuário." }, { status: 500 });
  }
}
