import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/lib/config/site";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="qm-canvas min-h-screen antialiased">
        {children}
        <SupportChatWidget />
      </body>
    </html>
  );
}
