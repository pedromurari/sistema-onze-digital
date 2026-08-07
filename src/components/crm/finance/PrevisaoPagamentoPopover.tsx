import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from 'lucide-react';

// Pill compartilhada entre a Fila de Cobrança e a ficha do aluno no Financeiro pra
// registrar a data que o aluno prometeu pagar uma parcela vencida. Sem previsão ainda:
// pill tracejada "+ Previsão" (convida a clicar). Com previsão: pill sólida âmbar com a
// data, também clicável pra editar/limpar. `onSalvar` recebe '' pra limpar a previsão --
// quem chama decide como persistir (grava em pagamentos.data_prevista_pagamento) e como
// atualizar o estado local.
export function PrevisaoPagamentoPopover({ valorAtual, onSalvar }: { valorAtual: string | null; onSalvar: (data: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(valorAtual ?? '');

  return (
    <Popover open={aberto} onOpenChange={v => { setAberto(v); if (v) setData(valorAtual ?? ''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Previsão de pagamento"
          className={
            valorAtual
              ? 'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 font-medium hover:bg-amber-100 shrink-0'
              : 'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 shrink-0'
          }
        >
          <Calendar size={12}/>
          {valorAtual
            ? `Previsto ${new Date(valorAtual + 'T00:00:00').toLocaleDateString('pt-BR')}`
            : 'Previsão'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" align="start">
        <p className="text-xs font-medium">Previsão de pagamento</p>
        <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-8 text-xs" />
        <div className="flex justify-end gap-1.5">
          {valorAtual && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { onSalvar(''); setAberto(false); }}>Limpar</Button>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={() => { onSalvar(data); setAberto(false); }}>Salvar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
