import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/auth";
import { createOAuthClient } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";
import { publicAppUrl } from "@/lib/public-url";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new Error("O Google nÃ£o devolveu a autorizaÃ§Ã£o esperada.");
    const stateUserId = await verifyOAuthState(state, "youtube");
    const session = await requireUserSession();
    if (!session || session.userId !== stateUserId) {
      return NextResponse.redirect(publicAppUrl("/login?expired=1&next=/accounts/youtube"));
    }

    const auth = createOAuthClient("youtube");
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    const grantedScopes = tokens.scope
      ? tokens.scope.split(" ").filter(Boolean)
      : tokens.access_token
        ? (await auth.getTokenInfo(tokens.access_token)).scopes
        : [];
    if (!grantedScopes.includes("https://www.googleapis.com/auth/youtube")) {
      throw new Error("As permissÃµes obrigatÃ³rias nÃ£o foram concedidas.");
    }
    const [profile, channelResponse] = await Promise.all([
      google.oauth2({ version: "v2", auth }).userinfo.get(),
      google.youtube({ version: "v3", auth }).channels.list({
        part: ["snippet"],
        mine: true,
      }),
    ]);
    const channel = channelResponse.data.items?.[0];
    if (!channel?.id) throw new Error("A conta selecionada nÃ£o possui um canal YouTube.");

    const existing = await prisma.youtubeChannel.findFirst({
      where: { youtubeChannelId: channel.id, userId: session.userId } as never,
    });
    const previousTokens = existing?.encryptedTokens
      ? decryptJson<Credentials>(existing.encryptedTokens)
      : {};
    const mergedTokens: Credentials = {
      ...previousTokens,
      ...tokens,
      refresh_token: tokens.refresh_token ?? previousTokens.refresh_token,
    };
    const data = {
      userId: session.userId,
      youtubeChannelId: channel.id,
      name: channel.snippet?.title || "Canal YouTube",
      email: profile.data.email || "E-mail nÃ£o informado",
      avatarUrl: channel.snippet?.thumbnails?.default?.url || profile.data.picture,
      encryptedTokens: encryptJson(mergedTokens),
      scopes: grantedScopes.join(" "),
      isActive: true,
    };

    if (existing) {
      await prisma.youtubeChannel.update({ where: { id: existing.id }, data: data as never });
    } else {
      await prisma.youtubeChannel.create({ data: data as never });
    }
    return NextResponse.redirect(publicAppUrl("/accounts/youtube?connected=1"));
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Falha ao conectar o YouTube.";
    return NextResponse.redirect(publicAppUrl(`/accounts/youtube?error=${encodeURIComponent(message)}`));
  }
}
