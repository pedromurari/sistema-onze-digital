import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const W = 841.89
const H = 595.28

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Allura é fonte script — precisa de tamanho maior para boa legibilidade
function nameFontSize(nome: string): number {
  const l = nome.length
  if (l <= 18) return 40
  if (l <= 26) return 34
  if (l <= 34) return 28
  return 22
}

// O espaço do "Nos dias ___" no template é fixo (~11 caracteres em Helvetica-Bold 11pt).
// Datas que cruzam meses (ex: "30/06 a 02/07") são mais longas — reduz a fonte para não invadir o "de" impresso.
function daysFontSize(dias: string): number {
  const l = dias.length
  if (l <= 11) return 11
  if (l <= 15) return 9
  return 7.5
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:      { padding: 0, backgroundColor: '#ffffff' },
  container: { width: W, height: H, position: 'relative' },
  bg:        { position: 'absolute', top: 0, left: 0, width: W, height: H },

  // "Nos dias [02, 03 e 04]" — blank1: entre fim de "Nos dias" (~210pt) e início de "de" (~295pt)
  daysWrap: {
    position: 'absolute',
    top: H * 0.339,
    left: W * 0.270,
  },
  daysText: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1a2430' },

  // "[junho de 2026]" — blank2: após "de" template (~350pt), antes de "Certificamos" (~466pt)
  monthWrap: {
    position: 'absolute',
    top: H * 0.339,
    left: W * 0.422,
    flexDirection: 'row',
    gap: 2,
  },
  monthBold:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1a2430' },
  monthNormal: { fontSize: 11, fontFamily: 'Helvetica',      color: '#1a2430' },

  // Nome do aluno — área em branco entre "Certificamos" e "Concluiu"
  nameWrapper: {
    position: 'absolute',
    top: H * 0.415,
    left: W * 0.12,
    width: W * 0.76,
    alignItems: 'center',
  },

  // Código
  codeRow: {
    position: 'absolute',
    bottom: H * 0.03,
    right: W * 0.04,
    flexDirection: 'row',
    gap: 4,
  },
  codeLabel: { fontSize: 7.5, fontFamily: 'Helvetica',      color: '#888888' },
  codeValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFB800' },
})

// ─── Props ────────────────────────────────────────────────────────────────────

export type CertificadoPDFProps = {
  nome: string
  code?: string
  /** Dias do lançamento — ex: "02, 03 e 04" */
  diasLive?: string
  /** Mês do lançamento — ex: "junho" */
  mesLive?: string
  /** Ano do lançamento — ex: "2026" */
  anoLive?: string
  bgUrl?: string
}

function generateCode() {
  return `IDM-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function CertificadoPDF({
  nome,
  code,
  diasLive,
  mesLive,
  anoLive,
  bgUrl,
}: CertificadoPDFProps) {
  const certCode = code ?? generateCode()
  const fontSize = nameFontSize(nome)

  const dias = diasLive ?? '—'
  const mes  = mesLive  ?? '—'
  const ano  = anoLive  ?? new Date().getFullYear().toString()

  return (
    <Document
      title={`Certificado — ${nome}`}
      author="Instituto Despertamente"
      subject="Certificado de Participação"
    >
      <Page size="A4" orientation="landscape" style={S.page}>
        <View style={S.container}>

          {bgUrl && <Image src={bgUrl} style={S.bg} />}

          {/* Dias — preenche o 1º campo em branco "Nos dias ___" */}
          <View style={S.daysWrap}>
            <Text style={[S.daysText, { fontSize: daysFontSize(dias) }]}>{dias}</Text>
          </View>

          {/* Mês+ano — preenche o 2º campo em branco "de ___" */}
          <View style={S.monthWrap}>
            {mes && (
              <>
                <Text style={S.monthBold}>{mes}</Text>
                <Text style={S.monthNormal}> de </Text>
              </>
            )}
            <Text style={S.monthBold}>{ano}</Text>
          </View>

          {/* Nome em Allura */}
          <View style={S.nameWrapper}>
            <Text style={{ fontSize, fontFamily: 'Allura', color: '#1a2430', textAlign: 'center' }}>
              {nome}
            </Text>
          </View>

          {/* Código */}
          <View style={S.codeRow}>
            <Text style={S.codeLabel}>Cód:</Text>
            <Text style={S.codeValue}>{certCode}</Text>
          </View>

        </View>
      </Page>
    </Document>
  )
}
