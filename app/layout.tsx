import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IA — Recherche web",
  description: "Une IA qui cherche sur Internet avant de répondre.",
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
