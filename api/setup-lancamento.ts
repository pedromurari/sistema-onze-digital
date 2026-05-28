import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN!;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'pedromurari';

const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://usqiyekfmwwnvkmkdlej.supabase.co';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const CRM_SUPABASE_SERVICE_KEY = process.env.CRM_SUPABASE_SERVICE_KEY!;

const MESES_PT = [
  'JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
  'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO',
];

interface SetupPayload {
  lancamentoId: string;
  turmaNumero: number;
  nome: string;
  datas: { aula1: string; aula2: string; aula3: string; horario: string };
  gasUrl: string;
  whatsappLink: string;
  repoCaptura: string;
  repoObrigado: string;
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${JSON.stringify(json)}`);
  return json;
}

async function findLatestRepo(prefix: string): Promise<{ name: string; num: number }> {
  let page = 1;
  let all: any[] = [];
  while (true) {
    const batch = await gh(`/users/${GITHUB_OWNER}/repos?type=all&per_page=100&page=${page}`);
    if (!batch?.length) break;
    all = all.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  const matches = all
    .filter((r: any) => new RegExp(`^${prefix}-\\d+$`).test(r.name))
    .map((r: any) => ({ name: r.name as string, num: parseInt(r.name.split('-').pop()!) }))
    .sort((a, b) => b.num - a.num);
  if (!matches.length) throw new Error(`Nenhum repo ${prefix}-* encontrado em ${GITHUB_OWNER}`);
  return matches[0];
}

async function markAsTemplate(repo: string) {
  await gh(`/repos/${GITHUB_OWNER}/${repo}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_template: true }),
  });
}

async function createFromTemplate(templateRepo: string, newName: string, description: string) {
  await gh(`/repos/${GITHUB_OWNER}/${templateRepo}/generate`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github.baptiste-preview+json' } as any,
    body: JSON.stringify({
      owner: GITHUB_OWNER,
      name: newName,
      description,
      private: false,
      include_all_branches: false,
    }),
  });
  // aguarda o repo ser gerado (pode demorar alguns segundos)
  for (let i = 0; i < 12; i++) {
    await sleep(3000);
    try {
      await gh(`/repos/${GITHUB_OWNER}/${newName}`);
      return;
    } catch { /* ainda não existe */ }
  }
  throw new Error(`Repo ${newName} não ficou disponível após 36s`);
}

async function getFileContent(repo: string, path: string): Promise<{ content: string; sha: string }> {
  const info = await gh(`/repos/${GITHUB_OWNER}/${repo}/contents/${encodeURIComponent(path)}`);
  const content = Buffer.from(info.content, 'base64').toString('utf-8');
  return { content, sha: info.sha };
}

async function putFile(repo: string, path: string, content: string, sha: string, message: string) {
  await gh(`/repos/${GITHUB_OWNER}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
    }),
  });
}

// ── Vercel helpers ────────────────────────────────────────────────────────────

function vercelUrl(path: string) {
  const qs = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';
  return `https://api.vercel.com${path}${qs}`;
}

async function vcl(path: string, init: RequestInit = {}) {
  const res = await fetch(vercelUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`Vercel ${res.status} ${path}: ${JSON.stringify(json)}`);
  return json;
}

async function createVercelProject(name: string, githubRepo: string) {
  const data = await vcl('/v9/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      framework: 'vite',
      gitRepository: { type: 'github', repo: `${GITHUB_OWNER}/${githubRepo}` },
    }),
  });
  return data as { id: string; name: string };
}

async function setVercelEnvVars(projectId: string, vars: Record<string, string>) {
  const envs = Object.entries(vars).map(([key, value]) => ({
    key,
    value,
    type: 'plain',
    target: ['production', 'preview', 'development'],
  }));
  await vcl(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    body: JSON.stringify(envs),
  });
}

