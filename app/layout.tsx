import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backrooms // Level 0",
  description: "Une expérience 3D de survie dans un labyrinthe procédural.",
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
