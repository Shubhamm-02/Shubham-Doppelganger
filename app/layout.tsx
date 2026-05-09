import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shubham Shah AI Representative",
  description: "RAG-grounded voice and chat persona for interview scheduling.",
  icons: {
    icon: "https://assets-v2.scaler.com/assets/scaler/favicon-b8be73bbdaf99603448b08956392cad1e0f2d4e0c84661b1cfc20225e9fb6a40.ico.gz"
  }
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
