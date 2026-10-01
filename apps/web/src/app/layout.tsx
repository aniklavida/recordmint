import { Inter_Tight, Source_Sans_3 } from "next/font/google";
import { AppHeader } from "../features/shell/AppHeader";
import "./tokens.css";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans-3",
  display: "swap",
});

export const metadata = {
  title: "RecordMint",
  description: "Record in the browser. Share a link. Own the file.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${sourceSans3.variable}`} data-theme="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var stored = localStorage.getItem("recordmint-theme");
                if (stored) {
                  document.documentElement.setAttribute("data-theme", stored);
                } else {
                  var isMedia = window.location.pathname.startsWith("/v/") || window.location.pathname.startsWith("/record");
                  if (isMedia) {
                    document.documentElement.setAttribute("data-theme", "dark");
                  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                    document.documentElement.setAttribute("data-theme", "dark");
                  } else {
                    document.documentElement.setAttribute("data-theme", "light");
                  }
                }
              } catch(e){}
            })();`,
          }}
        />
      </head>
      <body>
        <div className="app-shell">
          <AppHeader />
          <div className="app-body">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
