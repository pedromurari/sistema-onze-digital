import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desde 08/11/2026 este app vive dentro de um monorepo (apps/membros),
  // que tem seu próprio package-lock.json além do da raiz -- sem isso, o
  // Turbopack detecta os dois lockfiles e às vezes escolhe a raiz do
  // monorepo como workspace root, quebrando a resolução de módulos
  // internos (ex: next/font/google em build na Vercel). Fixa
  // explicitamente nesta pasta.
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    // Multi-zone: institutodespertamente.com.br é dono deste domínio (site
    // institucional + área de membros), mas as páginas de venda/captura
    // (produto 'diva_idm', turma, webinário, workshop etc.) continuam
    // vivendo no outro app (CRM Vite, projeto "operacao-onze-digital") --
    // repassa essas rotas específicas pra lá, mantendo a URL na raiz deste
    // domínio pro visitante/anúncio (pedido do Pedro, 08/11/2026). Lista
    // fechada de prefixos conhecidos, não um catch-all -- evita capturar
    // sem querer uma rota futura do próprio site institucional.
    const CRM_URL = 'https://operacao-onze-digital.vercel.app';
    const crmPaths = [
      '/diva', '/diva/:path*',
      '/turma/:path*',
      '/webinario/:path*',
      '/workshop/:path*',
      '/matricula/:path*',
      '/pre-matricula/:path*',
      '/assinar/:path*',
      '/comprar/:path*',
      '/formulario/:path*',
      '/forms/:path*',
      '/presenca/:path*',
      '/atualizar-dados/:path*',
      '/pnl-contrato',
      '/ir/:path*',
    ];
    return [
      { source: '/franquia', destination: '/franquia.html' },
      // Domínio da Jocimara (bio do Instagram) aponta pra cá, mas a raiz
      // normal do app redireciona pro login -- nesse host específico a
      // raiz serve a página dela direto, sem passar pelo sistema de membros.
      {
        source: '/',
        destination: '/jocimara-anjos',
        has: [{ type: 'host', value: 'links.jocimaraanjos.com.br' }],
      },
      ...crmPaths.map((source) => ({ source, destination: `${CRM_URL}${source}` })),
    ];
  },
  // @react-pdf/renderer usa módulos Node.js nativos — não pode ser bundlado pelo webpack
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
};

export default nextConfig;
