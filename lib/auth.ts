import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { requireSecret } from "@/lib/env";

export const SESSION_COOKIE = "aulasync_session";
export const SESSION_MAX_AGE = 60 * 60 * 12;

export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "CLIENT";
  isActive: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
};

function secret() {
  return new TextEncoder().encode(requireSecret("AUTH_SECRET"));
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function createOAuthState(provider: "drive" | "youtube", userId: string) {
  return new SignJWT({ provider, userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifyOAuthState(state: string, provider: "drive" | "youtube") {
  const { payload } = await jwtVerify(state, secret());
  if (payload.provider !== provider || typeof payload.userId !== "string") throw new Error("Estado OAuth inválido.");
  return payload.userId;
}
