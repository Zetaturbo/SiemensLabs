import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supplier shortlist | Siemens procurement",
  description: "Compare supplier risk and delivery performance side by side.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
