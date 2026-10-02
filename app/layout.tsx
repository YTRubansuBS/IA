import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backrooms — Survival",
  description: "Un jeu narratif de survie infini dans les Backrooms.",
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
