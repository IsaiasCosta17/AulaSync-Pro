import { cleanErrorMessage, csvCell } from "@/lib/utils";
import { listReportItems } from "@/lib/report-query";
import { requireUserSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return new Response("Sessão expirada.", { status: 401 });
  const url = new URL(request.url);
  const items = await listReportItems(session.userId, {
    channelId: url.searchParams.get("channelId") || undefined,
    course: url.searchParams.get("course") || undefined,
    lesson: url.searchParams.get("lesson") || undefined,
    status: url.searchParams.get("status") || undefined,
    onlyErrors: url.searchParams.get("errors") === "1",
  });

  const header = [
    "Curso", "Aula", "Módulo", "Conta Drive", "Canal YouTube", "Playlist",
    "Status", "Progresso", "Link do vídeo", "Mensagem de erro", "Data e hora",
  ];
  const rows = items.map((item) => [
    item.job.courseName,
    item.title,
    item.moduleName || "",
    item.job.driveAccount?.email || "Computador/local",
    item.job.channel.name,
    item.job.playlist?.name || "",
    item.status,
    item.progress,
    item.youtubeUrl || "",
    cleanErrorMessage(item.errorMessage),
    item.updatedAt.toISOString(),
  ]);
  const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aulasync-relatorio-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
