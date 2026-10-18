import type { Metadata } from "next";
import { AppFrame } from "@/components/shell/app-frame";
import "./globals.css";

/** App mark for the tab: graphite rounded square with a white rail profile. */
const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#252529"/><path d="M9 21h14M11 21l2-10h6l2 10M13.5 16h5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

export const metadata: Metadata = {
  title: "Supplier Risk Intelligence",
  description: "Smart supplier selection for trains: explore, compare and justify supplier choices.",
  icons: { icon: [{ url: ICON, type: "image/svg+xml" }] },
};

/**
 * Applies the stored theme ("light" | "dark" | "system") and sidebar width before paint, so there is no
 * flash. Light and an expanded sidebar are the defaults.
 */
const bootScript = `(function(){try{var e=document.documentElement;var m=localStorage.getItem("sri.theme");var s=m==="dark"||m==="system"?m:"light";var d=s==="dark"||(s==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);e.dataset.themeSetting=s;e.dataset.theme=d?"dark":"light";e.style.colorScheme=d?"dark":"light";e.dataset.sidebar=localStorage.getItem("sri.sidebar")==="collapsed"?"collapsed":"expanded";}catch(x){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="light" data-sidebar="expanded" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="h-full overflow-hidden bg-canvas font-sans text-ink">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
