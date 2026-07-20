import { createRequire } from "node:module";
import { cleanErrorMessage } from "@/lib/utils";
import { listReportItems } from "@/lib/report-query";
import { requireUserSession } from "@/lib/tenant";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as { Workbook: new () => any };

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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AulaSync Pro";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Relatório", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });

  sheet.columns = [
    { header: "Curso", key: "course", width: 28 },
    { header: "Aula", key: "lesson", width: 38 },
    { header: "Módulo", key: "module", width: 24 },
    { header: "Conta Drive", key: "drive", width: 30 },
    { header: "Canal YouTube", key: "channel", width: 26 },
    { header: "Playlist", key: "playlist", width: 28 },
    { header: "Status", key: "status", width: 16 },
    { header: "Progresso", key: "progress", width: 14 },
    { header: "Link do vídeo", key: "url", width: 34 },
    { header: "Mensagem de erro", key: "error", width: 48 },
    { header: "Data e hora", key: "updatedAt", width: 21 },
  ];

  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  header.alignment = { vertical: "middle", horizontal: "left" };

  for (const item of items) {
    const row = sheet.addRow({
      course: item.job.courseName,
      lesson: item.title,
      module: item.moduleName || "",
      drive: item.job.driveAccount?.email || "Computador/local",
      channel: item.job.channel.name,
      playlist: item.job.playlist?.name || "",
      status: item.status,
      progress: item.progress / 100,
      url: item.youtubeUrl || "",
      error: cleanErrorMessage(item.errorMessage),
      updatedAt: item.updatedAt,
    });
    row.alignment = { vertical: "top", wrapText: false };
    row.getCell("progress").numFmt = "0%";
    row.getCell("updatedAt").numFmt = "yyyy-mm-dd hh:mm";
    const statusColor = item.status === "UPLOADED"
      ? "FFD1FAE5"
      : item.status === "ERROR"
        ? "FFFEE2E2"
        : item.status === "UPLOADING"
          ? "FFDBEAFE"
          : "FFFEF3C7";
    row.getCell("status").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: statusColor },
    };
    if (item.youtubeUrl) {
      row.getCell("url").value = {
        text: item.youtubeUrl,
        hyperlink: item.youtubeUrl,
      };
      row.getCell("url").font = { color: { argb: "FF2563EB" }, underline: true };
    }
  }

  sheet.autoFilter = { from: "A1", to: "K1" };
  sheet.getColumn("progress").alignment = { horizontal: "right" };
  sheet.getColumn("updatedAt").alignment = { horizontal: "right" };
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aulasync-relatorio-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
