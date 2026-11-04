param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$rodrygoId = 'cac2f265-196c-4a40-98e4-55d661ddd648'
$campaigns = @(
  @{ Base = '01'; Slug = 'escuta-psicanalitica'; Name = 'A escuta que vai além do conselho'; Date = '2026-10-27' },
  @{ Base = '02'; Slug = 'padroes-emocionais'; Name = 'Por que repetimos padrões?'; Date = '2026-10-28' },
  @{ Base = '03'; Slug = 'formacao-psicanalise'; Name = 'O caminho de formação em psicanálise'; Date = '2026-10-29' }
)

function SqlText([string]$value) {
  return "'" + $value.Replace("'", "''") + "'"
}

function SqlBody([string]$value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
  $encoded = [Convert]::ToBase64String($bytes)
  return "convert_from(decode('$encoded','base64'),'UTF8')"
}

function Run-Sql([string]$sql, [string]$label) {
  if (-not $Apply) {
    Write-Output "DRY-RUN: $label ($($sql.Length) caracteres de SQL)"
    return
  }
  $result = & supabase db query --linked $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha em $label`: $result" }
  Write-Output "OK: $label"
}

$chatValues = New-Object System.Collections.Generic.List[string]
foreach ($campaign in $campaigns) {
  $base = $campaign.Base
  $name = $campaign.Name
  $slug = $campaign.Slug
  $date = $campaign.Date
  $mainPath = Join-Path $repo "docs/campanhas/WEBINARIO-$base-$(if ($base -eq '01') { 'ESCUTA' } elseif ($base -eq '02') { 'PADROES' } else { 'FORMACAO' }).md"
  $productionPath = $mainPath.Replace('.md', '').Replace('-ESCUTA', '-PRODUCAO').Replace('-PADROES', '-PRODUCAO').Replace('-FORMACAO', '-PRODUCAO') + '.md'
  $main = Get-Content -LiteralPath $mainPath -Raw -Encoding UTF8
  $production = Get-Content -LiteralPath $productionPath -Raw -Encoding UTF8
  if ($main.Length -lt 3000 -or $production.Length -lt 3000) { throw "Roteiro incompleto em $base" }

  $mainTitle = "[Webinário] Rodrygo gravar — $name"
  $notes = "Coapresentadora proposta: Jocimara Anjos. Aprovar falas e participação com ela antes da gravação. Roteiro integral no campo Roteiro completo. Prazo sugerido de gravação, não data de publicação."
  $mainSql = "update public.conteudo_calendario set texto_peca=$(SqlBody $main), observacoes=$(SqlText $notes), responsavel='$rodrygoId' where gerado_por='codex_webinario' and titulo=$(SqlText $mainTitle) and texto_peca is null;"
  Run-Sql $mainSql "roteiro aula $slug"

  foreach ($kind in @('Captura', 'Anuncio')) {
    $title = if ($kind -eq 'Captura') { "[Webinário] Vídeo de captura — $name" } else { "[Webinário] Anúncio em vídeo — $name" }
    $platform = if ($kind -eq 'Captura') { 'youtube' } else { 'instagram' }
    $format = if ($kind -eq 'Captura') { 'video' } else { 'reels' }
    $notesForCard = "Rodrygo grava com Jocimara Anjos. Texto integral, AIDA, direção, CTA e chat no campo Roteiro completo. Prazo sugerido de gravação; não programar publicação antes da aula real. Campanha: $slug."
    $caption = if ($kind -eq 'Captura') { "Vídeo curto da página de captura do tema $name. Gravar antes de inserir a URL no CRM." } else { "Criativo vertical do tema $name. Revisar políticas da plataforma e só anunciar após a aula estar pronta." }
    $sql = "insert into public.conteudo_calendario (titulo,plataforma,formato,status,data_publicacao,legenda,observacoes,texto_peca,gerado_por,tipo_conteudo,produto_slug,responsavel) select $(SqlText $title),$(SqlText $platform),$(SqlText $format),'roteiro',date '$date',$(SqlText $caption),$(SqlText $notesForCard),$(SqlBody $production),'codex_webinario','ambos',(select slug from public.produtos where id='5b249002-ce8c-4836-8d4d-6f6f3b2d376c'),'$rodrygoId' where not exists (select 1 from public.conteudo_calendario where gerado_por='codex_webinario' and titulo=$(SqlText $title));"
    Run-Sql $sql "card $kind $slug"
  }

  foreach ($line in ($production -split "`r?`n")) {
    if ($line -match '^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|') {
      $second = [int]$Matches[1]
      $message = $Matches[2].Trim()
      $chatValues.Add("($(SqlText $slug),$second,$(SqlText $message))")
    }
  }
}

if ($chatValues.Count -ne 24) { throw "Esperadas 24 perguntas-guia; encontradas $($chatValues.Count)." }
$values = $chatValues -join ','
$chatSql = "insert into public.webinario_mensagens_chat (webinario_id,segundo,autor_nome,texto) select w.id,v.segundo,'Equipe IDM',v.texto from (values $values) as v(slug,segundo,texto) join public.webinarios w on w.slug=v.slug where not exists (select 1 from public.webinario_mensagens_chat m where m.webinario_id=w.id and m.segundo=v.segundo and m.autor_nome='Equipe IDM');"
Run-Sql $chatSql '24 perguntas-guia identificadas como conteúdo preparado'
