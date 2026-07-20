import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserSession } from "@/lib/tenant";
import { cleanErrorMessage, naturalLessonSort } from "@/lib/utils";
import { localCourseId, prepareLocalVideoFile } from "@/lib/local-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileSchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(260),
  size: z.number().int().positive(),
  type: z.string().trim().max(120).nullable().optional(),
  relativePath: z.string().trim().max(600).nullable().optional(),
});

const schema = z.object({
  courseName: z.string().trim().min(1).max(150),
  files: z.array(fileSchema).min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const body = schema.parse(await request.json());
    const courseId = localCourseId();
    const videos = await Promise.all(
      body.files.map((file, index) => prepareLocalVideoFile(session.userId, courseId, file, index)),
    );

    return NextResponse.json({
      sourceType: "local",
      folder: { id: `local:${courseId}`, name: body.courseName },
      videos: naturalLessonSort(videos),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Não foi possível preparar os vídeos locais.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
