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
  const [ano, mes, dia] = value ? value.split('-') : ['', '', ''];
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 100 }, (_, i) => String(anoAtual - i));
  const diaMax = mes ? diasNoMes(Number(mes), Number(ano) || anoAtual) : 31;
  const dias = Array.from({ length: diaMax }, (_, i) => String(i + 1).padStart(2, '0'));

  function atualizar(novoDia: string, novoMes: string, novoAno: string) {
    onChange(novoDia && novoMes && novoAno ? `${novoAno}-${novoMes}-${novoDia}` : '');
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select value={dia} onValueChange={(v) => atualizar(v, mes, ano)}>
        <SelectTrigger id={`${idPrefix}-dia`}><SelectValue placeholder="Dia" /></SelectTrigger>
        <SelectContent className="max-h-64">{dias.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={mes} onValueChange={(v) => atualizar(dia, v, ano)}>
        <SelectTrigger id={`${idPrefix}-mes`}><SelectValue placeholder="Mês" /></SelectTrigger>
        <SelectContent>{MESES.map((nome, i) => <SelectItem key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={ano} onValueChange={(v) => atualizar(dia, mes, v)}>
        <SelectTrigger id={`${idPrefix}-ano`}><SelectValue placeholder="Ano" /></SelectTrigger>
        <SelectContent className="max-h-64">{anos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
