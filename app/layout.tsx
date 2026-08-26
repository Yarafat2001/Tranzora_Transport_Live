import type { Metadata } from "next";
import "./globals.css";
import "./specific.css";
import "./overrides.css";

export const metadata: Metadata = {
  title: "Tranzora | Transport Management",
  description: "A complete transport business management platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
