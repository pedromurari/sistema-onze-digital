import { Presentation } from 'lucide-react';

// Canal de aquisição novo (21/10/2026), ainda em construção — por enquanto só a
// página de captura foi desenhada (fora do sistema, como Artifact pro Pedro
// aprovar copy). O canal de verdade (tabela própria, leads, kanban) é um passo
// maior e só entra quando o teste de tema/oferta for decidido.
export function Workshops() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="text-center space-y-3 max-w-md">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Presentation className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Workshop</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Canal de aquisição em construção. Quando os temas e a oferta (gratuita/paga)
            estiverem decididos, esta tela ganha os mesmos recursos de Semana do Despertar
            e IDM Pelo Brasil: cadastro de edições, leads e kanban de vendas.
          </p>
        </div>
      </div>
    </div>
  );
}
