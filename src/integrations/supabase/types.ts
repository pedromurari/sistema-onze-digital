export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      aluno_bonus_eventos: {
        Row: {
          acao: string
          aluno_id: string
          bonus_id: string
          created_at: string
          criado_por: string | null
          id: string
        }
        Insert: {
          acao: string
          aluno_id: string
          bonus_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
        }
        Update: {
          acao?: string
          aluno_id?: string
          bonus_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aluno_bonus_eventos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_bonus_eventos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_bonus_eventos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_bonus_eventos_bonus_id_fkey"
            columns: ["bonus_id"]
            isOneToOne: false
            referencedRelation: "bonus_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      aluno_observacoes: {
        Row: {
          aluno_id: string
          created_at: string
          criado_por: string | null
          id: string
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          texto: string
        }
        Insert: {
          aluno_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          texto: string
        }
        Update: {
          aluno_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "aluno_observacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_observacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_observacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
        ]
      }
      alunos: {
        Row: {
          asaas_integrado: boolean | null
          asaas_link: string | null
          autentique_documento_id: string | null
          autentique_link_assinatura: string | null
          cep: string | null
          cidade_estado: string | null
          cobranca_ativa: boolean
          cobranca_ia_ativa: boolean
          cobranca_telefone: string | null
          contrato_arquivo_nome: string | null
          contrato_arquivo_url: string | null
          contrato_assinado: boolean | null
          contrato_assinado_em: string | null
          contrato_baixado: boolean | null
          contrato_enviado: boolean | null
          contrato_enviado_em: string | null
          contrato_link_enviado_em: string | null
          contrato_token: string | null
          cpf: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          data_matricula: string | null
          data_nascimento: string | null
          dia_vencimento: number | null
          dia_vencimento_contrato: string | null
          email: string | null
          endereco: string | null
          forma_pagamento: string | null
          forms_respondido: boolean | null
          forms_respondido_em: string | null
          grupo_turma_confirmado_em: string | null
          grupo_turma_confirmado_por: string | null
          id: string
          lancamento_id: string | null
          lead_quente_contatado_em: string | null
          mensalidades_pagas: number | null
          nome: string
          observacoes: string | null
          origem_lead: string | null
          pais: string | null
          produto: string | null
          rg: string | null
          sexo: string | null
          status: string | null
          tipo_pagamento: string
          total_mensalidades: number | null
          turma_id: string | null
          ultimo_contato_em: string | null
          updated_at: string | null
          valor_mensalidade: number | null
          voomp_integrado: boolean | null
          voomp_link: string | null
          whatsapp: string | null
        }
        Insert: {
          asaas_integrado?: boolean | null
          asaas_link?: string | null
          autentique_documento_id?: string | null
          autentique_link_assinatura?: string | null
          cep?: string | null
          cidade_estado?: string | null
          cobranca_ativa?: boolean
          cobranca_ia_ativa?: boolean
          cobranca_telefone?: string | null
          contrato_arquivo_nome?: string | null
          contrato_arquivo_url?: string | null
          contrato_assinado?: boolean | null
          contrato_assinado_em?: string | null
          contrato_baixado?: boolean | null
          contrato_enviado?: boolean | null
          contrato_enviado_em?: string | null
          contrato_link_enviado_em?: string | null
          contrato_token?: string | null
          cpf?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_matricula?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          dia_vencimento_contrato?: string | null
          email?: string | null
          endereco?: string | null
          forma_pagamento?: string | null
          forms_respondido?: boolean | null
          forms_respondido_em?: string | null
          grupo_turma_confirmado_em?: string | null
          grupo_turma_confirmado_por?: string | null
          id?: string
          lancamento_id?: string | null
          lead_quente_contatado_em?: string | null
          mensalidades_pagas?: number | null
          nome: string
          observacoes?: string | null
          origem_lead?: string | null
          pais?: string | null
          produto?: string | null
          rg?: string | null
          sexo?: string | null
          status?: string | null
          tipo_pagamento?: string
          total_mensalidades?: number | null
          turma_id?: string | null
          ultimo_contato_em?: string | null
          updated_at?: string | null
          valor_mensalidade?: number | null
          voomp_integrado?: boolean | null
          voomp_link?: string | null
          whatsapp?: string | null
        }
        Update: {
          asaas_integrado?: boolean | null
          asaas_link?: string | null
          autentique_documento_id?: string | null
          autentique_link_assinatura?: string | null
          cep?: string | null
          cidade_estado?: string | null
          cobranca_ativa?: boolean
          cobranca_ia_ativa?: boolean
          cobranca_telefone?: string | null
          contrato_arquivo_nome?: string | null
          contrato_arquivo_url?: string | null
          contrato_assinado?: boolean | null
          contrato_assinado_em?: string | null
          contrato_baixado?: boolean | null
          contrato_enviado?: boolean | null
          contrato_enviado_em?: string | null
          contrato_link_enviado_em?: string | null
          contrato_token?: string | null
          cpf?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_matricula?: string | null
          data_nascimento?: string | null
          dia_vencimento?: number | null
          dia_vencimento_contrato?: string | null
          email?: string | null
          endereco?: string | null
          forma_pagamento?: string | null
          forms_respondido?: boolean | null
          forms_respondido_em?: string | null
          grupo_turma_confirmado_em?: string | null
          grupo_turma_confirmado_por?: string | null
          id?: string
          lancamento_id?: string | null
          lead_quente_contatado_em?: string | null
          mensalidades_pagas?: number | null
          nome?: string
          observacoes?: string | null
          origem_lead?: string | null
          pais?: string | null
          produto?: string | null
          rg?: string | null
          sexo?: string | null
          status?: string | null
          tipo_pagamento?: string
          total_mensalidades?: number | null
          turma_id?: string | null
          ultimo_contato_em?: string | null
          updated_at?: string | null
          valor_mensalidade?: number | null
          voomp_integrado?: boolean | null
          voomp_link?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alunos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      aquecimento_chips: {
        Row: {
          ativo: boolean
          consecutive_errors: number
          created_at: string
          data_inicio: string
          dia_contagem: string
          enviados_hoje: number
          evolution_config_id: string
          id: string
          numero_whatsapp: string
          status: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          consecutive_errors?: number
          created_at?: string
          data_inicio?: string
          dia_contagem?: string
          enviados_hoje?: number
          evolution_config_id: string
          id?: string
          numero_whatsapp: string
          status?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          consecutive_errors?: number
          created_at?: string
          data_inicio?: string
          dia_contagem?: string
          enviados_hoje?: number
          evolution_config_id?: string
          id?: string
          numero_whatsapp?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_chips_evolution_config_id_fkey"
            columns: ["evolution_config_id"]
            isOneToOne: true
            referencedRelation: "evolution_config"
            referencedColumns: ["id"]
          },
        ]
      }
      aquecimento_config: {
        Row: {
          ativo: boolean
          created_at: string
          delay_max_s: number
          delay_min_s: number
          id: string
          max_errors_seq: number
          msgs_por_sessao_max: number
          msgs_por_sessao_min: number
          pct_dm: number
          rampa: Json
          safe_hour_end: number
          safe_hour_start: number
          saude_dias_min_pronto: number
          saude_max_desconexoes_7d: number
          saude_taxa_entrega_min: number
          ultimo_plano_data: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          delay_max_s?: number
          delay_min_s?: number
          id?: string
          max_errors_seq?: number
          msgs_por_sessao_max?: number
          msgs_por_sessao_min?: number
          pct_dm?: number
          rampa?: Json
          safe_hour_end?: number
          safe_hour_start?: number
          saude_dias_min_pronto?: number
          saude_max_desconexoes_7d?: number
          saude_taxa_entrega_min?: number
          ultimo_plano_data?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          delay_max_s?: number
          delay_min_s?: number
          id?: string
          max_errors_seq?: number
          msgs_por_sessao_max?: number
          msgs_por_sessao_min?: number
          pct_dm?: number
          rampa?: Json
          safe_hour_end?: number
          safe_hour_start?: number
          saude_dias_min_pronto?: number
          saude_max_desconexoes_7d?: number
          saude_taxa_entrega_min?: number
          ultimo_plano_data?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      aquecimento_grupos: {
        Row: {
          ativo: boolean
          created_at: string
          evolution_config_id: string | null
          grupo_jid: string
          id: string
          membros: string[]
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          evolution_config_id?: string | null
          grupo_jid: string
          id?: string
          membros?: string[]
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          evolution_config_id?: string | null
          grupo_jid?: string
          id?: string
          membros?: string[]
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_grupos_evolution_config_id_fkey"
            columns: ["evolution_config_id"]
            isOneToOne: false
            referencedRelation: "evolution_config"
            referencedColumns: ["id"]
          },
        ]
      }
      aquecimento_jobs: {
        Row: {
          ack_status: string
          chip_destino_id: string | null
          chip_origem_id: string
          created_at: string
          done_at: string | null
          entregue_em: string | null
          error_msg: string | null
          evolution_message_id: string | null
          grupo_id: string | null
          id: string
          lido_em: string | null
          mensagem_texto: string
          scheduled_at: string
          sessao_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          ack_status?: string
          chip_destino_id?: string | null
          chip_origem_id: string
          created_at?: string
          done_at?: string | null
          entregue_em?: string | null
          error_msg?: string | null
          evolution_message_id?: string | null
          grupo_id?: string | null
          id?: string
          lido_em?: string | null
          mensagem_texto: string
          scheduled_at: string
          sessao_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          ack_status?: string
          chip_destino_id?: string | null
          chip_origem_id?: string
          created_at?: string
          done_at?: string | null
          entregue_em?: string | null
          error_msg?: string | null
          evolution_message_id?: string | null
          grupo_id?: string | null
          id?: string
          lido_em?: string | null
          mensagem_texto?: string
          scheduled_at?: string
          sessao_id?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_jobs_chip_destino_id_fkey"
            columns: ["chip_destino_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquecimento_jobs_chip_destino_id_fkey"
            columns: ["chip_destino_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_saude_view"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "aquecimento_jobs_chip_origem_id_fkey"
            columns: ["chip_origem_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquecimento_jobs_chip_origem_id_fkey"
            columns: ["chip_origem_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_saude_view"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "aquecimento_jobs_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      aquecimento_mensagens: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          texto: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          texto: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          texto?: string
          tipo?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      aula_secreta_eventos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          data_evento: string | null
          descricao: string | null
          id: string
          local: string | null
          meta_matriculas: number | null
          nome: string
          sheets_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          data_evento?: string | null
          descricao?: string | null
          id?: string
          local?: string | null
          meta_matriculas?: number | null
          nome: string
          sheets_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          data_evento?: string | null
          descricao?: string | null
          id?: string
          local?: string | null
          meta_matriculas?: number | null
          nome?: string
          sheets_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      aula_secreta_leads: {
        Row: {
          aula_secreta_evento_id: string
          closer: boolean | null
          created_at: string | null
          data_entrada: string | null
          email: string | null
          erro: string | null
          fase: string
          follow_up_01: boolean | null
          follow_up_02: boolean | null
          follow_up_03: boolean | null
          id: string
          ingresso_pago: boolean | null
          matriculado: boolean | null
          nome: string
          observacoes: string | null
          presente_evento: boolean | null
          responsavel_id: string | null
          sheets_row_index: number | null
          ultima_atividade: string | null
          updated_at: string | null
          valor_ingresso: number | null
          valor_matricula: number | null
          whatsapp: string | null
        }
        Insert: {
          aula_secreta_evento_id: string
          closer?: boolean | null
          created_at?: string | null
          data_entrada?: string | null
          email?: string | null
          erro?: string | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          id?: string
          ingresso_pago?: boolean | null
          matriculado?: boolean | null
          nome: string
          observacoes?: string | null
          presente_evento?: boolean | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          ultima_atividade?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_matricula?: number | null
          whatsapp?: string | null
        }
        Update: {
          aula_secreta_evento_id?: string
          closer?: boolean | null
          created_at?: string | null
          data_entrada?: string | null
          email?: string | null
          erro?: string | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          id?: string
          ingresso_pago?: boolean | null
          matriculado?: boolean | null
          nome?: string
          observacoes?: string | null
          presente_evento?: boolean | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          ultima_atividade?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_matricula?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aula_secreta_leads_evento_id_fkey"
            columns: ["aula_secreta_evento_id"]
            isOneToOne: false
            referencedRelation: "aula_secreta_eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      aula_secreta_log: {
        Row: {
          aula_secreta_evento_id: string | null
          created_at: string | null
          evento: string
          id: string
          payload: Json | null
        }
        Insert: {
          aula_secreta_evento_id?: string | null
          created_at?: string | null
          evento: string
          id?: string
          payload?: Json | null
        }
        Update: {
          aula_secreta_evento_id?: string | null
          created_at?: string | null
          evento?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aula_secreta_log_evento_id_fkey"
            columns: ["aula_secreta_evento_id"]
            isOneToOne: false
            referencedRelation: "aula_secreta_eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      balanco_config: {
        Row: {
          id: string
          parametros_cfo: Json
          socios: Json
          taxas: Json
          updated_at: string | null
        }
        Insert: {
          id?: string
          parametros_cfo?: Json
          socios?: Json
          taxas?: Json
          updated_at?: string | null
        }
        Update: {
          id?: string
          parametros_cfo?: Json
          socios?: Json
          taxas?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      balanco_itens: {
        Row: {
          categoria: string
          created_at: string | null
          descricao: string
          empresa: string
          id: string
          mes_referencia: string
          produto: string
          recorrente: boolean
          retorno_realizado: number | null
          tipo: string
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string | null
          descricao: string
          empresa?: string
          id?: string
          mes_referencia: string
          produto?: string
          recorrente?: boolean
          retorno_realizado?: number | null
          tipo: string
          valor: number
        }
        Update: {
          categoria?: string
          created_at?: string | null
          descricao?: string
          empresa?: string
          id?: string
          mes_referencia?: string
          produto?: string
          recorrente?: boolean
          retorno_realizado?: number | null
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      boas_vindas_agendados: {
        Row: {
          agendado_para: string
          criado_em: string | null
          enviado_em: string | null
          erro_msg: string | null
          funnel_name: string
          id: string
          lancamento_id: string | null
          lead_id: string
          lead_tabela: string
          mensagem: string
          nome: string | null
          status: string
          whatsapp: string
        }
        Insert: {
          agendado_para: string
          criado_em?: string | null
          enviado_em?: string | null
          erro_msg?: string | null
          funnel_name: string
          id?: string
          lancamento_id?: string | null
          lead_id: string
          lead_tabela?: string
          mensagem: string
          nome?: string | null
          status?: string
          whatsapp: string
        }
        Update: {
          agendado_para?: string
          criado_em?: string | null
          enviado_em?: string | null
          erro_msg?: string | null
          funnel_name?: string
          id?: string
          lancamento_id?: string | null
          lead_id?: string
          lead_tabela?: string
          mensagem?: string
          nome?: string | null
          status?: string
          whatsapp?: string
        }
        Relationships: []
      }
      boas_vindas_config: {
        Row: {
          ativo: boolean
          auto_agendar: boolean
          created_at: string
          daily_limit: number
          delay_max_s: number
          delay_min_s: number
          delay_minutos: number
          dia_contagem: string
          email_assunto: string
          email_ativo: boolean
          email_corpo: string
          enviados_hoje: number
          erros_seq: number
          funnel_name: string
          id: string
          max_errors_seq: number
          pausado_por_erro: boolean
          safe_hour_end: number
          safe_hour_start: number
          updated_at: string
          wpp_ativo: boolean
          wpp_instance_name: string | null
          wpp_media_url: string | null
          wpp_mensagem: string
          wpp_mensagem_tarde: string | null
          wpp_message_type: string
        }
        Insert: {
          ativo?: boolean
          auto_agendar?: boolean
          created_at?: string
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          delay_minutos?: number
          dia_contagem?: string
          email_assunto?: string
          email_ativo?: boolean
          email_corpo?: string
          enviados_hoje?: number
          erros_seq?: number
          funnel_name: string
          id?: string
          max_errors_seq?: number
          pausado_por_erro?: boolean
          safe_hour_end?: number
          safe_hour_start?: number
          updated_at?: string
          wpp_ativo?: boolean
          wpp_instance_name?: string | null
          wpp_media_url?: string | null
          wpp_mensagem?: string
          wpp_mensagem_tarde?: string | null
          wpp_message_type?: string
        }
        Update: {
          ativo?: boolean
          auto_agendar?: boolean
          created_at?: string
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          delay_minutos?: number
          dia_contagem?: string
          email_assunto?: string
          email_ativo?: boolean
          email_corpo?: string
          enviados_hoje?: number
          erros_seq?: number
          funnel_name?: string
          id?: string
          max_errors_seq?: number
          pausado_por_erro?: boolean
          safe_hour_end?: number
          safe_hour_start?: number
          updated_at?: string
          wpp_ativo?: boolean
          wpp_instance_name?: string | null
          wpp_media_url?: string | null
          wpp_mensagem?: string
          wpp_mensagem_tarde?: string | null
          wpp_message_type?: string
        }
        Relationships: []
      }
      boas_vindas_logs: {
        Row: {
          email: string | null
          email_error: string | null
          email_status: string
          funnel_name: string
          id: string
          nome: string | null
          respondeu_em: string | null
          sent_at: string
          ultima_resposta: string | null
          whatsapp: string | null
          wpp_error: string | null
          wpp_status: string
        }
        Insert: {
          email?: string | null
          email_error?: string | null
          email_status?: string
          funnel_name: string
          id?: string
          nome?: string | null
          respondeu_em?: string | null
          sent_at?: string
          ultima_resposta?: string | null
          whatsapp?: string | null
          wpp_error?: string | null
          wpp_status?: string
        }
        Update: {
          email?: string | null
          email_error?: string | null
          email_status?: string
          funnel_name?: string
          id?: string
          nome?: string | null
          respondeu_em?: string | null
          sent_at?: string
          ultima_resposta?: string | null
          whatsapp?: string | null
          wpp_error?: string | null
          wpp_status?: string
        }
        Relationships: []
      }
      bonus_tipos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      canais_cobranca: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      chat_leituras: {
        Row: {
          lida_em: string
          telefone: string
          user_id: string
        }
        Insert: {
          lida_em?: string
          telefone: string
          user_id: string
        }
        Update: {
          lida_em?: string
          telefone?: string
          user_id?: string
        }
        Relationships: []
      }
      cobranca_config: {
        Row: {
          ativo: boolean
          created_at: string
          daily_limit: number
          delay_max_s: number
          delay_min_s: number
          dia_contagem: string
          dias_pos_vencimento: number[]
          dias_pre_vencimento: number[]
          enviados_hoje: number
          enviar_apenas_dias_uteis: boolean
          enviar_no_vencimento: boolean
          enviar_pos_vencimento: boolean
          enviar_pre_vencimento: boolean
          erros_seq: number
          evolution_config_ids: string[]
          horario_envio: string
          horario_fim_envio: string | null
          horario_inicio_envio: string | null
          id: string
          max_errors_seq: number
          pausado_por_erro: boolean
          pausar_fins_semana: boolean
          produto_slug: string | null
          ultimo_envio_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          dia_contagem?: string
          dias_pos_vencimento?: number[]
          dias_pre_vencimento?: number[]
          enviados_hoje?: number
          enviar_apenas_dias_uteis?: boolean
          enviar_no_vencimento?: boolean
          enviar_pos_vencimento?: boolean
          enviar_pre_vencimento?: boolean
          erros_seq?: number
          evolution_config_ids?: string[]
          horario_envio?: string
          horario_fim_envio?: string | null
          horario_inicio_envio?: string | null
          id?: string
          max_errors_seq?: number
          pausado_por_erro?: boolean
          pausar_fins_semana?: boolean
          produto_slug?: string | null
          ultimo_envio_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          dia_contagem?: string
          dias_pos_vencimento?: number[]
          dias_pre_vencimento?: number[]
          enviados_hoje?: number
          enviar_apenas_dias_uteis?: boolean
          enviar_no_vencimento?: boolean
          enviar_pos_vencimento?: boolean
          enviar_pre_vencimento?: boolean
          erros_seq?: number
          evolution_config_ids?: string[]
          horario_envio?: string
          horario_fim_envio?: string | null
          horario_inicio_envio?: string | null
          id?: string
          max_errors_seq?: number
          pausado_por_erro?: boolean
          pausar_fins_semana?: boolean
          produto_slug?: string | null
          ultimo_envio_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_config_produto_slug_fkey"
            columns: ["produto_slug"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["slug"]
          },
        ]
      }
      cobranca_ia_conversas: {
        Row: {
          aluno_id: string
          aluno_nome: string
          cobranca_log_id: string | null
          created_at: string
          data_prometida: string | null
          evolution_instance: string
          id: string
          motivo_handoff: string | null
          pagamento_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          resumo_ia: string | null
          status: string
          telefone: string
          turnos_ia: number
          ultima_mensagem_em: string | null
          updated_at: string
        }
        Insert: {
          aluno_id: string
          aluno_nome?: string
          cobranca_log_id?: string | null
          created_at?: string
          data_prometida?: string | null
          evolution_instance: string
          id?: string
          motivo_handoff?: string | null
          pagamento_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resumo_ia?: string | null
          status?: string
          telefone: string
          turnos_ia?: number
          ultima_mensagem_em?: string | null
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          aluno_nome?: string
          cobranca_log_id?: string | null
          created_at?: string
          data_prometida?: string | null
          evolution_instance?: string
          id?: string
          motivo_handoff?: string | null
          pagamento_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resumo_ia?: string | null
          status?: string
          telefone?: string
          turnos_ia?: number
          ultima_mensagem_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_ia_conversas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_ia_conversas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_ia_conversas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_ia_conversas_cobranca_log_id_fkey"
            columns: ["cobranca_log_id"]
            isOneToOne: false
            referencedRelation: "cobranca_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_ia_conversas_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_ia_conversas_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_receita_por_fonte"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_ia_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
          meta: Json | null
          papel: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          papel: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_ia_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "cobranca_ia_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_logs: {
        Row: {
          agendado_para: string | null
          aluno_id: string | null
          aluno_nome: string
          created_at: string
          enviado_em: string | null
          enviado_por: string | null
          erro_msg: string | null
          grupo_envio_id: string | null
          id: string
          manual: boolean
          mensagem: string
          pagamento_id: string | null
          respondeu_em: string | null
          status: string
          telefone: string
          template_id: string | null
          template_nome: string | null
          template_tipo: string | null
          ultima_resposta: string | null
        }
        Insert: {
          agendado_para?: string | null
          aluno_id?: string | null
          aluno_nome?: string
          created_at?: string
          enviado_em?: string | null
          enviado_por?: string | null
          erro_msg?: string | null
          grupo_envio_id?: string | null
          id?: string
          manual?: boolean
          mensagem: string
          pagamento_id?: string | null
          respondeu_em?: string | null
          status?: string
          telefone: string
          template_id?: string | null
          template_nome?: string | null
          template_tipo?: string | null
          ultima_resposta?: string | null
        }
        Update: {
          agendado_para?: string | null
          aluno_id?: string | null
          aluno_nome?: string
          created_at?: string
          enviado_em?: string | null
          enviado_por?: string | null
          erro_msg?: string | null
          grupo_envio_id?: string | null
          id?: string
          manual?: boolean
          mensagem?: string
          pagamento_id?: string | null
          respondeu_em?: string | null
          status?: string
          telefone?: string
          template_id?: string | null
          template_nome?: string | null
          template_tipo?: string | null
          ultima_resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_logs_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "vw_receita_por_fonte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cobranca_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_templates: {
        Row: {
          ativo: boolean
          created_at: string
          dias_offset: number
          dias_offset_fim: number | null
          id: string
          mensagem: string
          nome: string
          ordem: number
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dias_offset?: number
          dias_offset_fim?: number | null
          id?: string
          mensagem: string
          nome: string
          ordem?: number
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dias_offset?: number
          dias_offset_fim?: number | null
          id?: string
          mensagem?: string
          nome?: string
          ordem?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cobranca_turmas_ativas: {
        Row: {
          ativado_em: string
          turma_id: string
        }
        Insert: {
          ativado_em?: string
          turma_id: string
        }
        Update: {
          ativado_em?: string
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_turmas_ativas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "cobranca_turmas_ativas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_turmas_ativas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: true
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      conteudo_calendario: {
        Row: {
          angulo: string | null
          aprovado: boolean | null
          aprovado_em: string | null
          cliente_id: string | null
          created_at: string | null
          created_by: string | null
          cta_texto: string | null
          data_publicacao: string | null
          evento_id: string | null
          formato: string | null
          formato_1x1: boolean | null
          formato_4x5: boolean | null
          formato_9x16: boolean | null
          gerado_por: string | null
          hook: string | null
          id: string
          imagem_url: string | null
          legenda: string | null
          link: string | null
          nota_auditoria: number | null
          observacoes: string | null
          plataforma: string | null
          produto_slug: string | null
          prompt_imagem: string | null
          responsavel: string | null
          slack_message_ts: string | null
          status: string | null
          texto_peca: string | null
          tipo_conteudo: string | null
          titulo: string
        }
        Insert: {
          angulo?: string | null
          aprovado?: boolean | null
          aprovado_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          cta_texto?: string | null
          data_publicacao?: string | null
          evento_id?: string | null
          formato?: string | null
          formato_1x1?: boolean | null
          formato_4x5?: boolean | null
          formato_9x16?: boolean | null
          gerado_por?: string | null
          hook?: string | null
          id?: string
          imagem_url?: string | null
          legenda?: string | null
          link?: string | null
          nota_auditoria?: number | null
          observacoes?: string | null
          plataforma?: string | null
          produto_slug?: string | null
          prompt_imagem?: string | null
          responsavel?: string | null
          slack_message_ts?: string | null
          status?: string | null
          texto_peca?: string | null
          tipo_conteudo?: string | null
          titulo: string
        }
        Update: {
          angulo?: string | null
          aprovado?: boolean | null
          aprovado_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          created_by?: string | null
          cta_texto?: string | null
          data_publicacao?: string | null
          evento_id?: string | null
          formato?: string | null
          formato_1x1?: boolean | null
          formato_4x5?: boolean | null
          formato_9x16?: boolean | null
          gerado_por?: string | null
          hook?: string | null
          id?: string
          imagem_url?: string | null
          legenda?: string | null
          link?: string | null
          nota_auditoria?: number | null
          observacoes?: string | null
          plataforma?: string | null
          produto_slug?: string | null
          prompt_imagem?: string | null
          responsavel?: string | null
          slack_message_ts?: string | null
          status?: string | null
          texto_peca?: string | null
          tipo_conteudo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteudo_calendario_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_calendario_produto_slug_fkey"
            columns: ["produto_slug"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["slug"]
          },
        ]
      }
      conteudo_clientes: {
        Row: {
          arquetipos_visuais_evitar: string[] | null
          arquetipos_visuais_preferidos: string[] | null
          ativo: boolean | null
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string | null
          cta_padrao: string | null
          estilo_visual: string
          formula_headline: string | null
          fundos_fixos: string[] | null
          hashtags_fixas: string[] | null
          id: string
          instagram_handle: string | null
          logo_url: string | null
          nicho: string | null
          nome: string
          pilares_conteudo: string[] | null
          publico_alvo: string | null
          slug: string
          temas_evitar: string[] | null
          tom_de_voz: string | null
          updated_at: string | null
        }
        Insert: {
          arquetipos_visuais_evitar?: string[] | null
          arquetipos_visuais_preferidos?: string[] | null
          ativo?: boolean | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          cta_padrao?: string | null
          estilo_visual?: string
          formula_headline?: string | null
          fundos_fixos?: string[] | null
          hashtags_fixas?: string[] | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          nicho?: string | null
          nome: string
          pilares_conteudo?: string[] | null
          publico_alvo?: string | null
          slug: string
          temas_evitar?: string[] | null
          tom_de_voz?: string | null
          updated_at?: string | null
        }
        Update: {
          arquetipos_visuais_evitar?: string[] | null
          arquetipos_visuais_preferidos?: string[] | null
          ativo?: boolean | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          cta_padrao?: string | null
          estilo_visual?: string
          formula_headline?: string | null
          fundos_fixos?: string[] | null
          hashtags_fixas?: string[] | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          nicho?: string | null
          nome?: string
          pilares_conteudo?: string[] | null
          publico_alvo?: string | null
          slug?: string
          temas_evitar?: string[] | null
          tom_de_voz?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conteudo_posts: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          arquetipo_visual: string | null
          blueprint_id: string | null
          blueprint_versao: number | null
          cliente_id: string
          created_at: string | null
          data_post: string
          formato: string | null
          headline: string | null
          id: string
          imagem_feed_url: string | null
          imagem_stories_url: string | null
          legenda: string | null
          pilar: string | null
          qa_visual: Json
          qa_visual_status: string
          reaproveitavel: boolean
          status: string | null
          tema: string | null
          tema_fonte: string | null
          updated_at: string | null
          vezes_reaproveitado: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquetipo_visual?: string | null
          blueprint_id?: string | null
          blueprint_versao?: number | null
          cliente_id: string
          created_at?: string | null
          data_post?: string
          formato?: string | null
          headline?: string | null
          id?: string
          imagem_feed_url?: string | null
          imagem_stories_url?: string | null
          legenda?: string | null
          pilar?: string | null
          qa_visual?: Json
          qa_visual_status?: string
          reaproveitavel?: boolean
          status?: string | null
          tema?: string | null
          tema_fonte?: string | null
          updated_at?: string | null
          vezes_reaproveitado?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquetipo_visual?: string | null
          blueprint_id?: string | null
          blueprint_versao?: number | null
          cliente_id?: string
          created_at?: string | null
          data_post?: string
          formato?: string | null
          headline?: string | null
          id?: string
          imagem_feed_url?: string | null
          imagem_stories_url?: string | null
          legenda?: string | null
          pilar?: string | null
          qa_visual?: Json
          qa_visual_status?: string
          reaproveitavel?: boolean
          status?: string | null
          tema?: string | null
          tema_fonte?: string | null
          updated_at?: string | null
          vezes_reaproveitado?: number
        }
        Relationships: [
          {
            foreignKeyName: "conteudo_posts_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_posts_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteudo_posts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_config: {
        Row: {
          chave: string | null
          created_at: string | null
          id: string
          valor: string | null
        }
        Insert: {
          chave?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Update: {
          chave?: string | null
          created_at?: string | null
          id?: string
          valor?: string | null
        }
        Relationships: []
      }
      cursos: {
        Row: {
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      ddd_regioes: {
        Row: {
          cidade: string
          ddd: number
          estado: string
          uf: string
        }
        Insert: {
          cidade: string
          ddd: number
          estado: string
          uf: string
        }
        Update: {
          cidade?: string
          ddd?: number
          estado?: string
          uf?: string
        }
        Relationships: []
      }
      disparo_campanhas: {
        Row: {
          callback_url: string | null
          consecutive_errors: number
          created_at: string
          created_by: string | null
          daily_limit: number
          delay_max_s: number
          delay_min_s: number
          descricao: string | null
          email_contato: string | null
          evolution_config_id: string
          evolution_config_ids: string[]
          id: string
          leads_error: number
          leads_sent: number
          leads_skipped: number
          leads_total: number
          max_errors_seq: number
          media_url: string | null
          mention_everyone: boolean | null
          message_type: string
          next_send_at: string | null
          nome: string
          safe_hour_end: number
          safe_hour_start: number
          status: string
          template: string | null
          updated_at: string
        }
        Insert: {
          callback_url?: string | null
          consecutive_errors?: number
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          descricao?: string | null
          email_contato?: string | null
          evolution_config_id?: string
          evolution_config_ids?: string[]
          id?: string
          leads_error?: number
          leads_sent?: number
          leads_skipped?: number
          leads_total?: number
          max_errors_seq?: number
          media_url?: string | null
          mention_everyone?: boolean | null
          message_type?: string
          next_send_at?: string | null
          nome: string
          safe_hour_end?: number
          safe_hour_start?: number
          status?: string
          template?: string | null
          updated_at?: string
        }
        Update: {
          callback_url?: string | null
          consecutive_errors?: number
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          delay_max_s?: number
          delay_min_s?: number
          descricao?: string | null
          email_contato?: string | null
          evolution_config_id?: string
          evolution_config_ids?: string[]
          id?: string
          leads_error?: number
          leads_sent?: number
          leads_skipped?: number
          leads_total?: number
          max_errors_seq?: number
          media_url?: string | null
          mention_everyone?: boolean | null
          message_type?: string
          next_send_at?: string | null
          nome?: string
          safe_hour_end?: number
          safe_hour_start?: number
          status?: string
          template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      disparo_leads: {
        Row: {
          ack_status: string | null
          campanha_id: string
          created_at: string
          email: string | null
          entregue_em: string | null
          error_msg: string | null
          evolution_message_id: string | null
          id: string
          instance_id: string | null
          lido_em: string | null
          nome: string | null
          ordem: number | null
          phone: string
          reenviado_apos_falha: boolean
          respondeu_em: string | null
          sent_at: string | null
          status: string
          temperatura: string
          ultima_resposta: string | null
          variaveis: Json | null
        }
        Insert: {
          ack_status?: string | null
          campanha_id: string
          created_at?: string
          email?: string | null
          entregue_em?: string | null
          error_msg?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          lido_em?: string | null
          nome?: string | null
          ordem?: number | null
          phone: string
          reenviado_apos_falha?: boolean
          respondeu_em?: string | null
          sent_at?: string | null
          status?: string
          temperatura?: string
          ultima_resposta?: string | null
          variaveis?: Json | null
        }
        Update: {
          ack_status?: string | null
          campanha_id?: string
          created_at?: string
          email?: string | null
          entregue_em?: string | null
          error_msg?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          lido_em?: string | null
          nome?: string | null
          ordem?: number | null
          phone?: string
          reenviado_apos_falha?: boolean
          respondeu_em?: string | null
          sent_at?: string | null
          status?: string
          temperatura?: string
          ultima_resposta?: string | null
          variaveis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "disparo_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparo_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_config: {
        Row: {
          api_key: string
          ativo: boolean
          created_at: string
          from_email: string
          from_name: string
          id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string
          ativo?: boolean
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          ativo?: boolean
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipe: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          cor: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          cor?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          cor?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      equipe_11ds_agentes: {
        Row: {
          aplica: string[] | null
          avatar_url: string | null
          cargo: string | null
          executor_function: string
          id: string
          nome: string
          ordem: number | null
          regras: string[] | null
          responsabilidade: string | null
          slug: string | null
          status: string | null
          status_texto: string | null
          time_id: string
          updated_at: string | null
        }
        Insert: {
          aplica?: string[] | null
          avatar_url?: string | null
          cargo?: string | null
          executor_function?: string
          id?: string
          nome: string
          ordem?: number | null
          regras?: string[] | null
          responsabilidade?: string | null
          slug?: string | null
          status?: string | null
          status_texto?: string | null
          time_id: string
          updated_at?: string | null
        }
        Update: {
          aplica?: string[] | null
          avatar_url?: string | null
          cargo?: string | null
          executor_function?: string
          id?: string
          nome?: string
          ordem?: number | null
          regras?: string[] | null
          responsabilidade?: string | null
          slug?: string | null
          status?: string | null
          status_texto?: string | null
          time_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_agentes_time_id_fkey"
            columns: ["time_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_times"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_blueprints: {
        Row: {
          base_visual_url: string | null
          cliente_id: string
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          referencia_url: string | null
          spec: Json
          status: string
          substitui_id: string | null
          tipo: string
          updated_at: string
          versao: number
        }
        Insert: {
          base_visual_url?: string | null
          cliente_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          referencia_url?: string | null
          spec?: Json
          status?: string
          substitui_id?: string | null
          tipo: string
          updated_at?: string
          versao: number
        }
        Update: {
          base_visual_url?: string | null
          cliente_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          referencia_url?: string | null
          spec?: Json
          status?: string
          substitui_id?: string | null
          tipo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_blueprints_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_blueprints_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_blueprints_substitui_id_fkey"
            columns: ["substitui_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_chat_acoes: {
        Row: {
          agente_id: string
          concluido_em: string | null
          confirmado_em: string | null
          created_at: string
          erro_mensagem: string | null
          estado: string
          id: string
          payload: Json
          resultado: Json | null
          resumo: string
          solicitante_id: string
          tipo: string
        }
        Insert: {
          agente_id: string
          concluido_em?: string | null
          confirmado_em?: string | null
          created_at?: string
          erro_mensagem?: string | null
          estado?: string
          id?: string
          payload?: Json
          resultado?: Json | null
          resumo: string
          solicitante_id: string
          tipo: string
        }
        Update: {
          agente_id?: string
          concluido_em?: string | null
          confirmado_em?: string | null
          created_at?: string
          erro_mensagem?: string | null
          estado?: string
          id?: string
          payload?: Json
          resultado?: Json | null
          resumo?: string
          solicitante_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_chat_acoes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_chat_acoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_chat_mensagens: {
        Row: {
          acao_id: string | null
          agente_id: string
          conteudo: string
          created_at: string
          id: string
          papel: string
          plano_id: string | null
          solicitante_id: string
        }
        Insert: {
          acao_id?: string | null
          agente_id: string
          conteudo: string
          created_at?: string
          id?: string
          papel: string
          plano_id?: string | null
          solicitante_id: string
        }
        Update: {
          acao_id?: string | null
          agente_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          papel?: string
          plano_id?: string | null
          solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_chat_mensagens_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_chat_acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_chat_mensagens_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_chat_mensagens_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_chat_mensagens_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_ferramenta_chamadas: {
        Row: {
          concluido_em: string | null
          created_at: string
          duracao_ms: number | null
          entrada_hash: string
          erro_mensagem: string | null
          etapa_id: string
          evidencia: string | null
          ferramenta: string
          id: string
          plano_id: string
          resultado: Json | null
          status: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          duracao_ms?: number | null
          entrada_hash: string
          erro_mensagem?: string | null
          etapa_id: string
          evidencia?: string | null
          ferramenta: string
          id?: string
          plano_id: string
          resultado?: Json | null
          status?: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          duracao_ms?: number | null
          entrada_hash?: string
          erro_mensagem?: string | null
          etapa_id?: string
          evidencia?: string | null
          ferramenta?: string
          id?: string
          plano_id?: string
          resultado?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_ferramenta_chamadas_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_plano_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_ferramenta_chamadas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_planos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_memorias: {
        Row: {
          agente_id: string | null
          agentes_consumidores: string[]
          caminho_obsidian: string | null
          cliente_id: string | null
          confianca: number
          conteudo_hash: string
          created_at: string
          erro_sync: string | null
          escopo: string
          evidencia: Json
          github_sha: string | null
          id: string
          invalidada_em: string | null
          origem: string
          plano_id: string | null
          prioridade: number
          proxima_tentativa_em: string | null
          regra: string | null
          resumo: string
          sincronizada_em: string | null
          solicitante_id: string
          status: string
          substitui_id: string | null
          tentativas_sync: number
          tipo: string
          updated_at: string
        }
        Insert: {
          agente_id?: string | null
          agentes_consumidores?: string[]
          caminho_obsidian?: string | null
          cliente_id?: string | null
          confianca?: number
          conteudo_hash: string
          created_at?: string
          erro_sync?: string | null
          escopo: string
          evidencia?: Json
          github_sha?: string | null
          id?: string
          invalidada_em?: string | null
          origem?: string
          plano_id?: string | null
          prioridade?: number
          proxima_tentativa_em?: string | null
          regra?: string | null
          resumo: string
          sincronizada_em?: string | null
          solicitante_id: string
          status?: string
          substitui_id?: string | null
          tentativas_sync?: number
          tipo: string
          updated_at?: string
        }
        Update: {
          agente_id?: string | null
          agentes_consumidores?: string[]
          caminho_obsidian?: string | null
          cliente_id?: string | null
          confianca?: number
          conteudo_hash?: string
          created_at?: string
          erro_sync?: string | null
          escopo?: string
          evidencia?: Json
          github_sha?: string | null
          id?: string
          invalidada_em?: string | null
          origem?: string
          plano_id?: string | null
          prioridade?: number
          proxima_tentativa_em?: string | null
          regra?: string | null
          resumo?: string
          sincronizada_em?: string | null
          solicitante_id?: string
          status?: string
          substitui_id?: string | null
          tentativas_sync?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_memorias_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_memorias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_memorias_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_memorias_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_memorias_substitui_id_fkey"
            columns: ["substitui_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_memorias"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_mensagens: {
        Row: {
          agente_id: string
          conteudo: string
          created_at: string
          id: string
          tarefa_id: string
          tipo: string
        }
        Insert: {
          agente_id: string
          conteudo: string
          created_at?: string
          id?: string
          tarefa_id: string
          tipo?: string
        }
        Update: {
          agente_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          tarefa_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_mensagens_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_mensagens_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_plano_etapas: {
        Row: {
          agente_id: string | null
          agente_slug: string
          chave: string
          concluido_em: string | null
          created_at: string
          depende_de: string[]
          descricao: string
          erro_mensagem: string | null
          evidencia: string | null
          ferramenta: string
          id: string
          iniciado_em: string | null
          ordem: number
          parametros: Json
          plano_id: string
          resultado: Json | null
          status: string
          tentativas: number
          titulo: string
          updated_at: string
        }
        Insert: {
          agente_id?: string | null
          agente_slug: string
          chave: string
          concluido_em?: string | null
          created_at?: string
          depende_de?: string[]
          descricao: string
          erro_mensagem?: string | null
          evidencia?: string | null
          ferramenta: string
          id?: string
          iniciado_em?: string | null
          ordem: number
          parametros?: Json
          plano_id: string
          resultado?: Json | null
          status?: string
          tentativas?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          agente_id?: string | null
          agente_slug?: string
          chave?: string
          concluido_em?: string | null
          created_at?: string
          depende_de?: string[]
          descricao?: string
          erro_mensagem?: string | null
          evidencia?: string | null
          ferramenta?: string
          id?: string
          iniciado_em?: string | null
          ordem?: number
          parametros?: Json
          plano_id?: string
          resultado?: Json | null
          status?: string
          tentativas?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_plano_etapas_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_plano_etapas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_planos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_planos: {
        Row: {
          agente_responsavel_id: string
          alteracoes_previstas: string[]
          concluido_em: string | null
          confirmado_em: string | null
          contexto: Json
          created_at: string
          efeitos_externos: string[]
          erro_mensagem: string | null
          id: string
          iniciado_em: string | null
          objetivo: string
          resultado_resumo: string | null
          resumo: string
          solicitante_id: string
          status: string
          updated_at: string
          versao_hash: string
        }
        Insert: {
          agente_responsavel_id: string
          alteracoes_previstas?: string[]
          concluido_em?: string | null
          confirmado_em?: string | null
          contexto?: Json
          created_at?: string
          efeitos_externos?: string[]
          erro_mensagem?: string | null
          id?: string
          iniciado_em?: string | null
          objetivo: string
          resultado_resumo?: string | null
          resumo: string
          solicitante_id: string
          status?: string
          updated_at?: string
          versao_hash: string
        }
        Update: {
          agente_responsavel_id?: string
          alteracoes_previstas?: string[]
          concluido_em?: string | null
          confirmado_em?: string | null
          contexto?: Json
          created_at?: string
          efeitos_externos?: string[]
          erro_mensagem?: string | null
          id?: string
          iniciado_em?: string | null
          objetivo?: string
          resultado_resumo?: string | null
          resumo?: string
          solicitante_id?: string
          status?: string
          updated_at?: string
          versao_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_planos_agente_responsavel_id_fkey"
            columns: ["agente_responsavel_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_planos_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_recorrentes: {
        Row: {
          agente_id: string
          ativo: boolean | null
          cliente_id: string | null
          created_at: string | null
          criado_por: string | null
          id: string
          ordem_texto: string
          tipo: string
        }
        Insert: {
          agente_id: string
          ativo?: boolean | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          ordem_texto: string
          tipo?: string
        }
        Update: {
          agente_id?: string
          ativo?: boolean | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          ordem_texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_recorrentes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_recorrentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_recorrentes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_tarefas: {
        Row: {
          agente_id: string
          anexos: Json | null
          cliente_id: string | null
          concluido_em: string | null
          conteudo_post_id: string | null
          created_at: string | null
          criado_por: string | null
          dados: Json | null
          erro_mensagem: string | null
          id: string
          iniciado_em: string | null
          ordem_texto: string
          recorrente_id: string | null
          resposta_texto: string | null
          status: string | null
          tipo: string
        }
        Insert: {
          agente_id: string
          anexos?: Json | null
          cliente_id?: string | null
          concluido_em?: string | null
          conteudo_post_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados?: Json | null
          erro_mensagem?: string | null
          id?: string
          iniciado_em?: string | null
          ordem_texto: string
          recorrente_id?: string | null
          resposta_texto?: string | null
          status?: string | null
          tipo?: string
        }
        Update: {
          agente_id?: string
          anexos?: Json | null
          cliente_id?: string | null
          concluido_em?: string | null
          conteudo_post_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados?: Json | null
          erro_mensagem?: string | null
          id?: string
          iniciado_em?: string | null
          ordem_texto?: string
          recorrente_id?: string | null
          resposta_texto?: string | null
          status?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_11ds_tarefas_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_agentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_tarefas_conteudo_post_id_fkey"
            columns: ["conteudo_post_id"]
            isOneToOne: false
            referencedRelation: "conteudo_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_tarefas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_11ds_tarefas_recorrente_id_fkey"
            columns: ["recorrente_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_recorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_11ds_times: {
        Row: {
          created_at: string | null
          emoji: string | null
          id: string
          nome: string
          ordem: number | null
          slug: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          nome: string
          ordem?: number | null
          slug: string
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          slug?: string
        }
        Relationships: []
      }
      eventos_calendario: {
        Row: {
          cor: string | null
          created_at: string | null
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          id: string
          tipo: string | null
          titulo: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fim?: string | null
          data_inicio: string
          descricao?: string | null
          id?: string
          tipo?: string | null
          titulo: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          tipo?: string | null
          titulo?: string
        }
        Relationships: []
      }
      evolution_conexao_eventos: {
        Row: {
          created_at: string
          evolution_config_id: string | null
          id: string
          instance_name: string
          state: string
        }
        Insert: {
          created_at?: string
          evolution_config_id?: string | null
          id?: string
          instance_name: string
          state: string
        }
        Update: {
          created_at?: string
          evolution_config_id?: string | null
          id?: string
          instance_name?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_conexao_eventos_evolution_config_id_fkey"
            columns: ["evolution_config_id"]
            isOneToOne: false
            referencedRelation: "evolution_config"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_config: {
        Row: {
          api_key: string
          api_url: string
          ativo: boolean
          created_at: string
          id: string
          instance_name: string
          prioridade: number
          updated_at: string
        }
        Insert: {
          api_key?: string
          api_url?: string
          ativo?: boolean
          created_at?: string
          id?: string
          instance_name?: string
          prioridade?: number
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          ativo?: boolean
          created_at?: string
          id?: string
          instance_name?: string
          prioridade?: number
          updated_at?: string
        }
        Relationships: []
      }
      evolution_task_config: {
        Row: {
          instance_ids: string[]
          task: string
          updated_at: string | null
        }
        Insert: {
          instance_ids?: string[]
          task: string
          updated_at?: string | null
        }
        Update: {
          instance_ids?: string[]
          task?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fechamentos: {
        Row: {
          bruto: number
          created_at: string
          fechado_em: string | null
          fechado_por: string | null
          id: string
          liquido: number
          periodo_fim: string
          periodo_inicio: string
          periodo_key: string
          periodo_tipo: string
          reaberto_em: string | null
          repasses: Json
          saidas_operacionais: number
          saldo_final: number
          saldo_idm: number
          status: string
          taxas: number
          total_pagamentos: number
        }
        Insert: {
          bruto?: number
          created_at?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          liquido?: number
          periodo_fim: string
          periodo_inicio: string
          periodo_key: string
          periodo_tipo: string
          reaberto_em?: string | null
          repasses?: Json
          saidas_operacionais?: number
          saldo_final?: number
          saldo_idm?: number
          status?: string
          taxas?: number
          total_pagamentos?: number
        }
        Update: {
          bruto?: number
          created_at?: string
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          liquido?: number
          periodo_fim?: string
          periodo_inicio?: string
          periodo_key?: string
          periodo_tipo?: string
          reaberto_em?: string | null
          repasses?: Json
          saidas_operacionais?: number
          saldo_final?: number
          saldo_idm?: number
          status?: string
          taxas?: number
          total_pagamentos?: number
        }
        Relationships: []
      }
      fontes: {
        Row: {
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      franquia_campanha: {
        Row: {
          cliques: number
          cpl: number | null
          created_at: string
          ctr: number | null
          data: string
          gasto: number
          id: string
          impressoes: number
          leads_count: number
        }
        Insert: {
          cliques?: number
          cpl?: number | null
          created_at?: string
          ctr?: number | null
          data?: string
          gasto?: number
          id?: string
          impressoes?: number
          leads_count?: number
        }
        Update: {
          cliques?: number
          cpl?: number | null
          created_at?: string
          ctr?: number | null
          data?: string
          gasto?: number
          id?: string
          impressoes?: number
          leads_count?: number
        }
        Relationships: []
      }
      franquia_leads: {
        Row: {
          cidade: string | null
          created_at: string
          dados_extras: Json | null
          email: string | null
          estado: string | null
          fase: string
          id: string
          nome: string
          observacoes: string | null
          updated_at: string
          vendedor_id: string | null
          whatsapp: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          dados_extras?: Json | null
          email?: string | null
          estado?: string | null
          fase?: string
          id?: string
          nome: string
          observacoes?: string | null
          updated_at?: string
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          dados_extras?: Json | null
          email?: string | null
          estado?: string | null
          fase?: string
          id?: string
          nome?: string
          observacoes?: string | null
          updated_at?: string
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      funnel_configs: {
        Row: {
          created_at: string
          funnel_name: string
          grupo_1_id: string
          grupo_2_id: string
          id: string
          imagem_manha: string
          imagem_noite: string
          imagem_tarde: string
          imagens: Json
          updated_at: string
          variaveis: Json
        }
        Insert: {
          created_at?: string
          funnel_name: string
          grupo_1_id?: string
          grupo_2_id?: string
          id?: string
          imagem_manha?: string
          imagem_noite?: string
          imagem_tarde?: string
          imagens?: Json
          updated_at?: string
          variaveis?: Json
        }
        Update: {
          created_at?: string
          funnel_name?: string
          grupo_1_id?: string
          grupo_2_id?: string
          id?: string
          imagem_manha?: string
          imagem_noite?: string
          imagem_tarde?: string
          imagens?: Json
          updated_at?: string
          variaveis?: Json
        }
        Relationships: []
      }
      funnel_messages: {
        Row: {
          created_at: string
          day_number: number
          error_message: string | null
          funnel_name: string
          id: string
          link_preview: boolean
          media_url: string | null
          mention_everyone: boolean
          message_text: string
          message_type: string
          poll_name: string | null
          poll_options: Json | null
          poll_selectable_count: number
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["funnel_recipient_type"]
          scheduled_at: string
          send_header_image: boolean
          sent_at: string | null
          status: Database["public"]["Enums"]["funnel_message_status"]
          subtipo: string | null
          update_group_picture: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number: number
          error_message?: string | null
          funnel_name: string
          id?: string
          link_preview?: boolean
          media_url?: string | null
          mention_everyone?: boolean
          message_text: string
          message_type?: string
          poll_name?: string | null
          poll_options?: Json | null
          poll_selectable_count?: number
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["funnel_recipient_type"]
          scheduled_at: string
          send_header_image?: boolean
          sent_at?: string | null
          status?: Database["public"]["Enums"]["funnel_message_status"]
          subtipo?: string | null
          update_group_picture?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          error_message?: string | null
          funnel_name?: string
          id?: string
          link_preview?: boolean
          media_url?: string | null
          mention_everyone?: boolean
          message_text?: string
          message_type?: string
          poll_name?: string | null
          poll_options?: Json | null
          poll_selectable_count?: number
          recipient_id?: string
          recipient_type?: Database["public"]["Enums"]["funnel_recipient_type"]
          scheduled_at?: string
          send_header_image?: boolean
          sent_at?: string | null
          status?: Database["public"]["Enums"]["funnel_message_status"]
          subtipo?: string | null
          update_group_picture?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      funnel_poll_respostas: {
        Row: {
          event_type: string
          evolution_instance: string | null
          funnel_message_id: string | null
          funnel_name: string | null
          group_jid: string
          id: string
          poll_creation_message_id: string | null
          poll_name: string | null
          raw_payload: Json
          received_at: string
          selected_option_text: string | null
          selected_options_hash: Json | null
          voter_jid: string | null
          voter_phone: string | null
        }
        Insert: {
          event_type: string
          evolution_instance?: string | null
          funnel_message_id?: string | null
          funnel_name?: string | null
          group_jid: string
          id?: string
          poll_creation_message_id?: string | null
          poll_name?: string | null
          raw_payload: Json
          received_at?: string
          selected_option_text?: string | null
          selected_options_hash?: Json | null
          voter_jid?: string | null
          voter_phone?: string | null
        }
        Update: {
          event_type?: string
          evolution_instance?: string | null
          funnel_message_id?: string | null
          funnel_name?: string | null
          group_jid?: string
          id?: string
          poll_creation_message_id?: string | null
          poll_name?: string | null
          raw_payload?: Json
          received_at?: string
          selected_option_text?: string | null
          selected_options_hash?: Json | null
          voter_jid?: string | null
          voter_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_poll_respostas_funnel_message_id_fkey"
            columns: ["funnel_message_id"]
            isOneToOne: false
            referencedRelation: "funnel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_add_jobs: {
        Row: {
          action: string
          created_at: string
          done_at: string | null
          id: string
          lancamento_id: string
          lead_id: string
          result: string | null
          result_detail: string | null
          scheduled_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          done_at?: string | null
          id?: string
          lancamento_id: string
          lead_id: string
          result?: string | null
          result_detail?: string | null
          scheduled_at: string
        }
        Update: {
          action?: string
          created_at?: string
          done_at?: string | null
          id?: string
          lancamento_id?: string
          lead_id?: string
          result?: string | null
          result_detail?: string | null
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_add_jobs_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_add_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lancamento_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_add_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lancamento_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      idm_criativos_log: {
        Row: {
          created_at: string | null
          criativos_gerados: number | null
          erro_msg: string | null
          evento_id: string | null
          evento_tipo: string | null
          id: string
          n8n_execution_id: string | null
          produto_slug: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          criativos_gerados?: number | null
          erro_msg?: string | null
          evento_id?: string | null
          evento_tipo?: string | null
          id?: string
          n8n_execution_id?: string | null
          produto_slug?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          criativos_gerados?: number | null
          erro_msg?: string | null
          evento_id?: string | null
          evento_tipo?: string | null
          id?: string
          n8n_execution_id?: string | null
          produto_slug?: string | null
          status?: string | null
        }
        Relationships: []
      }
      idm_quiz_leads: {
        Row: {
          checkout_clicked: boolean
          created_at: string
          desconto_pct: string | null
          email: string | null
          filho_nascimento: string | null
          filho_nome: string | null
          id: string
          lead_popup_submitted: boolean
          mae_nome: string | null
          page_referrer: string | null
          perfil_nome: string | null
          perfil_numero: number | null
          phone_number: string | null
          pontuacao: number | null
          resp_q4: string | null
          resp_q5: string[] | null
          resp_q6: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          checkout_clicked?: boolean
          created_at?: string
          desconto_pct?: string | null
          email?: string | null
          filho_nascimento?: string | null
          filho_nome?: string | null
          id?: string
          lead_popup_submitted?: boolean
          mae_nome?: string | null
          page_referrer?: string | null
          perfil_nome?: string | null
          perfil_numero?: number | null
          phone_number?: string | null
          pontuacao?: number | null
          resp_q4?: string | null
          resp_q5?: string[] | null
          resp_q6?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          checkout_clicked?: boolean
          created_at?: string
          desconto_pct?: string | null
          email?: string | null
          filho_nascimento?: string | null
          filho_nome?: string | null
          id?: string
          lead_popup_submitted?: boolean
          mae_nome?: string | null
          page_referrer?: string | null
          perfil_nome?: string | null
          perfil_numero?: number | null
          phone_number?: string | null
          pontuacao?: number | null
          resp_q4?: string | null
          resp_q5?: string[] | null
          resp_q6?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      kanban_colunas: {
        Row: {
          aula_secreta_evento_id: string | null
          cor: string | null
          created_at: string | null
          fase_id: string | null
          id: string
          lancamento_id: string | null
          leads_quadro_id: string | null
          meta_leads: number | null
          nome: string
          npa_evento_id: string | null
          ordem: number
          tipo_regra: string | null
          updated_at: string | null
        }
        Insert: {
          aula_secreta_evento_id?: string | null
          cor?: string | null
          created_at?: string | null
          fase_id?: string | null
          id?: string
          lancamento_id?: string | null
          leads_quadro_id?: string | null
          meta_leads?: number | null
          nome: string
          npa_evento_id?: string | null
          ordem?: number
          tipo_regra?: string | null
          updated_at?: string | null
        }
        Update: {
          aula_secreta_evento_id?: string | null
          cor?: string | null
          created_at?: string | null
          fase_id?: string | null
          id?: string
          lancamento_id?: string | null
          leads_quadro_id?: string | null
          meta_leads?: number | null
          nome?: string
          npa_evento_id?: string | null
          ordem?: number
          tipo_regra?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanban_colunas_aula_secreta_evento_id_fkey"
            columns: ["aula_secreta_evento_id"]
            isOneToOne: false
            referencedRelation: "aula_secreta_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_colunas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_colunas_leads_quadro_id_fkey"
            columns: ["leads_quadro_id"]
            isOneToOne: false
            referencedRelation: "leads_quadros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_colunas_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_colunas_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_kanban"
            referencedColumns: ["npa_evento_id"]
          },
        ]
      }
      lancamento_campanhas: {
        Row: {
          created_at: string
          id: string
          lancamento_id: string
          meta_access_token: string | null
          meta_ad_account_id: string | null
          meta_campaign_id: string | null
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          id?: string
          lancamento_id: string
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          nome?: string
          ordem?: number
        }
        Update: {
          created_at?: string
          id?: string
          lancamento_id?: string
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_campanhas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamento_eventos: {
        Row: {
          created_at: string | null
          evento: string
          id: string
          lancamento_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          evento: string
          id?: string
          lancamento_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          evento?: string
          id?: string
          lancamento_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_eventos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamento_leads: {
        Row: {
          bv_enviado: boolean | null
          bv_enviado_em: string | null
          cidade: string | null
          created_at: string | null
          crm: boolean | null
          data_entrada: string | null
          disparo: boolean | null
          email: string | null
          enviado: boolean | null
          erro: string | null
          fase: string
          follow_up_01: boolean | null
          follow_up_02: boolean | null
          follow_up_03: boolean | null
          grupo_oferta: boolean | null
          id: string
          lancamento_id: string
          matriculado: boolean | null
          no_grupo: boolean | null
          nome: string
          observacoes: string | null
          responsavel_id: string | null
          sheets_row_index: number | null
          ultima_atividade: string | null
          ultima_resposta: string | null
          ultima_resposta_at: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          bv_enviado?: boolean | null
          bv_enviado_em?: string | null
          cidade?: string | null
          created_at?: string | null
          crm?: boolean | null
          data_entrada?: string | null
          disparo?: boolean | null
          email?: string | null
          enviado?: boolean | null
          erro?: string | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          grupo_oferta?: boolean | null
          id?: string
          lancamento_id: string
          matriculado?: boolean | null
          no_grupo?: boolean | null
          nome: string
          observacoes?: string | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          ultima_atividade?: string | null
          ultima_resposta?: string | null
          ultima_resposta_at?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          bv_enviado?: boolean | null
          bv_enviado_em?: string | null
          cidade?: string | null
          created_at?: string | null
          crm?: boolean | null
          data_entrada?: string | null
          disparo?: boolean | null
          email?: string | null
          enviado?: boolean | null
          erro?: string | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          grupo_oferta?: boolean | null
          id?: string
          lancamento_id?: string
          matriculado?: boolean | null
          no_grupo?: boolean | null
          nome?: string
          observacoes?: string | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          ultima_atividade?: string | null
          ultima_resposta?: string | null
          ultima_resposta_at?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_leads_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          data_live: string | null
          descricao: string | null
          dia_vencimento_destino: number | null
          grupo_lancamento_jid: string | null
          grupo_oferta_jid: string | null
          id: string
          meta_access_token: string | null
          meta_ad_account_id: string | null
          meta_campaign_id: string | null
          meta_faturamento: number | null
          meta_leads: number | null
          meta_matriculas: number | null
          nome: string
          produto_destino: string | null
          professor_convidado: string | null
          responsavel_id: string | null
          sheets_id: string | null
          slogan: string | null
          status: string | null
          total_mensalidades_destino: number | null
          turma_destino_id: string | null
          updated_at: string | null
          valor_matricula: number | null
          valor_mensalidade_destino: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          data_live?: string | null
          descricao?: string | null
          dia_vencimento_destino?: number | null
          grupo_lancamento_jid?: string | null
          grupo_oferta_jid?: string | null
          id?: string
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          meta_faturamento?: number | null
          meta_leads?: number | null
          meta_matriculas?: number | null
          nome: string
          produto_destino?: string | null
          professor_convidado?: string | null
          responsavel_id?: string | null
          sheets_id?: string | null
          slogan?: string | null
          status?: string | null
          total_mensalidades_destino?: number | null
          turma_destino_id?: string | null
          updated_at?: string | null
          valor_matricula?: number | null
          valor_mensalidade_destino?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          data_live?: string | null
          descricao?: string | null
          dia_vencimento_destino?: number | null
          grupo_lancamento_jid?: string | null
          grupo_oferta_jid?: string | null
          id?: string
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          meta_faturamento?: number | null
          meta_leads?: number | null
          meta_matriculas?: number | null
          nome?: string
          produto_destino?: string | null
          professor_convidado?: string | null
          responsavel_id?: string | null
          sheets_id?: string | null
          slogan?: string | null
          status?: string | null
          total_mensalidades_destino?: number | null
          turma_destino_id?: string | null
          updated_at?: string | null
          valor_matricula?: number | null
          valor_mensalidade_destino?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "lancamentos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_respostas: {
        Row: {
          evolution_instance: string | null
          id: string
          lancamento_id: string | null
          lead_id: string | null
          lida: boolean
          mensagem: string | null
          mensagem_tipo: string | null
          phone: string
          recebido_em: string
        }
        Insert: {
          evolution_instance?: string | null
          id?: string
          lancamento_id?: string | null
          lead_id?: string | null
          lida?: boolean
          mensagem?: string | null
          mensagem_tipo?: string | null
          phone: string
          recebido_em?: string
        }
        Update: {
          evolution_instance?: string | null
          id?: string
          lancamento_id?: string | null
          lead_id?: string | null
          lida?: boolean
          mensagem?: string | null
          mensagem_tipo?: string | null
          phone?: string
          recebido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_respostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lancamento_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_respostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lancamento_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          criado_em: string | null
          email: string | null
          id: string
          lancamento_id: string | null
          nome: string
          observacoes: string | null
          origem: string | null
          produto: string | null
          responsavel_id: string | null
          status: string | null
          telefone: string | null
          turma_id: string | null
          ultima_atividade: string | null
          valor_potencial: number | null
          whatsapp: string | null
        }
        Insert: {
          criado_em?: string | null
          email?: string | null
          id?: string
          lancamento_id?: string | null
          nome: string
          observacoes?: string | null
          origem?: string | null
          produto?: string | null
          responsavel_id?: string | null
          status?: string | null
          telefone?: string | null
          turma_id?: string | null
          ultima_atividade?: string | null
          valor_potencial?: number | null
          whatsapp?: string | null
        }
        Update: {
          criado_em?: string | null
          email?: string | null
          id?: string
          lancamento_id?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string | null
          produto?: string | null
          responsavel_id?: string | null
          status?: string | null
          telefone?: string | null
          turma_id?: string | null
          ultima_atividade?: string | null
          valor_potencial?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "leads_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_quadro_cards: {
        Row: {
          coluna_id: string | null
          created_at: string
          id: string
          observacoes: string | null
          origem_id: string
          origem_tabela: string
          quadro_id: string
          updated_at: string
        }
        Insert: {
          coluna_id?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem_id: string
          origem_tabela: string
          quadro_id: string
          updated_at?: string
        }
        Update: {
          coluna_id?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem_id?: string
          origem_tabela?: string
          quadro_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_quadro_cards_coluna_id_fkey"
            columns: ["coluna_id"]
            isOneToOne: false
            referencedRelation: "kanban_colunas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_quadro_cards_quadro_id_fkey"
            columns: ["quadro_id"]
            isOneToOne: false
            referencedRelation: "leads_quadros"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_quadros: {
        Row: {
          created_at: string
          filtro: Json
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filtro?: Json
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filtro?: Json
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      lista_espera_cidades: {
        Row: {
          cidade: string
          created_at: string
          email: string | null
          id: string
          nome: string
          origem: string
          whatsapp: string
        }
        Insert: {
          cidade: string
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          origem?: string
          whatsapp: string
        }
        Update: {
          cidade?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          origem?: string
          whatsapp?: string
        }
        Relationships: []
      }
      midia_imagens_reaproveitaveis: {
        Row: {
          arquetipo_visual: string | null
          cliente_id: string | null
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string
          origem: string
          vezes_reaproveitado: number
        }
        Insert: {
          arquetipo_visual?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url: string
          origem: string
          vezes_reaproveitado?: number
        }
        Update: {
          arquetipo_visual?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string
          origem?: string
          vezes_reaproveitado?: number
        }
        Relationships: [
          {
            foreignKeyName: "midia_imagens_reaproveitaveis_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_map_connections: {
        Row: {
          animado: boolean | null
          cor: string | null
          created_at: string | null
          destino_id: string | null
          espessura: number | null
          estilo: string | null
          id: string
          label: string | null
          marcador_fim: string | null
          marcador_inicio: string | null
          no_destino_id: string | null
          no_origem_id: string | null
          origem_id: string | null
          tipo: string | null
          tipo_linha: string | null
          user_id: string | null
          workspace: string | null
        }
        Insert: {
          animado?: boolean | null
          cor?: string | null
          created_at?: string | null
          destino_id?: string | null
          espessura?: number | null
          estilo?: string | null
          id?: string
          label?: string | null
          marcador_fim?: string | null
          marcador_inicio?: string | null
          no_destino_id?: string | null
          no_origem_id?: string | null
          origem_id?: string | null
          tipo?: string | null
          tipo_linha?: string | null
          user_id?: string | null
          workspace?: string | null
        }
        Update: {
          animado?: boolean | null
          cor?: string | null
          created_at?: string | null
          destino_id?: string | null
          espessura?: number | null
          estilo?: string | null
          id?: string
          label?: string | null
          marcador_fim?: string | null
          marcador_inicio?: string | null
          no_destino_id?: string | null
          no_origem_id?: string | null
          origem_id?: string | null
          tipo?: string | null
          tipo_linha?: string | null
          user_id?: string | null
          workspace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mind_map_connections_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "mind_map_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mind_map_connections_no_destino_id_fkey"
            columns: ["no_destino_id"]
            isOneToOne: false
            referencedRelation: "mind_map_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mind_map_connections_no_origem_id_fkey"
            columns: ["no_origem_id"]
            isOneToOne: false
            referencedRelation: "mind_map_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mind_map_connections_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "mind_map_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_map_nodes: {
        Row: {
          altura: number | null
          color: string | null
          cor: string | null
          cor_borda: string | null
          cor_texto: string | null
          created_at: string | null
          descricao: string | null
          emoji: string | null
          espessura_borda: number | null
          fase: string | null
          font_size: number | null
          font_style: string | null
          font_weight: string | null
          formato: string | null
          height: number | null
          id: string
          largura: number | null
          meta_alvo: number | null
          meta_atual: number | null
          meta_unidade: string | null
          notas: string | null
          pai_id: string | null
          posicao_x: number | null
          posicao_y: number | null
          position_x: number | null
          position_y: number | null
          responsavel_id: string | null
          responsavel_nome: string | null
          sublabel: string | null
          tags: string[] | null
          tamanho: string | null
          tipo: string | null
          title: string | null
          titulo: string | null
          type: string | null
          user_id: string | null
          width: number | null
          workspace: string | null
          x: number | null
          y: number | null
        }
        Insert: {
          altura?: number | null
          color?: string | null
          cor?: string | null
          cor_borda?: string | null
          cor_texto?: string | null
          created_at?: string | null
          descricao?: string | null
          emoji?: string | null
          espessura_borda?: number | null
          fase?: string | null
          font_size?: number | null
          font_style?: string | null
          font_weight?: string | null
          formato?: string | null
          height?: number | null
          id?: string
          largura?: number | null
          meta_alvo?: number | null
          meta_atual?: number | null
          meta_unidade?: string | null
          notas?: string | null
          pai_id?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          position_x?: number | null
          position_y?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          sublabel?: string | null
          tags?: string[] | null
          tamanho?: string | null
          tipo?: string | null
          title?: string | null
          titulo?: string | null
          type?: string | null
          user_id?: string | null
          width?: number | null
          workspace?: string | null
          x?: number | null
          y?: number | null
        }
        Update: {
          altura?: number | null
          color?: string | null
          cor?: string | null
          cor_borda?: string | null
          cor_texto?: string | null
          created_at?: string | null
          descricao?: string | null
          emoji?: string | null
          espessura_borda?: number | null
          fase?: string | null
          font_size?: number | null
          font_style?: string | null
          font_weight?: string | null
          formato?: string | null
          height?: number | null
          id?: string
          largura?: number | null
          meta_alvo?: number | null
          meta_atual?: number | null
          meta_unidade?: string | null
          notas?: string | null
          pai_id?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          position_x?: number | null
          position_y?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          sublabel?: string | null
          tags?: string[] | null
          tamanho?: string | null
          tipo?: string | null
          title?: string | null
          titulo?: string | null
          type?: string | null
          user_id?: string | null
          width?: number | null
          workspace?: string | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mind_map_nodes_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "mind_map_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      mind_map_pages: {
        Row: {
          cor: string | null
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          emoji: string | null
          id: string
          nome: string
          ordem: number | null
          tipo: string | null
          updated_at: string | null
          workspace: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          emoji?: string | null
          id?: string
          nome: string
          ordem?: number | null
          tipo?: string | null
          updated_at?: string | null
          workspace?: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          emoji?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          tipo?: string | null
          updated_at?: string | null
          workspace?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          lida: boolean
          link: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      npa_evento_leads: {
        Row: {
          bv_enviado: boolean | null
          bv_enviado_em: string | null
          closer: boolean | null
          comprou_material: boolean | null
          created_at: string | null
          data_entrada: string | null
          email: string | null
          erro: string | null
          esteve_no_evento: boolean | null
          fase: string
          follow_up_01: boolean | null
          follow_up_02: boolean | null
          follow_up_03: boolean | null
          id: string
          ingresso_pago: boolean | null
          material_entregue_em: string | null
          matriculado: boolean | null
          no_grupo: boolean | null
          nome: string
          npa_evento_id: string
          observacoes: string | null
          pix_codigo: string | null
          pix_enviado: boolean | null
          pix_enviado_em: string | null
          presente_evento: boolean | null
          responsavel_id: string | null
          sheets_row_index: number | null
          turma: string | null
          ultima_atividade: string | null
          updated_at: string | null
          valor_ingresso: number | null
          valor_material: number | null
          valor_matricula: number | null
          whatsapp: string | null
        }
        Insert: {
          bv_enviado?: boolean | null
          bv_enviado_em?: string | null
          closer?: boolean | null
          comprou_material?: boolean | null
          created_at?: string | null
          data_entrada?: string | null
          email?: string | null
          erro?: string | null
          esteve_no_evento?: boolean | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          id?: string
          ingresso_pago?: boolean | null
          material_entregue_em?: string | null
          matriculado?: boolean | null
          no_grupo?: boolean | null
          nome: string
          npa_evento_id: string
          observacoes?: string | null
          pix_codigo?: string | null
          pix_enviado?: boolean | null
          pix_enviado_em?: string | null
          presente_evento?: boolean | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          turma?: string | null
          ultima_atividade?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_material?: number | null
          valor_matricula?: number | null
          whatsapp?: string | null
        }
        Update: {
          bv_enviado?: boolean | null
          bv_enviado_em?: string | null
          closer?: boolean | null
          comprou_material?: boolean | null
          created_at?: string | null
          data_entrada?: string | null
          email?: string | null
          erro?: string | null
          esteve_no_evento?: boolean | null
          fase?: string
          follow_up_01?: boolean | null
          follow_up_02?: boolean | null
          follow_up_03?: boolean | null
          id?: string
          ingresso_pago?: boolean | null
          material_entregue_em?: string | null
          matriculado?: boolean | null
          no_grupo?: boolean | null
          nome?: string
          npa_evento_id?: string
          observacoes?: string | null
          pix_codigo?: string | null
          pix_enviado?: boolean | null
          pix_enviado_em?: string | null
          presente_evento?: boolean | null
          responsavel_id?: string | null
          sheets_row_index?: number | null
          turma?: string | null
          ultima_atividade?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_material?: number | null
          valor_matricula?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "npa_leads_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npa_leads_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_kanban"
            referencedColumns: ["npa_evento_id"]
          },
        ]
      }
      npa_eventos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          data_evento: string | null
          descricao: string | null
          ebook_url: string | null
          id: string
          local: string | null
          meta_faturamento: number | null
          meta_ingressos: number | null
          meta_matriculas: number | null
          meta_presentes: number | null
          nome: string
          pix_mensagem_template: string | null
          professor_convidado: string | null
          responsavel_id: string | null
          sheets_id: string | null
          slogan: string | null
          slug: string | null
          status: string | null
          telas_liberado: boolean
          telas_liberado_em: string | null
          telas_url: string | null
          turma_destino_id: string | null
          updated_at: string | null
          valor_ingresso: number | null
          valor_material_padrao: number | null
          vega_produto_id: string | null
          vega_produto_tarde: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          data_evento?: string | null
          descricao?: string | null
          ebook_url?: string | null
          id?: string
          local?: string | null
          meta_faturamento?: number | null
          meta_ingressos?: number | null
          meta_matriculas?: number | null
          meta_presentes?: number | null
          nome: string
          pix_mensagem_template?: string | null
          professor_convidado?: string | null
          responsavel_id?: string | null
          sheets_id?: string | null
          slogan?: string | null
          slug?: string | null
          status?: string | null
          telas_liberado?: boolean
          telas_liberado_em?: string | null
          telas_url?: string | null
          turma_destino_id?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_material_padrao?: number | null
          vega_produto_id?: string | null
          vega_produto_tarde?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          data_evento?: string | null
          descricao?: string | null
          ebook_url?: string | null
          id?: string
          local?: string | null
          meta_faturamento?: number | null
          meta_ingressos?: number | null
          meta_matriculas?: number | null
          meta_presentes?: number | null
          nome?: string
          pix_mensagem_template?: string | null
          professor_convidado?: string | null
          responsavel_id?: string | null
          sheets_id?: string | null
          slogan?: string | null
          slug?: string | null
          status?: string | null
          telas_liberado?: boolean
          telas_liberado_em?: string | null
          telas_url?: string | null
          turma_destino_id?: string | null
          updated_at?: string | null
          valor_ingresso?: number | null
          valor_material_padrao?: number | null
          vega_produto_id?: string | null
          vega_produto_tarde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "npa_eventos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npa_eventos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "npa_eventos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npa_eventos_turma_destino_id_fkey"
            columns: ["turma_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      npa_eventos_log: {
        Row: {
          created_at: string | null
          evento: string
          id: string
          npa_evento_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          evento: string
          id?: string
          npa_evento_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          evento?: string
          id?: string
          npa_evento_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "npa_eventos_log_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npa_eventos_log_npa_evento_id_fkey"
            columns: ["npa_evento_id"]
            isOneToOne: false
            referencedRelation: "npa_kanban"
            referencedColumns: ["npa_evento_id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          aluno_id: string | null
          canal_cobranca: string | null
          cobranca_contatado_em: string | null
          conferido_em: string | null
          conferido_por: string | null
          created_at: string | null
          data_pagamento: string | null
          data_prevista_pagamento: string | null
          data_vencimento: string | null
          id: string
          mes_referencia: string
          numero_parcela: number | null
          observacoes: string | null
          produto: string | null
          status: string | null
          taxa_valor: number | null
          turma_id: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          aluno_id?: string | null
          canal_cobranca?: string | null
          cobranca_contatado_em?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_prevista_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia: string
          numero_parcela?: number | null
          observacoes?: string | null
          produto?: string | null
          status?: string | null
          taxa_valor?: number | null
          turma_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          aluno_id?: string | null
          canal_cobranca?: string | null
          cobranca_contatado_em?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_prevista_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          mes_referencia?: string
          numero_parcela?: number | null
          observacoes?: string | null
          produto?: string | null
          status?: string | null
          taxa_valor?: number | null
          turma_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          email: string | null
          id: string
          mp_access_token: string | null
          mp_connected_at: string | null
          mp_public_key: string | null
          mp_refresh_token: string | null
          mp_user_id: number | null
          nome: string
          observacoes: string | null
          pix_chave: string | null
          status_contrato: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: number | null
          nome: string
          observacoes?: string | null
          pix_chave?: string | null
          status_contrato?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          mp_access_token?: string | null
          mp_connected_at?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_user_id?: number | null
          nome?: string
          observacoes?: string | null
          pix_chave?: string | null
          status_contrato?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      parceiros_cliques: {
        Row: {
          created_at: string | null
          id: string
          link_id: string
          referrer: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          link_id: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          link_id?: string
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_cliques_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "parceiros_links"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_cupons: {
        Row: {
          ativo: boolean | null
          codigo: string
          comissao_pct: number | null
          created_at: string | null
          desconto_pct: number | null
          id: string
          parceiro_afiliado_id: string
          produto_id: string
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          comissao_pct?: number | null
          created_at?: string | null
          desconto_pct?: number | null
          id?: string
          parceiro_afiliado_id: string
          produto_id: string
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          comissao_pct?: number | null
          created_at?: string | null
          desconto_pct?: number | null
          id?: string
          parceiro_afiliado_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_cupons_parceiro_afiliado_id_fkey"
            columns: ["parceiro_afiliado_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_cupons_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_cupons_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_entregas: {
        Row: {
          created_at: string | null
          criado_por: string | null
          destinos: string[] | null
          id: string
          parceiro_id: string
          produto_id: string | null
          roteiro: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          destinos?: string[] | null
          id?: string
          parceiro_id: string
          produto_id?: string | null
          roteiro?: string | null
          status?: string
          tipo: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          destinos?: string[] | null
          id?: string
          parceiro_id?: string
          produto_id?: string | null
          roteiro?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_entregas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_entregas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_entregas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_entregas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_entregas_arquivos: {
        Row: {
          created_at: string | null
          entrega_id: string
          enviado_por: string | null
          id: string
          nome: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          entrega_id: string
          enviado_por?: string | null
          id?: string
          nome?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          entrega_id?: string
          enviado_por?: string | null
          id?: string
          nome?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_entregas_arquivos_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "parceiros_entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_entregas_arquivos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_entregas_comentarios: {
        Row: {
          autor_id: string | null
          created_at: string | null
          entrega_id: string
          id: string
          mensagem: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string | null
          entrega_id: string
          id?: string
          mensagem: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string | null
          entrega_id?: string
          id?: string
          mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_entregas_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_entregas_comentarios_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "parceiros_entregas"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_links: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          destino_url: string
          id: string
          parceira_nome: string | null
          parceiro_id: string
          produto_id: string | null
          produto_nome: string | null
          slug: string
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          destino_url: string
          id?: string
          parceira_nome?: string | null
          parceiro_id: string
          produto_id?: string | null
          produto_nome?: string | null
          slug: string
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          destino_url?: string
          id?: string
          parceira_nome?: string | null
          parceiro_id?: string
          produto_id?: string | null
          produto_nome?: string | null
          slug?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_links_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_links_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_links_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_metas: {
        Row: {
          created_at: string | null
          id: string
          parceiro_id: string
          periodo_mes: string
          produto_id: string | null
          tipo: string
          valor_meta: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          parceiro_id: string
          periodo_mes: string
          produto_id?: string | null
          tipo: string
          valor_meta: number
        }
        Update: {
          created_at?: string | null
          id?: string
          parceiro_id?: string
          periodo_mes?: string
          produto_id?: string | null
          tipo?: string
          valor_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_metas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_metas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_metas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_produtos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          bump_ativo: boolean
          bump_descricao: string | null
          bump_nome: string | null
          bump_preco: number | null
          checkout_link_syncpay: string | null
          comissao_afiliado_padrao_pct: number | null
          comissao_idm_pct: number | null
          comissao_parceiro_pct: number | null
          created_at: string | null
          descricao: string | null
          id: string
          integra_seu_numerologo: boolean
          material_url: string | null
          meta_access_token: string | null
          meta_ad_account_id: string | null
          meta_campaign_id: string | null
          nome: string
          pagina_vendas_url: string | null
          parceiro_id: string
          preco: number | null
          status: string | null
          syncpay_checkout_url: string | null
          syncpay_product_token: string | null
          syncpay_taxa_fixa: number | null
          updated_at: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bump_ativo?: boolean
          bump_descricao?: string | null
          bump_nome?: string | null
          bump_preco?: number | null
          checkout_link_syncpay?: string | null
          comissao_afiliado_padrao_pct?: number | null
          comissao_idm_pct?: number | null
          comissao_parceiro_pct?: number | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          integra_seu_numerologo?: boolean
          material_url?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          nome: string
          pagina_vendas_url?: string | null
          parceiro_id: string
          preco?: number | null
          status?: string | null
          syncpay_checkout_url?: string | null
          syncpay_product_token?: string | null
          syncpay_taxa_fixa?: number | null
          updated_at?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bump_ativo?: boolean
          bump_descricao?: string | null
          bump_nome?: string | null
          bump_preco?: number | null
          checkout_link_syncpay?: string | null
          comissao_afiliado_padrao_pct?: number | null
          comissao_idm_pct?: number | null
          comissao_parceiro_pct?: number | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          integra_seu_numerologo?: boolean
          material_url?: string | null
          meta_access_token?: string | null
          meta_ad_account_id?: string | null
          meta_campaign_id?: string | null
          nome?: string
          pagina_vendas_url?: string | null
          parceiro_id?: string
          preco?: number | null
          status?: string | null
          syncpay_checkout_url?: string | null
          syncpay_product_token?: string | null
          syncpay_taxa_fixa?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_produtos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_produtos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_vendas: {
        Row: {
          acesso_liberado: boolean
          acesso_liberado_em: string | null
          bump_incluido: boolean
          comissao_afiliado: number | null
          comissao_afiliado_paga: boolean | null
          comissao_afiliado_paga_em: string | null
          comissao_idm: number | null
          comprador_email: string | null
          comprador_nome: string | null
          comprador_whatsapp: string | null
          created_at: string | null
          cupom_id: string | null
          id: string
          mp_payment_id: string | null
          origem: string
          produto_id: string
          raw_payload: Json | null
          status: string
          syncpay_transaction_id: string | null
          updated_at: string | null
          valor_bruto: number
          valor_liquido: number | null
        }
        Insert: {
          acesso_liberado?: boolean
          acesso_liberado_em?: string | null
          bump_incluido?: boolean
          comissao_afiliado?: number | null
          comissao_afiliado_paga?: boolean | null
          comissao_afiliado_paga_em?: string | null
          comissao_idm?: number | null
          comprador_email?: string | null
          comprador_nome?: string | null
          comprador_whatsapp?: string | null
          created_at?: string | null
          cupom_id?: string | null
          id?: string
          mp_payment_id?: string | null
          origem?: string
          produto_id: string
          raw_payload?: Json | null
          status?: string
          syncpay_transaction_id?: string | null
          updated_at?: string | null
          valor_bruto: number
          valor_liquido?: number | null
        }
        Update: {
          acesso_liberado?: boolean
          acesso_liberado_em?: string | null
          bump_incluido?: boolean
          comissao_afiliado?: number | null
          comissao_afiliado_paga?: boolean | null
          comissao_afiliado_paga_em?: string | null
          comissao_idm?: number | null
          comprador_email?: string | null
          comprador_nome?: string | null
          comprador_whatsapp?: string | null
          created_at?: string | null
          cupom_id?: string | null
          id?: string
          mp_payment_id?: string | null
          origem?: string
          produto_id?: string
          raw_payload?: Json | null
          status?: string
          syncpay_transaction_id?: string | null
          updated_at?: string | null
          valor_bruto?: number
          valor_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_vendas_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "parceiros_cupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_vendas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_vendas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros_video_metricas: {
        Row: {
          created_at: string | null
          data_post: string
          id: string
          parceiro_id: string
          plataforma: string
          produto_id: string | null
          url: string | null
          views: number | null
        }
        Insert: {
          created_at?: string | null
          data_post?: string
          id?: string
          parceiro_id: string
          plataforma: string
          produto_id?: string | null
          url?: string | null
          views?: number | null
        }
        Update: {
          created_at?: string | null
          data_post?: string
          id?: string
          parceiro_id?: string
          plataforma?: string
          produto_id?: string | null
          url?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_video_metricas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_video_metricas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_video_metricas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "parceiros_produtos_checkout"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_rates: {
        Row: {
          ativo: boolean
          created_at: string
          faixa_max: number
          faixa_min: number
          fixo_por_transacao: number
          forma_pagamento: string
          gateway: string
          id: string
          observacao: string | null
          percentual: number
          produto_slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          faixa_max?: number
          faixa_min?: number
          fixo_por_transacao?: number
          forma_pagamento: string
          gateway?: string
          id?: string
          observacao?: string | null
          percentual?: number
          produto_slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          faixa_max?: number
          faixa_min?: number
          fixo_por_transacao?: number
          forma_pagamento?: string
          gateway?: string
          id?: string
          observacao?: string | null
          percentual?: number
          produto_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_rates_produto_slug_fkey"
            columns: ["produto_slug"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["slug"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar: string | null
          cargo: string | null
          cor: string
          created_at: string
          email: string
          id: string
          nome: string
          role: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar?: string | null
          cargo?: string | null
          cor?: string
          created_at?: string
          email: string
          id: string
          nome: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar?: string | null
          cargo?: string | null
          cor?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quick_sends: {
        Row: {
          error_message: string | null
          id: string
          message_text: string
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["funnel_recipient_type"]
          sent_at: string
          status: Database["public"]["Enums"]["quick_send_status"]
        }
        Insert: {
          error_message?: string | null
          id?: string
          message_text: string
          recipient_id: string
          recipient_type: Database["public"]["Enums"]["funnel_recipient_type"]
          sent_at?: string
          status?: Database["public"]["Enums"]["quick_send_status"]
        }
        Update: {
          error_message?: string | null
          id?: string
          message_text?: string
          recipient_id?: string
          recipient_type?: Database["public"]["Enums"]["funnel_recipient_type"]
          sent_at?: string
          status?: Database["public"]["Enums"]["quick_send_status"]
        }
        Relationships: []
      }
      responsaveis: {
        Row: {
          ativo: boolean
          created_at: string | null
          email: string | null
          id: string
          nome: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          user_id?: string | null
        }
        Relationships: []
      }
      seu_numerologo_config: {
        Row: {
          created_at: string
          id: string
          mensagem_compra_template: string
          mensagem_envio_mapa: string
          mensagem_pix_template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem_compra_template?: string
          mensagem_envio_mapa?: string
          mensagem_pix_template?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mensagem_compra_template?: string
          mensagem_envio_mapa?: string
          mensagem_pix_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      seu_numerologo_leads: {
        Row: {
          alma: number | null
          ano_pessoal: number | null
          calculou_at: string | null
          comprou_at: string | null
          created_at: string | null
          data_nascimento: string
          destino: number | null
          email: string
          expressao: number | null
          fbc: string | null
          fbp: string | null
          id: string
          imagem: number | null
          language: string
          link_mapa: string | null
          mapa_enviado: boolean | null
          nome: string
          pago_at: string | null
          pdf_path: string | null
          produto: string
          psiquico: number | null
          referrer: string | null
          status: string
          talento: number | null
          utm_campaign: string | null
          utm_content: string | null
          utm_landing_page: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp: string | null
        }
        Insert: {
          alma?: number | null
          ano_pessoal?: number | null
          calculou_at?: string | null
          comprou_at?: string | null
          created_at?: string | null
          data_nascimento: string
          destino?: number | null
          email: string
          expressao?: number | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          imagem?: number | null
          language?: string
          link_mapa?: string | null
          mapa_enviado?: boolean | null
          nome: string
          pago_at?: string | null
          pdf_path?: string | null
          produto?: string
          psiquico?: number | null
          referrer?: string | null
          status?: string
          talento?: number | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_landing_page?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Update: {
          alma?: number | null
          ano_pessoal?: number | null
          calculou_at?: string | null
          comprou_at?: string | null
          created_at?: string | null
          data_nascimento?: string
          destino?: number | null
          email?: string
          expressao?: number | null
          fbc?: string | null
          fbp?: string | null
          id?: string
          imagem?: number | null
          language?: string
          link_mapa?: string | null
          mapa_enviado?: boolean | null
          nome?: string
          pago_at?: string | null
          pdf_path?: string | null
          produto?: string
          psiquico?: number | null
          referrer?: string | null
          status?: string
          talento?: number | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_landing_page?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_33: {
        Row: {
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: number
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: number
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_36: {
        Row: {
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_37: {
        Row: {
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_38: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_39: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_40: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_41: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_42: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_43: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_44: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_45: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_46: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      sheet_leads_47: {
        Row: {
          Cidade: string | null
          CRM: string | null
          Data: string | null
          Disparo: string | null
          "E-mail": string | null
          Enviado: string | null
          "Follow Up 01": string | null
          "Follow Up 02": string | null
          "Follow Up 03": string | null
          "Grupo de Oferta": string | null
          "No Grupo?": string | null
          Nome: string | null
          row_id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          Whatsapp: string | null
        }
        Insert: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Update: {
          Cidade?: string | null
          CRM?: string | null
          Data?: string | null
          Disparo?: string | null
          "E-mail"?: string | null
          Enviado?: string | null
          "Follow Up 01"?: string | null
          "Follow Up 02"?: string | null
          "Follow Up 03"?: string | null
          "Grupo de Oferta"?: string | null
          "No Grupo?"?: string | null
          Nome?: string | null
          row_id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          Whatsapp?: string | null
        }
        Relationships: []
      }
      subtarefas: {
        Row: {
          concluida: boolean | null
          created_at: string | null
          id: string
          tarefa_id: string | null
          titulo: string
        }
        Insert: {
          concluida?: boolean | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
          titulo: string
        }
        Update: {
          concluida?: boolean | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtarefas_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sv_campanhas: {
        Row: {
          created_at: string
          delay_fu1_dias: number
          delay_fu2_dias: number
          delay_fu3_dias: number
          delay_max_s: number
          delay_min_s: number
          descricao: string | null
          evolution_id: string | null
          id: string
          nome: string
          safe_hour_end: number
          safe_hour_start: number
          status: string
          template_fu1: string
          template_fu2: string
          template_fu3: string
          template_msg1: string
        }
        Insert: {
          created_at?: string
          delay_fu1_dias?: number
          delay_fu2_dias?: number
          delay_fu3_dias?: number
          delay_max_s?: number
          delay_min_s?: number
          descricao?: string | null
          evolution_id?: string | null
          id?: string
          nome: string
          safe_hour_end?: number
          safe_hour_start?: number
          status?: string
          template_fu1?: string
          template_fu2?: string
          template_fu3?: string
          template_msg1?: string
        }
        Update: {
          created_at?: string
          delay_fu1_dias?: number
          delay_fu2_dias?: number
          delay_fu3_dias?: number
          delay_max_s?: number
          delay_min_s?: number
          descricao?: string | null
          evolution_id?: string | null
          id?: string
          nome?: string
          safe_hour_end?: number
          safe_hour_start?: number
          status?: string
          template_fu1?: string
          template_fu2?: string
          template_fu3?: string
          template_msg1?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_campanhas_evolution_id_fkey"
            columns: ["evolution_id"]
            isOneToOne: false
            referencedRelation: "sv_evolution_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_evolution_configs: {
        Row: {
          api_key: string
          api_url: string
          ativo: boolean
          created_at: string
          id: string
          instance_name: string
          prioridade: number
        }
        Insert: {
          api_key: string
          api_url: string
          ativo?: boolean
          created_at?: string
          id?: string
          instance_name: string
          prioridade?: number
        }
        Update: {
          api_key?: string
          api_url?: string
          ativo?: boolean
          created_at?: string
          id?: string
          instance_name?: string
          prioridade?: number
        }
        Relationships: []
      }
      sv_lead_mensagens: {
        Row: {
          campanha_id: string
          created_at: string
          enviado_em: string | null
          error_msg: string | null
          id: string
          lead_id: string
          numero_msg: number
          proximo_envio: string | null
          status: string
        }
        Insert: {
          campanha_id: string
          created_at?: string
          enviado_em?: string | null
          error_msg?: string | null
          id?: string
          lead_id: string
          numero_msg: number
          proximo_envio?: string | null
          status?: string
        }
        Update: {
          campanha_id?: string
          created_at?: string
          enviado_em?: string | null
          error_msg?: string | null
          id?: string
          lead_id?: string
          numero_msg?: number
          proximo_envio?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_lead_mensagens_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "sv_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sv_lead_mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sv_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_leads: {
        Row: {
          anotacoes: string | null
          campanha_id: string | null
          contexto: Json
          created_at: string
          empresa: string
          id: string
          nicho: string
          oferta_recomendada: string | null
          prioridade: string | null
          score: number
          sem_resposta_wpp: boolean
          site_url: string
          status_kanban: string
          status_whatsapp: string
          telefone: string
          tipo: string
        }
        Insert: {
          anotacoes?: string | null
          campanha_id?: string | null
          contexto?: Json
          created_at?: string
          empresa: string
          id?: string
          nicho?: string
          oferta_recomendada?: string | null
          prioridade?: string | null
          score?: number
          sem_resposta_wpp?: boolean
          site_url?: string
          status_kanban?: string
          status_whatsapp?: string
          telefone?: string
          tipo?: string
        }
        Update: {
          anotacoes?: string | null
          campanha_id?: string | null
          contexto?: Json
          created_at?: string
          empresa?: string
          id?: string
          nicho?: string
          oferta_recomendada?: string | null
          prioridade?: string | null
          score?: number
          sem_resposta_wpp?: boolean
          site_url?: string
          status_kanban?: string
          status_whatsapp?: string
          telefone?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sv_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "sv_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      sv_reunioes: {
        Row: {
          criado_em: string
          data: string
          empresa: string | null
          horario: string
          id: string
          link: string | null
          notas: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          criado_em?: string
          data: string
          empresa?: string | null
          horario: string
          id?: string
          link?: string | null
          notas?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          criado_em?: string
          data?: string
          empresa?: string | null
          horario?: string
          id?: string
          link?: string | null
          notas?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      sv_scripts: {
        Row: {
          criado_em: string
          id: string
          nicho: string
          nome: string
          template: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nicho: string
          nome: string
          template: string
        }
        Update: {
          criado_em?: string
          id?: string
          nicho?: string
          nome?: string
          template?: string
        }
        Relationships: []
      }
      sv_tarefas: {
        Row: {
          criado_em: string
          feita: boolean
          feita_em: string | null
          id: string
          texto: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          feita?: boolean
          feita_em?: string | null
          id?: string
          texto: string
          tipo: string
        }
        Update: {
          criado_em?: string
          feita?: boolean
          feita_em?: string | null
          id?: string
          texto?: string
          tipo?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          categoria: string | null
          created_at: string | null
          created_by: string | null
          criado_por_id: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          pagina: string | null
          prazo: string | null
          prioridade: string | null
          responsaveis: string[] | null
          responsavel_id: string | null
          status: string | null
          tags: string[] | null
          tipo: string | null
          titulo: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string | null
          created_by?: string | null
          criado_por_id?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          pagina?: string | null
          prazo?: string | null
          prioridade?: string | null
          responsaveis?: string[] | null
          responsavel_id?: string | null
          status?: string | null
          tags?: string[] | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          created_by?: string | null
          criado_por_id?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          pagina?: string | null
          prazo?: string | null
          prioridade?: string | null
          responsaveis?: string[] | null
          responsavel_id?: string | null
          status?: string | null
          tags?: string[] | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      tarefas_checklists: {
        Row: {
          concluido: boolean | null
          created_at: string | null
          id: string
          ordem: number | null
          tarefa_id: string | null
          texto: string
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string | null
          id?: string
          ordem?: number | null
          tarefa_id?: string | null
          texto: string
        }
        Update: {
          concluido?: boolean | null
          created_at?: string | null
          id?: string
          ordem?: number | null
          tarefa_id?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_checklists_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas_comentarios: {
        Row: {
          autor_id: string | null
          created_at: string | null
          id: string
          tarefa_id: string | null
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_comentarios_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas_etapas: {
        Row: {
          created_at: string | null
          desbloqueada: boolean | null
          descricao: string | null
          id: string
          ordem: number
          prazo: string | null
          responsavel: string | null
          status: string | null
          tarefa_id: string | null
          titulo: string
        }
        Insert: {
          created_at?: string | null
          desbloqueada?: boolean | null
          descricao?: string | null
          id?: string
          ordem: number
          prazo?: string | null
          responsavel?: string | null
          status?: string | null
          tarefa_id?: string | null
          titulo: string
        }
        Update: {
          created_at?: string | null
          desbloqueada?: boolean | null
          descricao?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          responsavel?: string | null
          status?: string | null
          tarefa_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_etapas_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      turma_disparo_config: {
        Row: {
          created_at: string
          delay_max_s: number
          delay_min_s: number
          id: string
          instance_name: string | null
          link_aula_1: string
          link_aula_2: string
          link_aula_3: string
          link_grupo: string
          template: string
          turma_id: string
          typing_delay_s: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_max_s?: number
          delay_min_s?: number
          id?: string
          instance_name?: string | null
          link_aula_1?: string
          link_aula_2?: string
          link_aula_3?: string
          link_grupo?: string
          template?: string
          turma_id: string
          typing_delay_s?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_max_s?: number
          delay_min_s?: number
          id?: string
          instance_name?: string | null
          link_aula_1?: string
          link_aula_2?: string
          link_aula_3?: string
          link_grupo?: string
          template?: string
          turma_id?: string
          typing_delay_s?: number
          updated_at?: string
        }
        Relationships: []
      }
      turma_responsaveis: {
        Row: {
          created_at: string | null
          id: string
          nome_ref: string | null
          percentual: number
          turma_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome_ref?: string | null
          percentual?: number
          turma_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome_ref?: string | null
          percentual?: number
          turma_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turma_responsaveis_responsavel_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_responsaveis_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "turma_responsaveis_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turma_responsaveis_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          dia_vencimento: number | null
          id: string
          nome: string
          produto: string | null
          responsavel_id: string | null
          tipo: string
          total_mensalidades: number | null
          vagas: number | null
          valor_mensalidade: number | null
        }
        Insert: {
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          nome: string
          produto?: string | null
          responsavel_id?: string | null
          tipo: string
          total_mensalidades?: number | null
          vagas?: number | null
          valor_mensalidade?: number | null
        }
        Update: {
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          nome?: string
          produto?: string | null
          responsavel_id?: string | null
          tipo?: string
          total_mensalidades?: number | null
          vagas?: number | null
          valor_mensalidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "responsaveis"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_permissions: {
        Row: {
          allowed_financeiro_turma_ids: string[]
          allowed_lancamento_ids: string[]
          can_view_all_financeiro_turmas: boolean
          can_view_all_lancamentos: boolean
          can_view_aula_secreta: boolean
          can_view_balanco: boolean
          can_view_cobranca: boolean
          can_view_dashboard: boolean
          can_view_financeiro: boolean
          can_view_financeiro_cfo: boolean
          can_view_lancamentos: boolean
          can_view_mapa_mental: boolean
          can_view_npa: boolean
          can_view_operacoes: boolean
          can_view_pipeline: boolean
          can_view_rodrygo: boolean
          can_view_settings: boolean
          can_view_team: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_financeiro_turma_ids?: string[]
          allowed_lancamento_ids?: string[]
          can_view_all_financeiro_turmas?: boolean
          can_view_all_lancamentos?: boolean
          can_view_aula_secreta?: boolean
          can_view_balanco?: boolean
          can_view_cobranca?: boolean
          can_view_dashboard?: boolean
          can_view_financeiro?: boolean
          can_view_financeiro_cfo?: boolean
          can_view_lancamentos?: boolean
          can_view_mapa_mental?: boolean
          can_view_npa?: boolean
          can_view_operacoes?: boolean
          can_view_pipeline?: boolean
          can_view_rodrygo?: boolean
          can_view_settings?: boolean
          can_view_team?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_financeiro_turma_ids?: string[]
          allowed_lancamento_ids?: string[]
          can_view_all_financeiro_turmas?: boolean
          can_view_all_lancamentos?: boolean
          can_view_aula_secreta?: boolean
          can_view_balanco?: boolean
          can_view_cobranca?: boolean
          can_view_dashboard?: boolean
          can_view_financeiro?: boolean
          can_view_financeiro_cfo?: boolean
          can_view_lancamentos?: boolean
          can_view_mapa_mental?: boolean
          can_view_npa?: boolean
          can_view_operacoes?: boolean
          can_view_pipeline?: boolean
          can_view_rodrygo?: boolean
          can_view_settings?: boolean
          can_view_team?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_assets: {
        Row: {
          asset_type: string
          block_order: number | null
          created_at: string | null
          id: string
          job_id: string | null
          storage_url: string
        }
        Insert: {
          asset_type: string
          block_order?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          storage_url: string
        }
        Update: {
          asset_type?: string
          block_order?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_assets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_jobs: {
        Row: {
          created_at: string | null
          criado_por: string | null
          error_message: string | null
          final_video_url: string | null
          id: string
          manual_emphasis_points: Json | null
          mode: string
          music_track_url: string | null
          processing_lock_at: string | null
          raw_video_url: string | null
          script_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          error_message?: string | null
          final_video_url?: string | null
          id?: string
          manual_emphasis_points?: Json | null
          mode: string
          music_track_url?: string | null
          processing_lock_at?: string | null
          raw_video_url?: string | null
          script_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          error_message?: string | null
          final_video_url?: string | null
          id?: string
          manual_emphasis_points?: Json | null
          mode?: string
          music_track_url?: string | null
          processing_lock_at?: string | null
          raw_video_url?: string | null
          script_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "video_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_scripts: {
        Row: {
          aprovado: boolean
          blocks: Json
          cliente_id: string | null
          concept_word: string | null
          created_at: string | null
          criado_por: string | null
          full_narration_text: string
          id: string
          tarefa_id: string | null
          title: string
        }
        Insert: {
          aprovado?: boolean
          blocks: Json
          cliente_id?: string | null
          concept_word?: string | null
          created_at?: string | null
          criado_por?: string | null
          full_narration_text: string
          id?: string
          tarefa_id?: string | null
          title: string
        }
        Update: {
          aprovado?: boolean
          blocks?: Json
          cliente_id?: string | null
          concept_word?: string | null
          created_at?: string | null
          criado_por?: string | null
          full_narration_text?: string
          id?: string
          tarefa_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_scripts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "conteudo_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_scripts_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "equipe_11ds_tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          conteudo: string
          created_at: string
          direcao: string
          evolution_instance: string | null
          evolution_message_id: string | null
          id: string
          origem: string
          telefone: string
          tipo: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          direcao: string
          evolution_instance?: string | null
          evolution_message_id?: string | null
          id?: string
          origem: string
          telefone: string
          tipo?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          direcao?: string
          evolution_instance?: string | null
          evolution_message_id?: string | null
          id?: string
          origem?: string
          telefone?: string
          tipo?: string
        }
        Relationships: []
      }
      whatsapp_opt_out: {
        Row: {
          criado_em: string
          gatilho: string | null
          origem: string
          telefone: string
        }
        Insert: {
          criado_em?: string
          gatilho?: string | null
          origem: string
          telefone: string
        }
        Update: {
          criado_em?: string
          gatilho?: string | null
          origem?: string
          telefone?: string
        }
        Relationships: []
      }
    }
    Views: {
      alunos_financeiro: {
        Row: {
          alunos_ativos: number | null
          alunos_inadimplentes: number | null
          ltv_potencial: number | null
          produto: string | null
          receita_mensal_atual: number | null
        }
        Relationships: []
      }
      aquecimento_saude_view: {
        Row: {
          chip_id: string | null
          classificacao: string | null
          consecutive_errors: number | null
          data_inicio: string | null
          desconexoes_7d: number | null
          dia_aquecimento: number | null
          estado_atual: string | null
          evolution_config_id: string | null
          instance_name: string | null
          numero_whatsapp: string | null
          status: string | null
          taxa_entrega: number | null
          taxa_leitura: number | null
          total_entregues: number | null
          total_enviados: number | null
          total_falhas: number | null
          total_lidos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_chips_evolution_config_id_fkey"
            columns: ["evolution_config_id"]
            isOneToOne: true
            referencedRelation: "evolution_config"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_metricas: {
        Row: {
          leads_direto: number | null
          leads_em_risco: number | null
          leads_lancamento: number | null
          leads_npa: number | null
          receita_potencial_funil: number | null
          valor_em_risco: number | null
        }
        Relationships: []
      }
      financeiro_resumo: {
        Row: {
          alunos_ativos: number | null
          alunos_cancelados: number | null
          alunos_concluidos: number | null
          alunos_inadimplentes: number | null
          data_fim: string | null
          data_inicio: string | null
          dia_vencimento: number | null
          previsao_mes_atual: number | null
          produto: string | null
          receita_mes_atual: number | null
          total_alunos: number | null
          total_atrasado: number | null
          total_em_aberto: number | null
          total_mensalidades: number | null
          total_recebido: number | null
          turma_id: string | null
          turma_nome: string | null
          valor_mensalidade: number | null
        }
        Relationships: []
      }
      lancamento_kanban: {
        Row: {
          coluna_nome: string | null
          coluna_ordem: number | null
          created_at: string | null
          crm: boolean | null
          data_entrada: string | null
          disparo: boolean | null
          email: string | null
          enviado: boolean | null
          erro: string | null
          fase: string | null
          follow_up_01: boolean | null
          follow_up_02: boolean | null
          follow_up_03: boolean | null
          grupo_oferta: boolean | null
          id: string | null
          lancamento_ativo: boolean | null
          lancamento_id: string | null
          lancamento_nome: string | null
          lancamento_status: string | null
          matriculado: boolean | null
          no_grupo: boolean | null
          nome: string | null
          observacoes: string | null
          responsavel_id: string | null
          sheets_row_index: number | null
          ultima_atividade: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_leads_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_unificados: {
        Row: {
          bv_enviado: boolean | null
          cidade: string | null
          criado_em: string | null
          ddd: number | null
          email: string | null
          estado: string | null
          fase: string | null
          nome: string | null
          origem: string | null
          origem_id: string | null
          origem_tabela: string | null
          produto: string | null
          telefone: string | null
          temperatura: string | null
        }
        Relationships: []
      }
      npa_kanban: {
        Row: {
          evento_nome: string | null
          evento_status: string | null
          fase: string | null
          npa_evento_id: string | null
          receita_ingressos: number | null
          receita_matriculas: number | null
          total: number | null
        }
        Relationships: []
      }
      parceiros_produtos_checkout: {
        Row: {
          bump_ativo: boolean | null
          bump_descricao: string | null
          bump_nome: string | null
          bump_preco: number | null
          descricao: string | null
          id: string | null
          mp_public_key: string | null
          nome: string | null
          parceiro_id: string | null
          preco: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_produtos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pipeline_contratos: {
        Row: {
          autentique_documento_id: string | null
          autentique_link_assinatura: string | null
          contrato_assinado: boolean | null
          contrato_assinado_em: string | null
          contrato_enviado: boolean | null
          contrato_enviado_em: string | null
          cpf: string | null
          created_at: string | null
          dia_vencimento: number | null
          dia_vencimento_contrato: string | null
          email: string | null
          etapa_contrato: string | null
          forma_pagamento: string | null
          forms_respondido: boolean | null
          forms_respondido_em: string | null
          id: string | null
          nome: string | null
          origem_lead: string | null
          produto: string | null
          status: string | null
          turma_id: string | null
          updated_at: string | null
          valor_mensalidade: number | null
          whatsapp: string | null
        }
        Insert: {
          autentique_documento_id?: string | null
          autentique_link_assinatura?: string | null
          contrato_assinado?: boolean | null
          contrato_assinado_em?: string | null
          contrato_enviado?: boolean | null
          contrato_enviado_em?: string | null
          cpf?: string | null
          created_at?: string | null
          dia_vencimento?: number | null
          dia_vencimento_contrato?: string | null
          email?: string | null
          etapa_contrato?: never
          forma_pagamento?: string | null
          forms_respondido?: boolean | null
          forms_respondido_em?: string | null
          id?: string | null
          nome?: string | null
          origem_lead?: string | null
          produto?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor_mensalidade?: number | null
          whatsapp?: string | null
        }
        Update: {
          autentique_documento_id?: string | null
          autentique_link_assinatura?: string | null
          contrato_assinado?: boolean | null
          contrato_assinado_em?: string | null
          contrato_enviado?: boolean | null
          contrato_enviado_em?: string | null
          cpf?: string | null
          created_at?: string | null
          dia_vencimento?: number | null
          dia_vencimento_contrato?: string | null
          email?: string | null
          etapa_contrato?: never
          forma_pagamento?: string | null
          forms_respondido?: boolean | null
          forms_respondido_em?: string | null
          id?: string | null
          nome?: string | null
          origem_lead?: string | null
          produto?: string | null
          status?: string | null
          turma_id?: string | null
          updated_at?: string | null
          valor_mensalidade?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_alunos_financeiro: {
        Row: {
          contrato_assinado: boolean | null
          contrato_enviado: boolean | null
          data_inicio: string | null
          data_matricula: string | null
          dias_em_atraso: number | null
          forma_pagamento: string | null
          id: string | null
          mensalidades_pagas: number | null
          nome: string | null
          parcelas_atrasadas: number | null
          parcelas_pagas: number | null
          parcelas_pendentes: number | null
          produto: string | null
          proxima_vencimento: string | null
          status: string | null
          total_em_aberto: number | null
          total_em_atraso: number | null
          total_mensalidades: number | null
          total_recebido: number | null
          turma_id: string | null
          turma_nome: string | null
          valor_efetivo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cfo_turmas: {
        Row: {
          alunos_ativos: number | null
          alunos_cancelados: number | null
          alunos_concluidos: number | null
          dia_vencimento: number | null
          id: string | null
          mrr_efetivo: number | null
          mrr_real: number | null
          nome: string | null
          parcelas_pagas_media: number | null
          produto: string | null
          ticket_medio: number | null
          total_mensalidades: number | null
          valor_padrao: number | null
        }
        Relationships: []
      }
      vw_receita_por_fonte: {
        Row: {
          aluno_id: string | null
          aluno_nome: string | null
          canal_cobranca: string | null
          conferido_em: string | null
          conferido_por: string | null
          data_pagamento: string | null
          forma_pagamento: string | null
          id: string | null
          mes_referencia: string | null
          numero_parcela: number | null
          produto: string | null
          produto_label: string | null
          status: string | null
          taxa_valor: number | null
          turma_id: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "alunos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "vw_alunos_financeiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "financeiro_resumo"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_cfo_turmas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      atualizar_fase_npa_lead: {
        Args: { p_lead_id: string; p_nova_fase: string }
        Returns: undefined
      }
      get_alunos_para_cobranca: {
        Args: { p_data?: string }
        Returns: {
          aluno_id: string
          aluno_nome: string
          cobranca_ia_ativa: boolean
          data_prevista_pagamento: string
          data_vencimento: string
          dias_offset: number
          link_pagamento: string
          pagamento_id: string
          pagamento_status: string
          parcela: number
          telefone: string
          valor: number
        }[]
      }
      get_equipe_11ds_composite_config: {
        Args: never
        Returns: {
          secret: string
          url: string
        }[]
      }
      get_equipe_11ds_cron_secret: { Args: never; Returns: string }
      get_equipe_11ds_elevenlabs_key: {
        Args: never
        Returns: {
          api_key: string
        }[]
      }
      get_equipe_11ds_github_config: {
        Args: never
        Returns: {
          repo: string
          token: string
        }[]
      }
      get_idm_reels_worker_config: {
        Args: never
        Returns: {
          secret: string
          url: string
        }[]
      }
      get_pexels_api_key: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      marcar_pagamentos_atrasados: { Args: never; Returns: undefined }
      notificar: {
        Args: {
          p_descricao?: string
          p_link?: string
          p_tipo: string
          p_titulo: string
          p_user_id: string
        }
        Returns: string
      }
      notificar_admins: {
        Args: {
          p_descricao?: string
          p_link?: string
          p_tipo: string
          p_titulo: string
        }
        Returns: string[]
      }
      sincronizar_inadimplencia: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "parceiro"
      funnel_message_status: "draft" | "scheduled" | "sent" | "error"
      funnel_recipient_type: "group" | "number"
      quick_send_status: "sent" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor", "parceiro"],
      funnel_message_status: ["draft", "scheduled", "sent", "error"],
      funnel_recipient_type: ["group", "number"],
      quick_send_status: ["sent", "error"],
    },
  },
} as const
