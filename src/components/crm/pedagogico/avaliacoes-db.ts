import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Tipos locais ate a migration ser aplicada e os tipos Supabase regenerados.
// Mantem o arquivo gerado compartilhado fora deste trabalho paralelo.
export type Avaliacao = {
  id: string;
  titulo: string;
  tipo: 'prova' | 'trabalho';
  turma_id: string | null;
  modulo: string | null;
  instrucoes: string | null;
  prazo_em: string | null;
  status: 'rascunho';
  criado_por: string;
  created_at: string;
  updated_at: string;
};

export type Questao = {
  id: string;
  avaliacao_id: string;
  ordem: number;
  tipo: 'discursiva' | 'objetiva' | 'envio_trabalho';
  enunciado: string;
  resposta_esperada: string | null;
  criterios_correcao: string | null;
  pontos: number;
  created_at: string;
  updated_at: string;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type PedagogicoDatabase = {
  public: {
    Tables: {
      ped_avaliacoes: Table<Avaliacao,
        Pick<Avaliacao, 'titulo' | 'tipo'> & Partial<Pick<Avaliacao, 'turma_id' | 'modulo' | 'instrucoes' | 'prazo_em'>>,
        Partial<Pick<Avaliacao, 'titulo' | 'tipo' | 'turma_id' | 'modulo' | 'instrucoes' | 'prazo_em'>>>;
      ped_questoes: Table<Questao,
        Pick<Questao, 'avaliacao_id' | 'ordem' | 'tipo' | 'enunciado' | 'pontos'> & Partial<Pick<Questao, 'resposta_esperada' | 'criterios_correcao'>>,
        Partial<Pick<Questao, 'tipo' | 'enunciado' | 'pontos' | 'resposta_esperada' | 'criterios_correcao'>>>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export const pedagogicoDb = supabase as unknown as SupabaseClient<PedagogicoDatabase>;
