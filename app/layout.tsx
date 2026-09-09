import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Stack City — Infrastructure Strategy Game",
    template: "%s · Stack City",
  },
  description:
    "Build a digital city, route live traffic, resolve incidents, and learn systems architecture by doing.",
  applicationName: "Stack City",
  creator: "Chad Kraus",
  publisher: "Chad Kraus",
  category: "games",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    "infrastructure game",
    "systems design",
    "city builder",
    "software architecture",
    "strategy game",
  ],
  openGraph: {
    title: "Stack City",
    description:
      "Build the infrastructure. Survive the traffic.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Stack City digital infrastructure connected by glowing request paths",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stack City",
    description: "Build the infrastructure. Survive the traffic.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
