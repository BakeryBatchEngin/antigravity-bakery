import type { Metadata } from "next";
import Link from "next/link";
import NavigationHeader from "@/components/NavigationHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakery Batch Engine",
  description: "ベーカリー店舗向け仕込み量自動計算アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen flex flex-col">
        <NavigationHeader />

        {/* メインコンテンツ部分 */}
        <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
