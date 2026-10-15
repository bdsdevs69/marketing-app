import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import MoneyBackdrop from "@/components/MoneyBackdrop";
import "./globals.css";

// Same pairing as the client portal: Manrope for text, Syne for figures.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DNA Pricing",
  description: "Publication pricing dashboard — Digital Networking Agency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${syne.variable} antialiased`}>
        {/* One wrapper keeps React managing a single child of <body>; rendering
            siblings directly into the root container trips up removeChild. */}
        <div className="app-shell">
          <MoneyBackdrop />
          {children}
        </div>
      </body>
    </html>
  );
}
