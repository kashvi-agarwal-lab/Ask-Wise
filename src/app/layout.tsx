import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";

// Elegant serif for headings, clean sans for body text
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bodywise Guide — your personal skin & body-care consultant",
  description:
    "Tell us what you need in plain language. Get verified Be Bodywise product picks or a complete AM / PM / weekly routine, with the total cost.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
