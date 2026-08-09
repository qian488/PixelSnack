import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "PixelSnack · 赛博拼豆工作室",
  description: "离线可用的专业拼豆绘图、转图与图纸导出工具。",
  openGraph: { title: "PixelSnack · 赛博拼豆工作室", description: "画、转、算、印，一站完成你的拼豆作品。", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "PixelSnack cyber bead studio" }] },
  twitter: { card: "summary_large_image", title: "PixelSnack", description: "离线可用的专业拼豆工作室", images: ["/og.png"] },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PixelSnack", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport = { themeColor: "#171c1f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
