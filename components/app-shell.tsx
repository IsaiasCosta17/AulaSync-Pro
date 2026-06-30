import { redirect } from "next/navigation";
import { requireUserSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/logo";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireUserSession();
  if (!session) redirect("/session-invalid");

  const [driveAccounts, youtubeChannels, activeUploads, errors] = await Promise.all([
    prisma.googleDriveAccount.count({
      where: { userId: session.userId, isActive: true } as never,
    }),
    prisma.youtubeChannel.count({
      where: { userId: session.userId, isActive: true } as never,
    }),
    prisma.uploadJob.count({
      where: { userId: session.userId, status: "RUNNING" } as never,
    }),
    prisma.uploadItem.count({
      where: { status: "ERROR", job: { userId: session.userId } } as never,
    }),
  ]);

  const name = session.name || "Usuário";
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "US";

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        role={session.role}
        health={{
          driveConnected: driveAccounts > 0,
          youtubeConnected: youtubeChannels > 0,
          activeUploads,
          errors,
        }}
      />
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[84px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="shrink-0 lg:hidden"><Logo compact /></div>
          <Topbar user={{ name, email: session.email, initials, role: session.role }} />
        </header>
        <main className="mx-auto max-w-[1500px] px-4 pb-28 pt-7 md:px-8 lg:pb-10">{children}</main>
      </div>
      <MobileNav role={session.role} />
    </div>
  );
}
