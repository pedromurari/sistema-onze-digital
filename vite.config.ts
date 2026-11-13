import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      // Content Security Policy — bloqueia XSS e injeção de scripts externos
      "Content-Security-Policy":
        "default-src 'self'; " +
        // sdk.mercadopago.com: Payment Bricks (/comprar/:produtoId) -- sem isso o
        // formulario de pagamento so funciona em producao e quebra silenciosamente no dev.
        "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://accounts.google.com https://sdk.mercadopago.com https://http2.mlstatic.com; " + // unsafe-inline necessário para Vite HMR
        "worker-src 'self' blob:; " + // Payment Brick roda parte do codigo num Worker criado de um blob:
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        // Video do webinário é servido do R2 (Cloudflare) — sem isso o
        // player fica mudo/preto só no dev (em produção não há CSP).
        "media-src 'self' https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev; " +
        // A Evolution API e' chamada direto do browser (QR code, estado de conexao,
        // lista de grupos). Sem o host aqui, essas telas so funcionam em producao
        // — onde nao ha CSP — e quebram silenciosamente no dev.
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://idm-evolution-api.nzj83i.easypanel.host https://connect.facebook.net https://pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev https://api.mercadopago.com https://events.mercadopago.com https://http2.mlstatic.com https://www.mercadolibre.com https://api.mercadolibre.com https://secure-fields.mercadopago.com https://api-static.mercadopago.com; " +
        // Campos seguros (cartao) do Payment Brick rodam num iframe do proprio Mercado Pago.
        "frame-src 'self' https://www.mercadopago.com https://www.mercadolibre.com https://secure-fields.mercadopago.com; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';",
      // Prevenção de clickjacking
      "X-Frame-Options": "DENY",
      // Bloquear MIME type sniffing
      "X-Content-Type-Options": "nosniff",
      // HTTPS obrigatório (HSTS)
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      // Controle de referrer
      "Referrer-Policy": "strict-origin-when-cross-origin",
      // Permissions Policy — desabilitar recursos desnecessários
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
