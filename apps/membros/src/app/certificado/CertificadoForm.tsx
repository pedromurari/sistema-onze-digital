'use client'

import { useState } from 'react'
import { Award, Loader2, XCircle, AlertTriangle, Download, RotateCcw } from 'lucide-react'
import { ObrigadoModal } from './ObrigadoModal'

// ─── Phone mask ───────────────────────────────────────────────────────────────

function applyPhoneMask(value: string) {
  const digits = value.replace(/\D/g, '').substring(0, 11)
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ─── Component ───────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'gate' | 'success' | 'error' | 'blocked'

const inputCls =
  'w-full h-12 px-4 rounded-2xl text-sm outline-none transition-colors bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-[#FFB800]/60 focus:bg-white/8'

export function CertificadoForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [nome, setNome] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadFilename, setDownloadFilename] = useState('')
  const [showObrigadoModal, setShowObrigadoModal] = useState(false)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [palavra1, setPalavra1] = useState('')
  const [palavra2, setPalavra2] = useState('')
  const [palavra3, setPalavra3] = useState('')

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTelefone(applyPhoneMask(e.target.value))
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:     fullName.trim(),
          telefone: telefone.trim(),
          email:    email.trim(),
          cidade:   cidade.trim(),
          palavra1: palavra1.trim(),
          palavra2: palavra2.trim(),
          palavra3: palavra3.trim(),
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const filename = `certificado-${fullName.trim().toLowerCase().replace(/\s+/g, '-')}.pdf`

        // Não baixa ainda — primeiro mostra o popup, o download só acontece
        // quando o lead clica no botão "ir para o certificado" dentro dele.
        setDownloadUrl(url)
        setDownloadFilename(filename)
        setNome(fullName.trim())
        setStatus('gate')
        setShowObrigadoModal(true)
        return
      }

      const data = await res.json().catch(() => ({ error: 'Erro desconhecido.' }))
      const msg = data.error ?? 'Erro ao processar sua solicitação.'

      if (res.status === 403 || res.status === 429) {
        setErrorMsg(msg)
        setStatus('blocked')
      } else {
        setErrorMsg(msg)
        setStatus('error')
        setPalavra1('')
        setPalavra2('')
        setPalavra3('')
      }
    } catch {
      setErrorMsg('Erro de conexão. Verifique sua internet e tente novamente.')
      setStatus('error')
    }
  }

  function handleRevealCertificado() {
    if (downloadUrl && downloadFilename) {
      triggerDownload(downloadUrl, downloadFilename)
    }
    setShowObrigadoModal(false)
    setStatus('success')
  }

  // ── Popup antes do certificado (Instagram/WhatsApp) ──────────────────────────
  if (status === 'gate') {
    return (
      <>
        {showObrigadoModal && (
          <ObrigadoModal nome={nome} onContinue={handleRevealCertificado} />
        )}
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,184,0,0.15)', border: '2px solid rgba(255,184,0,0.4)' }}
          >
            <Award className="w-7 h-7" style={{ color: '#FFB800' }} />
          </div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Quase lá...</p>
        </div>
      </>
    )
  }

  // ── Sucesso ──────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="space-y-6 text-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(255,184,0,0.15)', border: '2px solid rgba(255,184,0,0.4)' }}
        >
          <Award className="w-9 h-9" style={{ color: '#FFB800' }} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#FFB800' }}>
            Parabéns!
          </p>
          <h2 className="text-2xl font-bold text-white">
            {nome}, seu certificado foi gerado!
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            O download do PDF iniciou automaticamente.
          </p>
        </div>

        {downloadUrl && (
          <button
            onClick={() => triggerDownload(downloadUrl, downloadFilename)}
            className="w-full h-[52px] rounded-2xl text-sm font-bold text-[#0D1638] flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFB800, #FFC933)',
              boxShadow: '0 8px 24px rgba(255,184,0,0.3)',
            }}
          >
            <Download className="w-4 h-4" />
            Baixar certificado em PDF
          </button>
        )}

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Caso o download não tenha iniciado, clique no botão acima.
        </p>
      </div>
    )
  }

  // ── Bloqueado (já tentou) ─────────────────────────────────────────────────
  if (status === 'blocked') {
    return (
      <div className="space-y-5 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <XCircle className="w-8 h-8" style={{ color: '#f87171' }} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white">Tentativa bloqueada</h2>
          {errorMsg.split('\n').map((line, i) => (
            <p key={i} className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{line}</p>
          ))}
        </div>
      </div>
    )
  }

  // ── Formulário ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Dados pessoais */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(240,240,240,0.4)' }}>
          Seus dados
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white/70 block">Nome completo</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Como deve aparecer no certificado"
            required
            disabled={status === 'loading'}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70 block">Telefone</label>
            <input
              type="tel"
              value={telefone}
              onChange={handlePhoneChange}
              placeholder="(11) 99999-9999"
              required
              disabled={status === 'loading'}
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70 block">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={status === 'loading'}
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white/70 block">Cidade</label>
          <input
            type="text"
            value={cidade}
            onChange={e => setCidade(e.target.value)}
            placeholder="Sua cidade"
            required
            disabled={status === 'loading'}
            className={inputCls}
          />
        </div>
      </div>

      {/* Palavras-chave */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Palavras-chave da aula
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            As 3 palavras reveladas durante a aula, na ordem correta.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Palavra 1', value: palavra1, set: setPalavra1 },
            { label: 'Palavra 2', value: palavra2, set: setPalavra2 },
            { label: 'Palavra 3', value: palavra3, set: setPalavra3 },
          ].map(({ label, value, set }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</label>
              <input
                type="text"
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={label}
                required
                disabled={status === 'loading'}
                className="w-full h-12 px-3 rounded-2xl text-sm text-center font-semibold outline-none transition-colors bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:border-[#FFB800]/60"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Erro de palavras erradas */}
      {status === 'error' && errorMsg && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <div>
            {errorMsg.split('\n').map((line, i) => (
              <p key={i} className="text-sm" style={{ color: '#fca5a5' }}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de tentativas */}
      <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Cada e-mail tem direito a até 3 tentativas. Verifique as palavras antes de enviar.
      </p>

      {/* Botão */}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full rounded-2xl text-sm font-bold text-[#0D1638] flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          height: 52,
          background: 'linear-gradient(135deg, #FFB800, #FFC933)',
          boxShadow: '0 8px 24px rgba(255,184,0,0.3)',
        }}
      >
        {status === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin text-[#0D1638]" /> Validando...</>
          : status === 'error'
            ? <><RotateCcw className="w-4 h-4" /> Tentar novamente</>
            : <><Award className="w-4 h-4" /> Gerar meu certificado</>
        }
      </button>
    </form>
  )
}
