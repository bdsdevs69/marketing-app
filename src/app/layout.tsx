import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, Syne } from "next/font/google";
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

// Display face for the portal headline and hero figures.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

// Must match ROLE_CACHE_KEY in app/page.tsx.
const ROLE_SCRIPT =
  "try{if(localStorage.getItem('dna-pricing-role')==='admin')document.documentElement.dataset.role='admin'}catch(e){}";

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
    // data-role is set before first paint (see the script) so the admin
    // buttons don't pop in on every refresh.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ROLE_SCRIPT }} />
      </head>
      <body className={`${manrope.variable} ${syne.variable} ${display.variable} antialiased`}>
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
