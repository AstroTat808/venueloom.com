import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VenueLoom | Integrations & Migration",
  description: "Connect, migrate and synchronize the systems that run your venue."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
