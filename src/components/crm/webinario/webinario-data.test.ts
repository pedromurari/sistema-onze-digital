import { describe, expect, it } from 'vitest';
import { bucketKanban, consolidarLeads, funilAcumulado, type TrackingJoined } from './webinario-funil';

const lead = { id: 'lead-1', nome: 'Pessoa', telefone: null, whatsapp: null, email: null, status: 'novo', vendedor: null, criado_em: '2026-10-24T12:00:00Z', pessoa_id: null };

describe('funil do webinário', () => {
  it('mantém o estágio mais avançado quando o mesmo lead tem mais de uma sessão', () => {
    const linhas: TrackingJoined[] = [
      { id: '1', lead_id: 'lead-1', watch_stage: 'cta_seen', updated_at: '2026-10-24T13:00:00Z', leads: lead },
      { id: '2', lead_id: 'lead-1', watch_stage: 'entered', updated_at: '2026-10-24T14:00:00Z', leads: lead },
    ];
    const resultado = consolidarLeads(linhas);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].stage).toBe('cta_seen');
    expect(funilAcumulado(resultado).find((item) => item.stage === 'cta_seen')?.quantidade).toBe(1);
  });

  it('divide o quadro em cadastro, entrada e interesse sem depender do status comercial', () => {
    expect(bucketKanban('registered')).toBe('cadastro');
    expect(bucketKanban('completed')).toBe('entrou');
    expect(bucketKanban('cta_seen')).toBe('interessado');
    expect(bucketKanban('offer_clicked')).toBe('interessado');
  });
});
