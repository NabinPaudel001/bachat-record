import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bachat Record — Group Savings Tracker",
  description: "Group Savings, Loan & Investment Tracker for Nepali savings groups",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
