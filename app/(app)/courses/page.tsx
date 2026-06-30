import Link from "next/link";
import { Cloud, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { CoursesBrowser } from "@/components/courses-browser";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Cursos" };

export default async function CoursesPage() {
  const session = await requireUserSession();
  if (!session) return null;
  const accounts = await prisma.googleDriveAccount.findMany({
    where: { userId: session.userId, isActive: true } as never,
    select: { id: true, name: true, email: true },
    orderBy: { connectedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        eyebrow="Biblioteca"
        title="Encontrar um curso"
        description="Navegue pelo Google Drive, escolha a pasta principal e confira as aulas encontradas."
      />
      {accounts.length ? (
        <CoursesBrowser accounts={accounts} />
      ) : (
        <EmptyState
          icon={Cloud}
          title="Conecte o Google Drive primeiro"
          description="Precisamos de uma conta Drive para localizar as pastas e as aulas do seu curso."
          action={<Link href="/accounts/drive" className="btn-primary"><Plus className="size-4" /> Conectar Google Drive</Link>}
        />
      )}
    </>
  );
}
