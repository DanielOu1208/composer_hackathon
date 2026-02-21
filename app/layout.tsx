import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentVault",
  description: "Local permissioned execution gateway — human approval required; agent never sees secrets.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
