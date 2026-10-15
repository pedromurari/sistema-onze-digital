export function MarketingDiretoria() {
  return (
    <div className="p-4 lg:p-6 pb-20 lg:pb-6 overflow-y-auto h-full bg-gray-50/40">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Marketing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tráfego pago (Meta Ads, depois Google Ads) e produção de criativos/conteúdo.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white space-y-3">
          <h2 className="text-base font-black text-gray-900">Diretor de Marketing</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Acompanha o marketing como um todo — tráfego pago, criativos, conteúdo —
            e decide prioridade entre frentes. Hoje esse papel é do Pedro.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white space-y-3">
          <h2 className="text-base font-black text-gray-900">Gerente de Marketing</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Cuida da operação do dia a dia de marketing. Hoje a única frente estruturada
            é tráfego pago, operada pelo Gestor de Tráfego abaixo.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 p-5 shadow-sm bg-white space-y-3">
          <h2 className="text-base font-black text-gray-900">Gestor de Tráfego</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Agente pensado como "clone mental" do Pedro pra tocar Meta Ads (e depois
            Google Ads) sem precisar abrir o Ads Manager todo dia: campanhas visíveis
            no sistema, regras automáticas de pausa/orçamento e relatório diário pelo
            Telegram. Tela de operação: menu <strong>Gestor de Tráfego</strong>, logo
            abaixo deste.
          </p>
        </div>
      </div>
    </div>
  );
}
