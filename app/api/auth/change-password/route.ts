import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { getUserAccess } from "@/lib/user-access";

const schema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const access = await getUserAccess(session.userId);
    if (!access?.isActive || access.sessionVersion !== session.sessionVersion) {
      return NextResponse.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });
    }

    const body = schema.parse(await request.json());
    if (body.currentPassword === body.newPassword) {
      return NextResponse.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "A senha atual está incorreta." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.$executeRaw`
        UPDATE "UserAccess"
        SET "mustChangePassword" = 0,
            "sessionVersion" = "sessionVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = ${user.id}
      `;
    });

    const freshAccess = await getUserAccess(user.id);
    if (!freshAccess) throw new Error("Acesso não encontrado.");

    const token = await createSessionToken({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: freshAccess.role,
      isActive: true,
      mustChangePassword: false,
      sessionVersion: freshAccess.sessionVersion,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Use uma nova senha com pelo menos 8 caracteres." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Não foi possível atualizar a senha." }, { status: 500 });
  }
}
