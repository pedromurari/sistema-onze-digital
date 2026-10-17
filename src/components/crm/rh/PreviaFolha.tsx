import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/db/fetchAll';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcularPreviaFolha, type AulaFolha, type PresencaProfessor, type ProfissionalFolha } from './folha-preview';

function mesAtualBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${partes.find((p) => p.type === 'year')?.value}-${partes.find((p) => p.type === 'month')?.value}`;
}

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PreviaFolha({ profissionais }: { profissionais: ProfissionalFolha[] }) {
  const [mes, setMes] = useState(mesAtualBrasil);
  const [aulas, setAulas] = useState<AulaFolha[]>([]);
  const [presencas, setPresencas] = useState<PresencaProfessor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [revisao, setRevisao] = useState(0);
  const requisicaoAtual = useRef(0);

  const carregar = useCallback(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return;
    const requisicao = ++requisicaoAtual.current;
    setCarregando(true);
    setErro('');
    try {
      const primeiroDia = `${mes}-01`;
      const proximoMes = new Date(`${primeiroDia}T12:00:00Z`);
      proximoMes.setUTCMonth(proximoMes.getUTCMonth() + 1);
      const limite = proximoMes.toISOString().slice(0, 10);
      const aulasDoMes = await fetchAll<AulaFolha>((de, ate) =>
        supabase.from('aulas').select('id, profissional_id, data, status')
          .gte('data', primeiroDia).lt('data', limite)
          .order('data').order('id').range(de, ate),
      );
      const confirmacoes: PresencaProfessor[] = [];
      for (let inicio = 0; inicio < aulasDoMes.length; inicio += 100) {
        const ids = aulasDoMes.slice(inicio, inicio + 100).map((aula) => aula.id);
        const lote = await fetchAll<PresencaProfessor>((de, ate) =>
          supabase.from('presencas').select('aula_id, profissional_id, presente')
            .eq('tipo', 'professor').in('aula_id', ids)
            .order('id').range(de, ate),
        );
        confirmacoes.push(...lote);
      }
      if (requisicao === requisicaoAtual.current) {
        setAulas(aulasDoMes);
        setPresencas(confirmacoes);
      }
    } catch (error) {
      if (requisicao === requisicaoAtual.current) {
        setAulas([]);
        setPresencas([]);
        setErro(error instanceof Error ? error.message : 'Não foi possível carregar a prévia.');
      }
    } finally {
      if (requisicao === requisicaoAtual.current) setCarregando(false);
    }
  }, [mes]);

  useEffect(() => { void carregar(); }, [carregar, revisao]);

  const linhas = calcularPreviaFolha(profissionais, aulas, presencas)
    .filter((linha) => linha.quantidade > 0);
  const totalAulas = linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
  const totalVariavel = linhas.reduce((soma, linha) => soma + (linha.valorAulas ?? 0), 0);

  return <Card className="border-border/70 shadow-sm">
    <CardHeader className="space-y-3 pb-3">
      <CardTitle className="text-base">Prévia do fechamento de folha</CardTitle>
      <p className="text-sm text-muted-foreground">Somente aulas realizadas com presença positiva do professor. Consulta para conferência; não cria pagamento nem envia cobrança.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="folha-mes">Competência</Label><Input id="folha-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
        <Button variant="outline" onClick={() => setRevisao((n) => n + 1)} disabled={carregando}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {carregando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando...</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!carregando && !erro && <>
        <p className="text-sm font-medium">{totalAulas} aula(s) confirmada(s) · parte por aula: {reais(totalVariavel)}</p>
        {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma aula confirmada nesta competência.</p> :
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-2">Profissional</th><th className="p-2">Aulas</th><th className="p-2">Por aula</th><th className="p-2">Parcial</th></tr></thead><tbody>
            {linhas.map(({ profissional, quantidade, valorAulas, requerRevisao }) => <tr key={profissional.id} className="border-b last:border-0"><td className="p-2 font-medium">{profissional.nome}</td><td className="p-2">{quantidade}</td><td className="p-2">{profissional.valor_por_aula == null ? 'Não configurado' : reais(profissional.valor_por_aula)}</td><td className="p-2">{requerRevisao ? 'Revisar modelo/valor' : reais(valorAulas ?? 0)}</td></tr>)}
          </tbody></table></div>}
        <p className="text-xs text-muted-foreground">Este parcial não é o saldo a pagar: não inclui valor fixo, ajuda de custo, comissão, ajustes ou pagamentos já feitos. No modelo híbrido, mostra apenas a parte por aula. Confira antes de transferir.</p>
      </>}
    </CardContent>
  </Card>;
}
