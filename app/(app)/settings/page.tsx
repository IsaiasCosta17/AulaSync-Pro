import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { getAppSettings } from "@/lib/settings";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const session = await requireUserSession();
  if (!session) return null;
  const settings = await getAppSettings(session.userId, { fresh: true });
  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Configurações"
        description="Controle concorrência, retomadas e padrões aplicados aos novos uploads."
      />
      <SettingsForm initialSettings={settings} />
    </>
  );
}
