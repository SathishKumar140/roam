import React from "react";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1f2937",
          paddingBottom: "24px",
          marginBottom: "36px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#10b981",
              borderRadius: "9999px",
              padding: "4px 12px",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                display: "inline-block",
              }}
            />
            SYSTEM OPERATIONAL
          </div>
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 800,
              margin: "0 0 8px 0",
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, #ffffff 0%, #9ca3af 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            🚀 Project Roam Concierge
          </h1>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "15px" }}>
            Serverless, multi-agent AI concierge proxy for Telegram & WhatsApp
          </p>
        </div>

        <a
          href="https://t.me/roam_concierge_bot"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "14px",
            transition: "background 0.2s",
          }}
        >
          <span>Chat on Telegram</span>
          <span>→</span>
        </a>
      </header>

      {/* Grid of services */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "36px",
        }}
      >
        <div
          style={{
            backgroundColor: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
            TELEGRAM BOT
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#60a5fa" }}>
            @roam_concierge_bot
          </div>
          <div style={{ fontSize: "12px", color: "#10b981", marginTop: "6px" }}>
            ● Authenticated
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
            VECTOR MEMORY
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#facc15" }}>
            ClickHouse Cloud
          </div>
          <div style={{ fontSize: "12px", color: "#10b981", marginTop: "6px" }}>
            ● AWS Singapore (ap-se-1)
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
            SEARCH ENGINE
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#ec4899" }}>
            Exa AI Search
          </div>
          <div style={{ fontSize: "12px", color: "#10b981", marginTop: "6px" }}>
            ● Live Web Grounding
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "12px",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
            REASONING & ROUTING
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#a855f7" }}>
            OpenRouter
          </div>
          <div style={{ fontSize: "12px", color: "#10b981", marginTop: "6px" }}>
            ● openrouter/auto
          </div>
        </div>
      </section>

      {/* Webhook Endpoint Info */}
      <section
        style={{
          backgroundColor: "#111827",
          border: "1px solid #1f2937",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "36px",
        }}
      >
        <h2 style={{ fontSize: "18px", margin: "0 0 12px 0" }}>
          Webhook Proxy Route
        </h2>
        <p style={{ color: "#9ca3af", fontSize: "14px", margin: "0 0 16px 0" }}>
          This server acts as the ultra-fast proxy (&lt;100ms) that receives Telegram POST webhooks and dispatches long-running background tasks to Trigger.dev v3.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "#030712",
            border: "1px solid #1f2937",
            borderRadius: "8px",
            padding: "10px 16px",
            fontFamily: "monospace",
            fontSize: "14px",
          }}
        >
          <span style={{ color: "#10b981", fontWeight: 700 }}>POST</span>
          <span style={{ color: "#e5e7eb" }}>/api/telegram</span>
          <a
            href="/api/telegram"
            target="_blank"
            style={{
              marginLeft: "auto",
              color: "#60a5fa",
              fontSize: "12px",
              textDecoration: "none",
            }}
          >
            Check Health JSON ↗
          </a>
        </div>
      </section>

      {/* Telegram Webhook Setup Instructions */}
      <section
        style={{
          backgroundColor: "rgba(30, 58, 138, 0.2)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ fontSize: "16px", color: "#60a5fa", margin: "0 0 8px 0" }}>
          💡 Connect Telegram to this Server (Port 3001)
        </h3>
        <p style={{ fontSize: "13px", color: "#cbd5e1", margin: "0 0 16px 0" }}>
          Next.js is running on <strong>port 3001</strong> (port 3000 was already in use). Open a terminal and create a public tunnel:
        </p>
        <pre
          style={{
            backgroundColor: "#030712",
            padding: "14px",
            borderRadius: "8px",
            fontSize: "13px",
            overflowX: "auto",
            color: "#38bdf8",
            margin: 0,
          }}
        >
{`# 1. In a new terminal, open a tunnel on port 3001:
npx untun@latest tunnel http://localhost:3001

# 2. Copy the public https:// URL it gives you, then run:
curl -X POST "https://api.telegram.org/bot8340655841:AAGAVwJNeckbTV7ABmkcYLaZGv0RiNR4z8s/setWebhook?url=https://<YOUR_TUNNEL_URL>/api/telegram"`}
        </pre>
      </section>
    </main>
  );
}
