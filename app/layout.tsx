import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "./workspace-store";

export const metadata: Metadata = {
  title: {
    default: "Outreach Control",
    template: "%s · Outreach Control",
  },
  description: "CP-driven multi-channel outreach operations workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}
