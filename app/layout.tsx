import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AulaSync Pro",
    template: "%s · AulaSync Pro",
  },
  description: "Do Google Drive ao YouTube, sem trabalho manual.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
