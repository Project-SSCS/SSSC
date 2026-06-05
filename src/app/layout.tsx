import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next.js MongoDB App",
  description: "A container-ready Next.js app with Tailwind CSS, MongoDB, and Istio deployment manifests."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
