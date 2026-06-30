import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    const state = await createOAuthState("youtube", session.userId);
    return NextResponse.redirect(googleAuthUrl("youtube", state));
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Configuração OAuth inválida.";
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/accounts/youtube?error=${encodeURIComponent(message)}`,
    );
  }
}
