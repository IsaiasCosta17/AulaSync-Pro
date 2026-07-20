import { NextRequest, NextResponse } from "next/server";
import { JWTPayload, jwtVerify } from "jose";

const COOKIE = "aulasync_session";
const publicPaths = [
  "/login",
  "/recuperar-senha",
  "/sobre",
  "/politica-de-privacidade",
  "/termos-de-uso",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/oauth/google/drive/callback",
  "/api/oauth/google/youtube/callback",
  "/api/health",
  "/session-invalid",
  "/icon.svg",
];

type AccessPayload = JWTPayload & {
  role?: "ADMIN" | "OPERATOR" | "CLIENT";
  mustChangePassword?: boolean;
  isActive?: boolean;
  sessionVersion?: number;
};

async function sessionPayload(token?: string): Promise<AccessPayload | null> {
  if (!token || !process.env.AUTH_SECRET) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    return payload as AccessPayload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = publicPaths.includes(path);
  const session = await sessionPayload(request.cookies.get(COOKIE)?.value);
  const authenticated = Boolean(
    session &&
    session.isActive !== false &&
    typeof session.sessionVersion === "number" &&
    ["ADMIN", "OPERATOR", "CLIENT"].includes(session.role || ""),
  );

  if (path === "/login" && authenticated) {
    const destination = session?.mustChangePassword
      ? "/change-password"
      : session?.role === "OPERATOR"
        ? "/admin/users"
        : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (!isPublic && !authenticated) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (authenticated && session?.mustChangePassword) {
    const allowed =
      path === "/change-password" ||
      path === "/api/auth/change-password" ||
      path === "/api/auth/logout" ||
      publicPaths.includes(path);
    if (!allowed) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Troque sua senha temporária antes de continuar." },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/change-password", request.url));
    }
  }

  const isStaffRoute = path.startsWith("/admin") || path.startsWith("/api/admin");
  const isStaff = session?.role === "ADMIN" || session?.role === "OPERATOR";
  if (isStaffRoute && !isStaff) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Acesso exclusivo da equipe administrativa." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (authenticated && session?.role === "OPERATOR") {
    const operatorAllowed =
      path.startsWith("/admin/users") ||
      path.startsWith("/api/admin/users") ||
      path.startsWith("/api/auth/") ||
      path === "/api/search" ||
      path === "/api/notifications" ||
      path === "/change-password" ||
      publicPaths.includes(path);
    if (!operatorAllowed) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "O perfil operador é destinado à gestão de usuários." },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/admin/users", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
