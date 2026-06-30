import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getUserAccess, recordSuccessfulLogin } from "@/lib/user-access";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(ip);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }
  if (current && current.resetAt <= now) attempts.delete(ip);

  try {
    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    let passwordMatches = false;
    if (user) {
      passwordMatches = await bcrypt.compare(body.password, user.passwordHash);
    } else {
      await bcrypt.hash("invalid-aulasync-password", 12);
    }

    if (!user || !passwordMatches) {
      const record = attempts.get(ip);
      attempts.set(ip, {
        count: (record?.count || 0) + 1,
        resetAt: record?.resetAt && record.resetAt > now ? record.resetAt : now + WINDOW_MS,
      });
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const access = await getUserAccess(user.id);
    if (!access?.isActive) {
      return NextResponse.json(
        { error: "Esta conta está bloqueada. Fale com o administrador." },
        { status: 403 },
      );
    }

    attempts.delete(ip);
    await recordSuccessfulLogin(user.id);

    const token = await createSessionToken({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: access.role,
      isActive: true,
      mustChangePassword: access.mustChangePassword,
      sessionVersion: access.sessionVersion,
    });
    const redirect = access.mustChangePassword
      ? "/change-password"
      : access.role === "OPERATOR"
        ? "/admin/users"
        : "/dashboard";
    const response = NextResponse.json({ ok: true, redirect });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Preencha um e-mail e uma senha válidos." }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível entrar agora." }, { status: 500 });
  }
}
