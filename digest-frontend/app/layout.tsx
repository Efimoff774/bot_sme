import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SME Digest",
  description: "SME Digest landing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
