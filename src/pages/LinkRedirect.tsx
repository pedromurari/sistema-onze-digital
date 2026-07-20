/**
 * LinkRedirect.tsx
 * Pagina publica isolada (sem login, sem chrome da app).
 * URL: /ir/:slug
 *
 * Link rastreavel de divulgacao de uma parceira. Registra o clique
 * (parceiros_cliques) e redireciona pro destino real (ex: checkout
 * hospedado da SyncPay, que nao aceita UTM/prefill via query string).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!slug) { setErro(true); return; }

    (async () => {
      const { data: link } = await supabase
        .from('parceiros_links' as any)
        .select('id, destino_url, ativo')
        .eq('slug', slug)
        .maybeSingle();

      if (!link || !(link as any).ativo) { setErro(true); return; }

      const params = new URLSearchParams(window.location.search);
      supabase.from('parceiros_cliques' as any).insert({
        link_id: (link as any).id,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        referrer: document.referrer || null,
      }).then(() => {});

      window.location.replace((link as any).destino_url);
    })();
  }, [slug]);

  if (erro) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6" style={{ background: '#f0f4f8' }}>
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Este link não existe ou foi desativado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f8' }}>
      <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#6c63ff' }} />
    </div>
  );
}
