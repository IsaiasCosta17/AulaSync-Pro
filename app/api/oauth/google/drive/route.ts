import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";
import { publicAppUrl } from "@/lib/public-url";

export async function GET() {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.redirect(publicAppUrl("/login"));
    const state = await createOAuthState("drive", session.userId);
    return NextResponse.redirect(googleAuthUrl("drive", state));
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Configuração OAuth inválida.";
    return NextResponse.redirect(
      publicAppUrl(`/accounts/drive?error=${encodeURIComponent(message)}`),
    );
  }
}
