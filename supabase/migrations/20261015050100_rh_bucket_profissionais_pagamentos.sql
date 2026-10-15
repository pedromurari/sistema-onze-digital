-- Bucket privado para comprovantes/notas fiscais de pagamento a profissionais.
-- Privado porque tem dado financeiro de terceiro (nome, valor, CNPJ na nota).
insert into storage.buckets (id, name, public)
values ('profissionais-pagamentos', 'profissionais-pagamentos', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload profissionais-pagamentos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profissionais-pagamentos');

create policy "Authenticated users can view profissionais-pagamentos"
  on storage.objects for select to authenticated
  using (bucket_id = 'profissionais-pagamentos');

create policy "Authenticated users can update profissionais-pagamentos"
  on storage.objects for update to authenticated
  using (bucket_id = 'profissionais-pagamentos')
  with check (bucket_id = 'profissionais-pagamentos');

create policy "Authenticated users can delete profissionais-pagamentos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profissionais-pagamentos');
