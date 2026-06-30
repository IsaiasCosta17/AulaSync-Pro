import Link from "next/link";
import { ArchiveRestore, Plus, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { UploadsList } from "@/components/uploads-list";

export const metadata = { title: "Uploads" };

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const params = await searchParams;
  const showRemoved = params.removed === "1";

  return (
    <>
      <PageHeader
        eyebrow="Fila de processamento"
        title={showRemoved ? "Histórico removido" : "Uploads"}
        description={showRemoved
          ? "Restaure tarefas ocultadas anteriormente. Vídeos e arquivos permanecem intactos."
          : "Acompanhe progresso, velocidade, retomadas automáticas e ações de cada tarefa."}
        action={<Link href="/uploads/new" className="btn-primary"><Plus className="size-4" /> Novo upload</Link>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/uploads" className={!showRemoved ? "btn-primary !h-9" : "btn-secondary !h-9"}>
          <UploadCloud className="size-4" /> Ativos
        </Link>
        <Link href="/uploads?removed=1" className={showRemoved ? "btn-primary !h-9" : "btn-secondary !h-9"}>
          <ArchiveRestore className="size-4" /> Removidos
        </Link>
      </div>
      <UploadsList showRemoved={showRemoved} />
    </>
  );
}
