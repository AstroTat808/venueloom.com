import type { Metadata } from "next";
import "./globals.css";
import { AuthCallbackHandler } from "./auth-callback";

export const metadata: Metadata = {
  title: "VenueLoom | Integrations & Migration",
  description: "Connect, migrate and synchronize the systems that run your venue."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthCallbackHandler>{children}</AuthCallbackHandler></body>
    </html>
  );
}
