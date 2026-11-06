import { ImageResponse } from "next/og";

// The preview card shown when the link is shared on WhatsApp, Instagram, X, LinkedIn and so on.
export const alt = "Bodywise Guide: your personal skin, hair and body-care consultant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a2a5e 0%, #1f63e0 100%)",
          color: "#f5f9fe",
          padding: "70px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 38, letterSpacing: 6, textTransform: "uppercase", color: "#bfebef" }}>
          Be Bodywise
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 700, lineHeight: 1.05 }}>Bodywise Guide</div>
          <div style={{ display: "flex", fontSize: 44, marginTop: 28, color: "#e3eefc", maxWidth: 900 }}>
            Tell us what you need. Get verified product picks or a full routine, with the total cost.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#bfebef" }}>Every body works wonders</div>
      </div>
    ),
    { ...size }
  );
}
