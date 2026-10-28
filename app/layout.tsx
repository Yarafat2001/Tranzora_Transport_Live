import type { Metadata } from "next";
import { LanguageProvider } from "@/components/Language";
import "./globals.css";
import "./specific.css";
import "./overrides.css";
import "./responsive.css";
import "./glass.css";
import "./landing.css";
import "./theme.css";
import "./workspace.css";
import "./workspace-refinement.css";
import "./palette.css";
import "./cinematic.css";
import "./typography.css";

export const metadata: Metadata = {
  title: "Tranzora | Transport Management",
  description: "Smart Transport Business Management Platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=window.localStorage.getItem("tranzora-theme")||window.localStorage.getItem("tranzora-auth-theme");if(t==="dark"){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";}}catch(e){}})();` }} />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}