import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoIdm from '@/assets/logo-idm.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Info = { nome: string; cpf_cadastrado: boolean; nascimento_cadastrado: boolean; endereco_cadastrado: boolean };

async function chamar(acao: string, alunoId: string, chave: string, campos: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('aluno-atualizar-dados', {
    body: { acao, aluno_id: alunoId, chave, ...campos },
  });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.erro || 'Não foi possível acessar seu cadastro.');
    }
    throw new Error('Não foi possível acessar seu cadastro. Tente novamente.');
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export default function AtualizarDados() {
  const { alunoId = '' } = useParams();
  const [params] = useSearchParams();
  const chave = params.get('chave') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepEncontrado, setCepEncontrado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void chamar('info', alunoId, chave).then((data: Info) => {
      if (ativo) { setInfo(data); setErro(''); }
    }).catch((error: Error) => { if (ativo) setErro(error.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [alunoId, chave]);

  // Busca a cidade automaticamente assim que o CEP tem 8 dígitos -- menos
  // chance de nota fiscal rejeitada por cidade/UF escritos errado (achado
  // 2026-10-29: cidade sem UF ou com erro de digitação trava a emissão).
  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) { setCepEncontrado(false); return; }
    let ativo = true;
    setBuscandoCep(true);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then(res => res.json())
      .then((data: { erro?: boolean; logradouro?: string; localidade?: string; uf?: string }) => {
        if (!ativo) return;
        if (data.erro) { setCepEncontrado(false); return; }
        setLogradouro(data.logradouro || '');
        setCidade(data.localidade || '');
        setUf(data.uf || '');
        setCepEncontrado(true);
      })
      .catch(() => { if (ativo) setCepEncontrado(false); })
      .finally(() => { if (ativo) setBuscandoCep(false); });
    return () => { ativo = false; };
  }, [cep]);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;
    setErro(''); setEnviando(true);
    try {
      await chamar('salvar', alunoId, chave, {
        cpf, data_nascimento: nascimento,
        cep, logradouro, numero, complemento, cidade, uf,
      });
      setEnviado(true);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setEnviando(false); }
  }

  const faltaAlgo = info && (!info.cpf_cadastrado || !info.nascimento_cadastrado || !info.endereco_cadastrado);

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-950 p-2 shadow-sm">
          <img src={logoIdm} alt="Logo do Instituto Despertamente" className="h-full w-full object-contain" />
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instituto Despertamente</p>
          <h1 className="text-2xl font-bold">Atualização de cadastro</h1></div>
      </header>
      {carregando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando seus dados...</p>}
      {erro && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {info && <Card><CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Olá, {info.nome.split(' ')[0]}</p>
        <CardTitle>Complete seu cadastro</CardTitle>
        <p className="text-sm text-muted-foreground">Precisamos confirmar alguns dados do seu cadastro -- CPF e data de nascimento pra que a lista de presença das aulas reconheça você automaticamente, e endereço pra conseguirmos emitir sua nota fiscal certinha.</p>
      </CardHeader><CardContent className="space-y-4">
        {enviado ? <div role="status" className="space-y-2 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="text-lg font-semibold">Dados atualizados</h2>
          <p className="text-sm text-muted-foreground">Obrigado! Já pode confirmar presença normalmente nas próximas aulas.</p>
        </div> : !faltaAlgo ? <p className="rounded-lg bg-muted p-3 text-sm">Seu cadastro já está completo, não é necessário fazer nada.</p> : <form onSubmit={(event) => void salvar(event)} className="space-y-4">
          <p className="flex gap-2 rounded-lg bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4 shrink-0" /> Este link é individual. Preenchemos só o que ainda falta no seu cadastro — nada que já está certo será alterado.</p>
          {!info.cpf_cadastrado && <div className="space-y-1.5"><Label htmlFor="atualizar-cpf">CPF</Label><Input id="atualizar-cpf" value={cpf} onChange={event => setCpf(event.target.value)} inputMode="numeric" maxLength={14} autoComplete="off" required /></div>}
          {!info.nascimento_cadastrado && <div className="space-y-1.5"><Label htmlFor="atualizar-nascimento">Data de nascimento</Label><Input id="atualizar-nascimento" type="date" value={nascimento} onChange={event => setNascimento(event.target.value)} required /></div>}
          {!info.endereco_cadastrado && <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Endereço (necessário pra emitir sua nota fiscal)</p>
            <div className="space-y-1.5">
              <Label htmlFor="atualizar-cep">CEP</Label>
              <Input id="atualizar-cep" value={cep} onChange={event => setCep(event.target.value)} inputMode="numeric" maxLength={9} placeholder="00000-000" autoComplete="off" required />
              {buscandoCep && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Buscando endereço...</p>}
              {!buscandoCep && cepEncontrado && cidade && <p className="text-xs text-emerald-600">{cidade}/{uf}</p>}
            </div>
            <div className="space-y-1.5"><Label htmlFor="atualizar-logradouro">Rua</Label><Input id="atualizar-logradouro" value={logradouro} onChange={event => setLogradouro(event.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="atualizar-numero">Número</Label><Input id="atualizar-numero" value={numero} onChange={event => setNumero(event.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="atualizar-complemento">Complemento</Label><Input id="atualizar-complemento" value={complemento} onChange={event => setComplemento(event.target.value)} placeholder="opcional" /></div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5"><Label htmlFor="atualizar-cidade">Cidade</Label><Input id="atualizar-cidade" value={cidade} onChange={event => setCidade(event.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="atualizar-uf">UF</Label><Input id="atualizar-uf" value={uf} onChange={event => setUf(event.target.value.toUpperCase())} maxLength={2} className="w-16" required /></div>
            </div>
          </div>}
          <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar</Button>
        </form>}
      </CardContent></Card>}
      <p className="text-center text-xs text-muted-foreground">Problema com seu cadastro? Fale com a secretaria: <a href="https://wa.me/5511930439385" className="underline">+55 11 93043-9385</a>.</p>
    </div>
  </main>;
}
