import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Project Roam | AI Concierge",
  description: "Telegram-Native AI Concierge powered by Next.js, Trigger.dev, and ClickHouse Vector Memory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#0a0b0e",
          color: "#f3f4f6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
