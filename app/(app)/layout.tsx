import { AppShell } from "@/components/app-shell";
import { recoverPendingUploadJobs } from "@/lib/upload-worker";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await recoverPendingUploadJobs().catch(() => undefined);
  return <AppShell>{children}</AppShell>;
}