async function addVercelDomain(projectId: string, domain: string) {
  await vcl(`/v9/projects/${projectId}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDatasText(aula1: string, aula2: string, aula3: string): string {
  const d1 = new Date(aula1 + 'T12:00:00Z');
  const d2 = new Date(aula2 + 'T12:00:00Z');
  const d3 = new Date(aula3 + 'T12:00:00Z');
  const mes = MESES_PT[d1.getUTCMonth()];
  const dd = (d: Date) => String(d.getUTCDate()).padStart(2, '0');
  return `DIAS ${dd(d1)}, ${dd(d2)} E ${dd(d3)} DE ${mes}`;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Captura page update ───────────────────────────────────────────────────────

async function updateCapturaPage(
  newRepo: string,
  baseNum: number,
  num: number,
  payload: SetupPayload,
) {
  const datasText = formatDatasText(payload.datas.aula1, payload.datas.aula2, payload.datas.aula3);
  const msg = `feat: setup turma #${num}`;

  const heroPath = 'src/components/HeroSection.tsx';
  const { content: heroRaw, sha: heroSha } = await getFileContent(newRepo, heroPath);

  // Substituições numeradas (ordem importa: base antes de partial)
  let hero = heroRaw
    // número da turma
    .replace(new RegExp(`TURMA #${baseNum}`, 'gi'), `TURMA #${num}`)
    // tabela supabase
    .replace(new RegExp(`sheet_leads_${baseNum}`, 'g'), `sheet_leads_${num}`)
    // URL obrigado
    .replace(new RegExp(`obrigado${baseNum}\\.institutodespertamente\\.site`, 'g'),
      `obrigado${num}.institutodespertamente.site`)
    // URL obrigado com hífen (caso exista)
    .replace(new RegExp(`obrigado-${baseNum}\\.institutodespertamente\\.site`, 'g'),
      `obrigado${num}.institutodespertamente.site`)
    // datas (padrão "DIAS DD, DD E DD DE MES")
    .replace(/DIAS \d{2}, \d{2} E \d{2} DE [A-ZÇÃÕ]+/g, datasText)
    // GAS URL
    .replace(/https:\/\/script\.google\.com\/macros\/s\/[^"'\s]+/g, payload.gasUrl);

  await putFile(newRepo, heroPath, hero, heroSha, msg);

  // api/meta-event.ts – atualiza o domínio de origem
  try {
    const { content: metaRaw, sha: metaSha } = await getFileContent(newRepo, 'api/meta-event.ts');
    const meta = metaRaw.replace(
      new RegExp(`gratuito-${baseNum}\\.institutodespertamente\\.site`, 'g'),
      `gratuito-${num}.institutodespertamente.site`,
    );
    await putFile(newRepo, 'api/meta-event.ts', meta, metaSha, msg);
  } catch {
    /* arquivo pode não existir na base */
  }
}

// ── Obrigado page update ──────────────────────────────────────────────────────

async function updateObrigadoPage(
  newRepo: string,
  baseNum: number,
  num: number,
  payload: SetupPayload,
) {
  const datasText = formatDatasText(payload.datas.aula1, payload.datas.aula2, payload.datas.aula3);
  const msg = `feat: setup obrigado turma #${num}`;

  // thank-you-page.tsx
  for (const filePath of [
    'src/components/thank-you-page.tsx',
    'src/components/ThankYouPage.tsx',
  ]) {
    try {
      const { content: raw, sha } = await getFileContent(newRepo, filePath);
      let content = raw
        .replace(/https:\/\/chat\.whatsapp\.com\/[^\s"']+/g, payload.whatsappLink)
        .replace(/DIAS \d{2}, \d{2} E \d{2} DE [A-ZÇÃÕ]+/g, datasText);
      await putFile(newRepo, filePath, content, sha, msg);
      break;
    } catch { /* tenta próximo caminho */ }
  }

  // index.html – meta descriptions
  try {
    const { content: htmlRaw, sha: htmlSha } = await getFileContent(newRepo, 'index.html');
    const d1 = new Date(payload.datas.aula1 + 'T12:00:00Z');
    const d2 = new Date(payload.datas.aula2 + 'T12:00:00Z');
    const d3 = new Date(payload.datas.aula3 + 'T12:00:00Z');
    const mes = MESES_PT[d1.getUTCMonth()].charAt(0) + MESES_PT[d1.getUTCMonth()].slice(1).toLowerCase();
    const dd = (d: Date) => String(d.getUTCDate()).padStart(2, '0');
    const datesHuman = `${dd(d1)}, ${dd(d2)} e ${dd(d3)} de ${mes}`;
    const html = htmlRaw
      .replace(/\d{2}, \d{2} e \d{2} de [a-zçãõ]+/gi, datesHuman)
      .replace(new RegExp(`obrigado-?${baseNum}\\.institutodespertamente\\.site`, 'g'),
        `obrigado${num}.institutodespertamente.site`);
    await putFile(newRepo, 'index.html', html, htmlSha, msg);
  } catch { /* segue */ }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = req.body as SetupPayload;

  if (!payload.turmaNumero || !payload.lancamentoId) {
    return res.status(400).json({ error: 'turmaNumero e lancamentoId são obrigatórios' });
  }

  const num = payload.turmaNumero;
  const log: string[] = [];

  try {
    // ── 1. GitHub captura ──────────────────────────────────────────────────────
    log.push('Buscando repositório base de captura...');
    const baseCaptura = await findLatestRepo('gratuito');
    log.push(`Base captura: ${baseCaptura.name} (#${baseCaptura.num})`);

    log.push(`Marcando ${baseCaptura.name} como template...`);
    await markAsTemplate(baseCaptura.name);

    log.push(`Criando repo ${payload.repoCaptura} a partir do template...`);
    await createFromTemplate(baseCaptura.name, payload.repoCaptura,
      `Turma #${num} - Curso Gratuito Instituto Despertamente`);
    log.push(`Repo captura criado: github.com/${GITHUB_OWNER}/${payload.repoCaptura}`);

    log.push('Atualizando arquivos da página de captura...');
    await updateCapturaPage(payload.repoCaptura, baseCaptura.num, num, payload);
    log.push('Página de captura atualizada.');

    // ── 2. GitHub obrigado ─────────────────────────────────────────────────────
    log.push('Buscando repositório base de obrigado...');
    const baseObrigado = await findLatestRepo('obrigado');
    log.push(`Base obrigado: ${baseObrigado.name} (#${baseObrigado.num})`);

    log.push(`Marcando ${baseObrigado.name} como template...`);
    await markAsTemplate(baseObrigado.name);

    log.push(`Criando repo ${payload.repoObrigado}...`);
    await createFromTemplate(baseObrigado.name, payload.repoObrigado,
      `Turma #${num} - Obrigado Instituto Despertamente`);
    log.push(`Repo obrigado criado: github.com/${GITHUB_OWNER}/${payload.repoObrigado}`);

    log.push('Atualizando arquivos da página de obrigado...');
    await updateObrigadoPage(payload.repoObrigado, baseObrigado.num, num, payload);
    log.push('Página de obrigado atualizada.');

    // ── 3. Vercel captura ──────────────────────────────────────────────────────
    log.push('Criando projeto Vercel para captura...');
    const vercelCaptura = await createVercelProject(`gratuito-${num}`, payload.repoCaptura);
    log.push(`Projeto Vercel captura criado: ${vercelCaptura.id}`);

    await setVercelEnvVars(vercelCaptura.id, {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      CRM_SUPABASE_URL: SUPABASE_URL,
      CRM_SUPABASE_SERVICE_KEY: CRM_SUPABASE_SERVICE_KEY,
      META_ACCESS_TOKEN: META_ACCESS_TOKEN,
      LANCAMENTO_ID: payload.lancamentoId,
    });
    log.push('Env vars Vercel captura configuradas.');

    const dominioCaptura = `gratuito-${num}.institutodespertamente.site`;
    await addVercelDomain(vercelCaptura.id, dominioCaptura);
    log.push(`Domínio captura: ${dominioCaptura}`);

    // ── 4. Vercel obrigado ─────────────────────────────────────────────────────
    log.push('Criando projeto Vercel para obrigado...');
    const vercelObrigado = await createVercelProject(`obrigado-${num}`, payload.repoObrigado);
    log.push(`Projeto Vercel obrigado criado: ${vercelObrigado.id}`);

    await setVercelEnvVars(vercelObrigado.id, {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    });
    log.push('Env vars Vercel obrigado configuradas.');

    const dominioObrigado = `obrigado${num}.institutodespertamente.site`;
    await addVercelDomain(vercelObrigado.id, dominioObrigado);
    log.push(`Domínio obrigado: ${dominioObrigado}`);

    log.push('✅ Setup concluído!');

    return res.status(200).json({
      success: true,
      log,
      urls: {
        repoCaptura: `https://github.com/${GITHUB_OWNER}/${payload.repoCaptura}`,
        repoObrigado: `https://github.com/${GITHUB_OWNER}/${payload.repoObrigado}`,
        captura: `https://${dominioCaptura}`,
        obrigado: `https://${dominioObrigado}`,
      },
    });
  } catch (err: any) {
    log.push(`❌ Erro: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message, log });
  }
}
