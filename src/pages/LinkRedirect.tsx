/**
 * LinkRedirect.tsx
 * Pagina publica isolada (sem login, sem chrome da app).
 * URL: /ir/:slug
 *
 * Link rastreavel de divulgacao de uma parceira. Registra o clique
 * (parceiros_cliques) e redireciona pro destino real, anexando UTM
 * (utm_source=parceira, utm_medium=link-parceira, utm_campaign=produto,
 * utm_content=slug do link) -- assim a pagina de destino (e qualquer
 * pixel/formulario que leia a URL) sabe de quem veio o clique, mesmo
 * quando o proprio checkout (SyncPay) nao repassa isso adiante.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertCircle } from 'lucide-react';

const ACCENT_MAP: Record<string, string> = {
  á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', õ: 'o', ô: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

function slugify(s: string) {
  const semAcento = s.toLowerCase().split('').map(c => ACCENT_MAP[c] ?? c).join('');
  return semAcento.trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function LinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!slug) { setErro(true); return; }

    (async () => {
      const { data: link } = await supabase
        .from('parceiros_links' as any)
        .select('id, destino_url, ativo, parceira_nome, produto_nome')
        .eq('slug', slug)
        .maybeSingle();

      if (!link || !(link as any).ativo) { setErro(true); return; }

      const l = link as any;
      const utmSource = slugify(l.parceira_nome || 'parceira');
      const utmMedium = 'link-parceira';
      const utmCampaign = slugify(l.produto_nome || 'geral');
      const utmContent = slug;

      supabase.from('parceiros_cliques' as any).insert({
        link_id: l.id,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        referrer: document.referrer || null,
      }).then(() => {});

      const destino = new URL(l.destino_url);
      destino.searchParams.set('utm_source', utmSource);
      destino.searchParams.set('utm_medium', utmMedium);
      destino.searchParams.set('utm_campaign', utmCampaign);
      destino.searchParams.set('utm_content', utmContent);

      window.location.replace(destino.toString());
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
