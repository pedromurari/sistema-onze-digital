import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { MetaAdsPanel } from './MetaAdsPanel';

export function GestorTrafego() {
  const [instrucoesAbertas, setInstrucoesAbertas] = useState(false);

  return (
    <div className="p-4 lg:p-6 space-y-5 pb-20 lg:pb-6 overflow-y-auto h-full bg-gray-50/40">
      <div>
        <h1 className="text-xl font-black text-gray-900">Gestor de Tráfego</h1>
        <p className="text-sm text-gray-500 mt-1">
          Campanhas Meta Ads em tempo real. Pausar/ativar aqui chama a API oficial da
          Meta — nenhuma ação é automática ainda (fase 1 do plano está em construção).
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
        <button
          onClick={() => setInstrucoesAbertas((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-4 text-left"
        >
          {instrucoesAbertas ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <span className="text-sm font-bold text-gray-900 flex-1">
            Como conectar (ou reconectar) a conta do Facebook
          </span>
        </button>
        {instrucoesAbertas && (
          <div className="px-5 pb-5 -mt-1 text-sm text-gray-600 leading-relaxed space-y-3">
            <p>
              A conexão é direto com a API oficial da Meta (Graph API), usando um
              token de <strong>Usuário do Sistema</strong> do Business Manager — nunca
              login/senha, nunca fica exposto no navegador.
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Abra{' '}
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  business.facebook.com → Configurações do negócio → Usuários do
                  sistema <ExternalLink className="h-3 w-3" />
                </a>
                .
              </li>
              <li>
                Se já existir um usuário do sistema (ex: "IDM Automação"), use-o. Senão,
                clique em <strong>Adicionar</strong>, tipo <strong>Admin</strong>.
              </li>
              <li>
                Em <strong>Atribuir ativos</strong>, dê a esse usuário do sistema acesso
                à conta de anúncios certa (a que tem as campanhas de leads direto), com
                permissão de <strong>Gerenciar conta de anúncios</strong>.
              </li>
              <li>
                Clique em <strong>Gerar novo token</strong>, escolha o app conectado
                (se não houver nenhum, precisa criar um app tipo "Negócios" em{' '}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  developers.facebook.com/apps <ExternalLink className="h-3 w-3" />
                </a>{' '}
                e adicionar o produto "Marketing API" nele).
              </li>
              <li>
                Marque as permissões <code className="bg-gray-100 px-1 rounded">ads_management</code>{' '}
                e <code className="bg-gray-100 px-1 rounded">ads_read</code>, expiração{' '}
                <strong>Nunca</strong>, e gere.
              </li>
              <li>
                Copie o token (só aparece uma vez) e o <strong>ID da conta de anúncios</strong>{' '}
                (formato <code className="bg-gray-100 px-1 rounded">act_XXXXXXXXXX</code>,
                em Configurações da conta de anúncios).
              </li>
              <li>
                Me passe os dois valores — eu guardo como secret no Supabase
                (<code className="bg-gray-100 px-1 rounded">META_MARKETING_ACCESS_TOKEN</code>{' '}
                e <code className="bg-gray-100 px-1 rounded">META_ADS_ACCOUNT_ID</code>),
                nunca aparecem no código nem no navegador.
              </li>
            </ol>
            <p className="text-xs text-gray-400">
              Depois disso é só recarregar esta tela — se o token/conta estiverem certos,
              as campanhas aparecem abaixo.
            </p>
          </div>
        )}
      </div>

      <MetaAdsPanel seletorConta />
    </div>
  );
}
