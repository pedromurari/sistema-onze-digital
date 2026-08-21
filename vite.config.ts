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
        "script-src 'self' 'unsafe-inline'; " +        // unsafe-inline necessário para Vite HMR
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        // A Evolution API e' chamada direto do browser (QR code, estado de conexao,
        // lista de grupos). Sem o host aqui, essas telas so funcionam em producao
        // — onde nao ha CSP — e quebram silenciosamente no dev.
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://idm-evolution-api.nzj83i.easypanel.host; " +
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
