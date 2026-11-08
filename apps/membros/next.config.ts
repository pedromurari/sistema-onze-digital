import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
