import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام تذاكر الدعم الفني",
  description: "مركز الدعم الفني — اختر مشروعك لفتح أو متابعة تذكرة دعم",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="ar">
      <body className="min-h-screen bg-bg text-ink font-arabic antialiased">{children}</body>
    </html>
  );
}
