import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Elegant serif for headings, clean sans for body text
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
const description =
  "Tell us what you need in plain language. Get verified Be Bodywise product picks or a complete AM / PM / weekly routine, with the total cost.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Bodywise Guide — your personal skin & body-care consultant",
  description,
  openGraph: {
    title: "Bodywise Guide",
    description,
    siteName: "Bodywise Guide",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Bodywise Guide", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
