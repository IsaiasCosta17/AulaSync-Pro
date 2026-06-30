import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppSettings, saveAppSettings } from "@/lib/settings";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

const settingsSchema = z.object({
  maxConcurrentUploads: z.number().int().min(1).max(10),
  temporaryRetrySeconds: z.number().int().min(5).max(300),
  quotaRetryMinutes: z.number().int().min(5).max(1440),
  defaultPrivacy: z.enum(["unlisted", "private", "public"]),
  defaultDescription: z.string().max(5000),
  defaultTags: z.string().max(500),
  defaultThumbnailDriveFileId: z.string().trim().max(200).nullable(),
  duplicateCheckEnabled: z.boolean(),
  adaptiveConcurrencyEnabled: z.boolean(),
});

export async function GET() {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  return NextResponse.json(await getAppSettings(session.userId, { fresh: true }));
}

export async function PUT(request: Request) {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const settings = settingsSchema.parse(await request.json());
    return NextResponse.json(await saveAppSettings(session.userId, settings));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Configuração inválida." },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Não foi possível salvar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
