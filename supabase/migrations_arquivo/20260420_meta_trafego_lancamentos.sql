alter table lancamentos
  add column if not exists meta_campaign_id text,
  add column if not exists meta_ad_account_id text,
  add column if not exists meta_access_token text;
