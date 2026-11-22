import type { Metadata, Viewport } from "next";
import { Fraunces, Poppins } from "next/font/google";
import Script from "next/script";
import { PwaRegister } from "@/components/PwaRegister";
import { jsonLdOrganizacao, ORG, scriptJsonLd, SITE_URL } from "@/lib/seo";
import "./globals.css";
import "./design-system.css";

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
  // metadataBase resolve toda URL relativa (canonical, imagem de OG). Sem
  // isso o Next gera link relativo e o Google trata cada variação de
  // dominio como pagina diferente.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Instituto Despertamente — Formação em Psicanálise, PNL e Constelação",
    // Cada página manda só o próprio nome; o sufixo vem daqui.
    template: "%s | Instituto Despertamente",
  },
  description:
    "Formação em Psicanálise Integrativa, Constelação Familiar Sistêmica, Numerologia e PNL. Metodologia própria que une psicanálise, neurociência e PNL. Mais de 12.000 alunos.",
  applicationName: ORG.nome,
  authors: [{ name: ORG.nome, url: SITE_URL }],
  creator: ORG.nome,
  publisher: ORG.nome,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: ORG.nome,
    title: "Instituto Despertamente — Formação em Psicanálise, PNL e Constelação",
    description:
      "Formação em Psicanálise Integrativa, Constelação Familiar Sistêmica, Numerologia e PNL. Mais de 12.000 alunos.",
    images: [{ url: "/despertamente-simbolo.png", width: 1200, height: 630, alt: ORG.nome }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Instituto Despertamente",
    description:
      "Formação em Psicanálise Integrativa, Constelação Familiar Sistêmica, Numerologia e PNL.",
    images: ["/despertamente-simbolo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Sem limite de snippet: quanto mais texto o Google (e o AI
      // Overview) pode citar, maior a chance de aparecer na resposta.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  category: "education",
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
        {/* Dado estruturado da organizacao: precisa estar no HTML servido,
            nao injetado depois, senao crawler nenhum ve. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={scriptJsonLd(jsonLdOrganizacao())}
        />
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
