import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { UserManager } from "@/components/user-manager";
import { requireStaffSession } from "@/lib/user-access";

export const metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireStaffSession();
  if (!session) redirect("/dashboard");

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Gestão de usuários"
        description="Crie clientes e operadores, defina acessos, bloqueie contas e controle senhas temporárias."
      />
      <UserManager />
    </>
  );
}
