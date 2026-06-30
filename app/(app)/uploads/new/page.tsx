import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { NewUploadForm } from "@/components/new-upload-form";
import { getAppSettings } from "@/lib/settings";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Novo upload" };

export default async function NewUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; folderId?: string }>;
}) {
  const params = await searchParams;
  const session = await requireUserSession();
  if (!session) return null;
  const [accounts, channels, settings] = await Promise.all([
    prisma.googleDriveAccount.findMany({ where: { userId: session.userId, isActive: true } as never, select: { id: true, name: true, email: true }, orderBy: { connectedAt: "desc" } }),
    prisma.youtubeChannel.findMany({ where: { userId: session.userId, isActive: true } as never, select: { id: true, name: true, email: true, avatarUrl: true }, orderBy: { connectedAt: "desc" } }),
    getAppSettings(session.userId),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Nova tarefa"
        title="Preparar upload"
        description="Revise as aulas, escolha o canal e defina como a playlist será publicada."
      />
      <NewUploadForm
        accounts={accounts}
        channels={channels}
        initialAccountId={params.accountId}
        initialFolderId={params.folderId}
        defaultPrivacy={settings.defaultPrivacy}
      />
    </>
  );
}
