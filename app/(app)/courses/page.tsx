import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
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
        description="Importe aulas do computador, navegue pelo Google Drive ou cole um link compartilhado."
      />
      <CoursesBrowser accounts={accounts} />
    </>
  );
}
