import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Desk — espace partagé",
  description: "Un espace de travail collaboratif façon Word/Notion avec tâches et assistant IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
