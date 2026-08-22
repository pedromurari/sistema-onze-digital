import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chaves } from './keys';

/**
 * Identidade canônica de pessoa (sprint 3).
 *
 * O banco tem 12.121 pessoas para 29.171 linhas de cadastro espalhadas em sete tabelas —
 * 98% desses registros pertencem a alguém que aparece em duas ou mais delas. Aqui o
 * frontend enxerga o ser humano, não o cadastro.
 *
 * A RLS já cuida do escopo: uma investidora só alcança as pessoas das turmas dela, e
 * parceiro não alcança nenhuma. Não é preciso filtrar de novo no cliente.
 */

export type PapelPessoa =
  | 'lead' | 'aluno' | 'parceiro' | 'convidado' | 'investidor' | 'colaborador';

export interface Pessoa {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  criado_em: string;
}

export interface VinculoPessoa {
  id: string;
  pessoa_id: string;
  papel: PapelPessoa;
  origem_tabela: string;
  origem_id: string;
  criado_em: string;
}

export type TipoEventoPessoa =
  | 'lead_criado' | 'fase_mudou' | 'matricula' | 'pagamento' | 'mensagem' | 'evento_npa';

export interface EventoPessoa {
  pessoa_id: string;
  quando: string;
  tipo: TipoEventoPessoa;
  titulo: string;
  detalhe: string | null;
  origem_tabela: string;
  origem_id: string;
}

/** Busca por nome, telefone ou e-mail. O telefone é normalizado no banco. */
export function usePessoas(busca: string) {
  const termo = busca.trim();

  return useQuery({
    queryKey: [...chaves.pessoas.busca(), termo],
    enabled: termo.length >= 3,
    queryFn: async (): Promise<Pessoa[]> => {
      const digitos = termo.replace(/\D/g, '');
      // Telefone entra pelos últimos 8 dígitos: cobre as variações de DDI, zero de
      // operadora e nono dígito sem depender de o usuário digitar no formato certo.
      const filtro = digitos.length >= 8
        ? `telefone.ilike.%${digitos.slice(-8)},nome.ilike.%${termo}%,email.ilike.%${termo}%`
        : `nome.ilike.%${termo}%,email.ilike.%${termo}%`;

      // `as any`: `src/integrations/supabase/types.ts` e gerado e ainda nao conhece as
      // tabelas da sprint 3. Mesmo padrao ja usado no resto do codigo para tabela nova.
      // Regenerar os tipos esta anotado como pendencia.
      const { data, error } = await (supabase as any)
        .from('pessoas')
        .select('id, nome, telefone, email, cpf, criado_em')
        .or(filtro)
        .order('nome')
        .limit(50);

      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
}

/** Onde essa pessoa aparece: lead, aluno, convidado de evento... */
export function useVinculosDaPessoa(pessoaId: string | undefined) {
  return useQuery({
    queryKey: chaves.pessoas.vinculos(pessoaId ?? ''),
    enabled: Boolean(pessoaId),
    queryFn: async (): Promise<VinculoPessoa[]> => {
      const { data, error } = await (supabase as any)
        .from('pessoa_vinculos')
        .select('id, pessoa_id, papel, origem_tabela, origem_id, criado_em')
        .eq('pessoa_id', pessoaId!)
        .order('criado_em');
      if (error) throw error;
      return (data ?? []) as VinculoPessoa[];
    },
  });
}

/**
 * Linha do tempo da pessoa, do mais recente para o mais antigo.
 *
 * O limite existe porque um número usado em testes internos chegou a 6.975 eventos — a
 * maioria mensagens de WhatsApp. Para a ficha, os últimos eventos bastam.
 */
export function useTimelineDaPessoa(pessoaId: string | undefined, limite = 200) {
  return useQuery({
    queryKey: [...chaves.pessoas.timeline(pessoaId ?? ''), limite],
    enabled: Boolean(pessoaId),
    queryFn: async (): Promise<EventoPessoa[]> => {
      const { data, error } = await (supabase as any)
        .from('pessoa_timeline')
        .select('pessoa_id, quando, tipo, titulo, detalhe, origem_tabela, origem_id')
        .eq('pessoa_id', pessoaId!)
        .order('quando', { ascending: false })
        .limit(limite);
      if (error) throw error;
      return (data ?? []) as EventoPessoa[];
    },
  });
}
