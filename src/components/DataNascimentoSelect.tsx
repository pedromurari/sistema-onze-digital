import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function diasNoMes(mes: number, ano: number) {
  return new Date(ano || 2000, mes, 0).getDate();
}

type Props = { value: string; onChange: (value: string) => void; idPrefix: string };

// Três selects em vez de <input type="date">: o seletor nativo do
// celular abre com o ano atual já marcado, e quem só rola dia/mês sem
// perceber que precisa rolar o ano também acaba salvando uma data
// "válida" só que errada (ano de hoje em vez do ano de nascimento).
// Aqui nenhum campo começa preenchido, então a pessoa é obrigada a
// escolher o ano -- não tem como esquecer.
export function DataNascimentoSelect({ value, onChange, idPrefix }: Props) {
  // Estado local pra cada campo -- não dá pra derivar dia/mes/ano só da
  // `value` combinada (bug real: `value` só vira string quando os 3 estão
  // preenchidos, então escolher só o dia fazia ele "sumir" de novo no
  // próximo render, porque dia/mes/ano eram recalculados a partir de uma
  // `value` ainda vazia).
  const [ano, mes, dia] = value ? value.split('-') : ['', '', ''];
  const [anoSel, setAnoSel] = useState(ano);
  const [mesSel, setMesSel] = useState(mes);
  const [diaSel, setDiaSel] = useState(dia);

  // Sincroniza se o formulário for resetado por fora (ex: depois de enviar).
  useEffect(() => { if (!value) { setAnoSel(''); setMesSel(''); setDiaSel(''); } }, [value]);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 100 }, (_, i) => String(anoAtual - i));
  const diaMax = mesSel ? diasNoMes(Number(mesSel), Number(anoSel) || anoAtual) : 31;
  const dias = Array.from({ length: diaMax }, (_, i) => String(i + 1).padStart(2, '0'));

  function atualizar(novoDia: string, novoMes: string, novoAno: string) {
    setDiaSel(novoDia); setMesSel(novoMes); setAnoSel(novoAno);
    onChange(novoDia && novoMes && novoAno ? `${novoAno}-${novoMes}-${novoDia}` : '');
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select value={diaSel} onValueChange={(v) => atualizar(v, mesSel, anoSel)}>
        <SelectTrigger id={`${idPrefix}-dia`}><SelectValue placeholder="Dia" /></SelectTrigger>
        <SelectContent className="max-h-64">{dias.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={mesSel} onValueChange={(v) => atualizar(diaSel, v, anoSel)}>
        <SelectTrigger id={`${idPrefix}-mes`}><SelectValue placeholder="Mês" /></SelectTrigger>
        <SelectContent>{MESES.map((nome, i) => <SelectItem key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={anoSel} onValueChange={(v) => atualizar(diaSel, mesSel, v)}>
        <SelectTrigger id={`${idPrefix}-ano`}><SelectValue placeholder="Ano" /></SelectTrigger>
        <SelectContent className="max-h-64">{anos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
