-- Follow-up de "lead quente": aluno que se cadastrou (formulario publico ou manual)
-- mas cuja 1a parcela ainda nao foi paga (nem esta isento) -- ainda nao e uma
-- matricula de verdade, mas vale a pena o time comercial lembrar de retomar
-- contato. Mesmo padrao do cobranca_contatado_em ja usado em pagamentos.
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS lead_quente_contatado_em TIMESTAMPTZ;
