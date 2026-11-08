import type { Metadata, Viewport } from "next";
import { Fraunces, Poppins } from "next/font/google";
import Script from "next/script";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Instituto Despertamente — Área de Membros",
  description: "Desperte seu potencial. Psicanálise, Numerologia, PNL e Espiritualidade.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/logo-despertamente.png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DespertaMENTE",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1638",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
        <PwaRegister />
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','1472969447740954');fbq('track','PageView');
        `}</Script>
      </body>
    </html>
  );
}
