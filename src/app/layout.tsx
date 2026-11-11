import type { Metadata } from "next";
// Imported at the layout level so the loader renders styled on first
// paint — before the dynamically-imported 3D chunk (which also imports
// this file) has loaded. Next dedupes the single CSS module.
import "@/components/portfolio/portfolio.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://3d-portfolio-nav-8975.vercel.app"),
  alternates: {
    canonical: "/",
  },
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
    url: "https://3d-portfolio-nav-8975.vercel.app",
    siteName: "NAV — 3D Portfolio",
    type: "website",
    images: [{ url: "/images/preview.jpg", width: 1344, height: 756 }],
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
      <body className="light-theme">
        {/* React 19 hoists these <link> elements into <head>. Poppins must
            keep its public family name — the canvas textures (book page,
            cover, project posters) draw text with literal 'Poppins' strings
            and document.fonts.load(), so a hashed next/font family would
            silently break them. */}
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
      </body>
    </html>
  );
}
