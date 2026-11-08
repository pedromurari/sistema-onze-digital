'use client'

import { useState } from 'react'
import { Loader2, Save, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LaunchConfig = {
  id: string; intro_video_url: string; intro_title: string; intro_description: string
  keyword_1: string; keyword_2: string; keyword_3: string
  product_name: string; product_price: string; product_url: string; product_description: string
}

type LaunchLive = {
  id: string; number: number; title: string; description: string
  date_label: string; time_label: string; live_url: string; is_locked: boolean
}

export function LancamentoConfigForm({ config, lives }: { config: LaunchConfig; lives: LaunchLive[] }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showKeywords, setShowKeywords] = useState(false)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)
    const fd = new FormData(e.currentTarget)
    const sb = createClient()

    await sb.from('launch_config').update({
      intro_video_url:   fd.get('intro_video_url'),
      intro_title:       fd.get('intro_title'),
      intro_description: fd.get('intro_description'),
      keyword_1:         fd.get('keyword_1'),
      keyword_2:         fd.get('keyword_2'),
      keyword_3:         fd.get('keyword_3'),
      product_name:      fd.get('product_name'),
      product_price:     fd.get('product_price'),
      product_url:       fd.get('product_url'),
      product_description: fd.get('product_description'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).eq('id', config.id)

    // Salva aulas ao vivo
    for (const live of lives) {
      await (sb.from('launch_lives') as any).update({
        title:       fd.get(`live_title_${live.id}`),
        description: fd.get(`live_desc_${live.id}`),
        date_label:  fd.get(`live_date_${live.id}`),
        time_label:  fd.get(`live_time_${live.id}`),
        live_url:    fd.get(`live_url_${live.id}`),
        is_locked:   fd.get(`live_locked_${live.id}`) === 'true',
      }).eq('id', live.id)
    }

    setLoading(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const field = (name: string, label: string, defaultValue: string, type = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-[#1a2430] block">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder}
        className="w-full h-11 px-4 rounded-xl text-[#1a2430] text-sm outline-none"
        style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
    </div>
  )

  return (
    <form onSubmit={save} className="space-y-8">

      {/* Aula Introdutória */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#fffaf3', border: '1px solid rgba(23,36,50,0.08)' }}>
        <h3 className="font-bold text-[#1a2430]">🎥 Aula Introdutória</h3>
        {field('intro_title', 'Título da aula', config.intro_title)}
        {field('intro_video_url', 'URL do YouTube', config.intro_video_url, 'url', 'https://youtube.com/watch?v=...')}
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-[#1a2430] block">Descrição</label>
          <textarea name="intro_description" defaultValue={config.intro_description} rows={3}
            className="w-full px-4 py-2.5 rounded-xl text-[#1a2430] text-sm outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
        </div>
      </div>

      {/* Aulas ao Vivo */}
      <div className="rounded-2xl p-5 space-y-5" style={{ background: '#fffaf3', border: '1px solid rgba(23,36,50,0.08)' }}>
        <h3 className="font-bold text-[#1a2430]">📡 Aulas ao Vivo</h3>
        {lives.map((live) => (
          <div key={live.id} className="space-y-3 pb-5" style={{ borderBottom: '1px solid rgba(23,36,50,0.06)' }}>
            <p className="text-xs font-black uppercase text-[#5f6b78] tracking-wider">Aula {live.number}</p>
            <div className="grid md:grid-cols-2 gap-3">
              {field(`live_title_${live.id}`, 'Título', live.title)}
              {field(`live_date_${live.id}`, 'Data', live.date_label, 'text', 'Ex: Seg, 02 de Junho')}
              {field(`live_time_${live.id}`, 'Horário', live.time_label, 'text', 'Ex: 20h00')}
              {field(`live_url_${live.id}`, 'Link da live', live.live_url ?? '', 'url', 'https://...')}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#1a2430] block">Descrição</label>
              <textarea name={`live_desc_${live.id}`} defaultValue={live.description} rows={2}
                className="w-full px-4 py-2.5 rounded-xl text-[#1a2430] text-sm outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-[#1a2430]">Bloqueada?</label>
              <select name={`live_locked_${live.id}`} defaultValue={String(live.is_locked)}
                className="h-9 px-3 rounded-lg text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }}>
                <option value="false">Não (link visível)</option>
                <option value="true">Sim (em breve)</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Produto */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#fffaf3', border: '1px solid rgba(23,36,50,0.08)' }}>
        <h3 className="font-bold text-[#1a2430]">🛍️ Produto Low Ticket</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {field('product_name', 'Nome do produto', config.product_name)}
          {field('product_price', 'Preço (ex: R$ 97)', config.product_price)}
        </div>
        {field('product_url', 'Link de checkout', config.product_url, 'url', 'https://...')}
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-[#1a2430] block">Descrição do produto</label>
          <textarea name="product_description" defaultValue={config.product_description} rows={2}
            className="w-full px-4 py-2.5 rounded-xl text-[#1a2430] text-sm outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
        </div>
      </div>

      {/* Palavras-chave do certificado */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#fffaf3', border: '1px solid rgba(23,36,50,0.08)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#1a2430]">🔑 Palavras-chave do Certificado</h3>
          <button type="button" onClick={() => setShowKeywords(!showKeywords)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#5f6b78] hover:text-[#1a2430]">
            {showKeywords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showKeywords ? 'Ocultar' : 'Revelar'}
          </button>
        </div>
        <p className="text-xs text-[#5f6b78]">Revele uma palavra por aula ao vivo. O aluno precisa inserir as 3 para resgatar o certificado.</p>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-1.5">
              <label className="text-xs font-bold text-[#5f6b78]">Palavra da Aula {n}</label>
              <input
                name={`keyword_${n}`}
                type={showKeywords ? 'text' : 'password'}
                defaultValue={(config as Record<string, string>)[`keyword_${n}`]}
                className="w-full h-11 px-3 rounded-xl text-[#1a2430] text-sm text-center outline-none font-bold"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }}
              />
            </div>
          ))}
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #1a2430, #2d3f52)' }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {success ? '✓ Salvo!' : 'Salvar configurações'}
      </button>
    </form>
  )
}
