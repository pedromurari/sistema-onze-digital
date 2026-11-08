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
    return [
      { source: '/matricula', destination: '/matricula.html' },
      { source: '/franquia', destination: '/franquia.html' },
      // Domínio da Jocimara (bio do Instagram) aponta pra cá, mas a raiz
      // normal do app redireciona pro login -- nesse host específico a
      // raiz serve a página dela direto, sem passar pelo sistema de membros.
      {
        source: '/',
        destination: '/jocimara-anjos',
        has: [{ type: 'host', value: 'links.jocimaraanjos.com.br' }],
      },
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
