import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://navairgap.github.io"),
  title: "NAV — Security Researcher & Backend Developer",
  description:
    "Hello, I'm NAV (navairgap), a defense-first developer from Pune, India. I build passive, local-first security tools like SentinelWiFi, real-time backend systems, and I learn in public — networking, Python, security, C, operating systems. The air gap between attacker and target is my favorite place to stand.",
  keywords: [
    "NAV",
    "navairgap",
    "security researcher",
    "backend developer",
    "cybersecurity",
    "Linux",
    "Python",
    "Socket.IO",
    "SentinelWiFi",
    "portfolio",
    "3D portfolio",
  ],
  authors: [{ name: "NAV", url: "https://github.com/navairgap" }],
  icons: {
    icon: "/images/favicon.png",
  },
  openGraph: {
    title: "NAV — Security Researcher & Backend Developer",
    description:
      "Defense-first developer from Pune, India. Passive, local-first security tools and real-time backend systems.",
    url: "https://navairgap.github.io",
    siteName: "NAV — 3D Portfolio",
    type: "website",
    images: [{ url: "/images/preview.jpg", width: 1344, height: 768 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NAV — Security Researcher & Backend Developer",
    description:
      "Defense-first developer from Pune, India. Passive, local-first security tools and real-time backend systems.",
    images: ["/images/preview.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased light-theme`}
      >
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap"
          rel="stylesheet"
        />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
