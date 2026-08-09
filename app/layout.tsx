import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "PixelSnack · 二次元拼豆工作室",
  description: "柔和好用的拼豆绘图、图片裁切转图与图纸导出工具。",
  openGraph: { title: "PixelSnack · 二次元拼豆工作室", description: "画、转、算、印，一站完成你的拼豆作品。", images: [{ url: "/og.png", width: 1254, height: 1254, alt: "PixelSnack 品牌标志" }] },
  twitter: { card: "summary_large_image", title: "PixelSnack", description: "柔和好用的二次元拼豆工作室", images: ["/og.png"] },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PixelSnack", statusBarStyle: "black-translucent" },
  icons: { icon: "/logo.png", shortcut: "/logo.png", apple: "/logo.png" },
};

export const viewport = { themeColor: "#86aef5", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
