'use client'

import { useState } from 'react'
import { Loader2, Award, CheckCircle, Copy, Check, Download } from 'lucide-react'
import { resgatarCertificado } from '@/lib/actions/lancamento'

interface Certificate {
  certificate_code: string
  full_name: string
  issued_at: string
}

export function CertificadoForm({ existingCert }: { existingCert?: Certificate | null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cert, setCert] = useState<Certificate | null>(existingCert ?? null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function downloadPDF() {
    if (!cert) return
    setDownloading(true)
    try {
      const params = new URLSearchParams({ nome: cert.full_name, code: cert.certificate_code })
      const res = await fetch(`/api/certificado/pdf?${params}`)
      if (!res.ok) throw new Error('Erro ao gerar PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificado-${cert.full_name.toLowerCase().replace(/\s+/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // silencia — o certificado visual já está disponível
    } finally {
      setDownloading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await resgatarCertificado(fd)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    if (result.success && result.certificate) setCert(result.certificate as Certificate)
  }

  function copyCode() {
    if (cert?.certificate_code) {
      navigator.clipboard.writeText(cert.certificate_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (cert) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Certificado visual */}
        <div
          className="relative rounded-3xl overflow-hidden p-8 text-center space-y-4"
          style={{ background: 'linear-gradient(135deg, #0A1232 0%, #0F1940 100%)', border: '1px solid rgba(255,184,0,0.3)' }}
        >
          {/* Ornamento */}
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl" style={{ background: 'linear-gradient(90deg, #FFB800, #FFC933, #FFB800)' }} />

          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(255,184,0,0.15)', border: '2px solid rgba(255,184,0,0.4)' }}>
            <Award className="w-8 h-8" style={{ color: '#FFB800' }} />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#FFB800' }}>Certificado de Participação</p>
            <p className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
              {cert.full_name}
            </p>
            <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              concluiu com sucesso o<br />
              <span className="text-white font-semibold">Lançamento Gratuito — Instituto Despertamente</span>
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <code className="text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,184,0,0.15)', color: '#FFC933', letterSpacing: '0.05em' }}>
              {cert.certificate_code}
            </code>
            <button onClick={copyCode} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(255,184,0,0.1)', color: '#FFB800' }}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Emitido em {new Date(cert.issued_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Botão download PDF */}
        <button
          onClick={downloadPDF}
          disabled={downloading}
          className="w-full h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0D1638', boxShadow: '0 8px 24px rgba(255,184,0,0.3)' }}
        >
          {downloading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
            : <><Download className="w-4 h-4" /> Baixar Certificado em PDF</>
          }
        </button>

        <div className="flex items-center gap-2 text-sm font-medium text-green-600 justify-center">
          <CheckCircle className="w-4 h-4" />
          Certificado salvo na aba <a href="/certificados" className="underline">Certificados</a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-bold text-[#1a2430] block">Seu nome completo</label>
        <input name="full_name" type="text" placeholder="Como deve aparecer no certificado"
          required className="w-full h-11 px-4 rounded-xl text-[#1a2430] text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-bold text-[#1a2430]">As 3 palavras-chave reveladas nas aulas</p>
        <p className="text-xs text-[#5f6b78]">Preste atenção durante as aulas ao vivo — as palavras são reveladas em momentos especiais.</p>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-1">
              <label className="text-xs font-semibold text-[#5f6b78]">Palavra {n}</label>
              <input name={`word${n}`} type="text" placeholder={`Palavra ${n}`}
                required className="w-full h-11 px-3 rounded-xl text-[#1a2430] text-sm text-center outline-none font-semibold"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(23,36,50,0.1)' }} />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-600 border border-red-100">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full h-12 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', boxShadow: '0 8px 24px rgba(255,184,0,0.3)' }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Award className="w-4 h-4" /> Resgatar meu Certificado</>}
      </button>
    </form>
  )
}
