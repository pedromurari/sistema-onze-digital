-- Parceira ja podia so visualizar as proprias entregas (SELECT). Agora tambem
-- pode criar novas atividades e mudar o status (mover no Kanban) das suas.

CREATE POLICY "Parceira can insert own entregas" ON parceiros_entregas
  FOR INSERT TO authenticated
  WITH CHECK (parceiro_id IN (SELECT id FROM parceiros WHERE user_id = auth.uid()));

CREATE POLICY "Parceira can update own entregas" ON parceiros_entregas
  FOR UPDATE TO authenticated
  USING (parceiro_id IN (SELECT id FROM parceiros WHERE user_id = auth.uid()))
  WITH CHECK (parceiro_id IN (SELECT id FROM parceiros WHERE user_id = auth.uid()));
