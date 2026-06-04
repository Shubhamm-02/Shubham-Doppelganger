import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shubham Shah AI Representative",
  description: "RAG-grounded voice and chat persona for interview scheduling."
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
