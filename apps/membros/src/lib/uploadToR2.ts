import { createClient } from '@/lib/supabase/client'

/**
 * Sobe um arquivo (vídeo/PDF) direto pro R2, sem passar pelo Vercel:
 * pede uma URL assinada de PUT pra edge function `membros-upload-url`
 * e faz o upload direto do navegador pro R2 com essa URL.
 */
export async function uploadToR2(
  file: File,
  pasta: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada, recarregue a página.')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const signRes = await fetch(`${supabaseUrl}/functions/v1/membros-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ pasta, filename: file.name, contentType: file.type || 'application/octet-stream' }),
  })
  const signData = await signRes.json()
  if (!signRes.ok || !signData.ok) throw new Error(signData.error ?? `Falha ao gerar URL de upload (${signRes.status})`)

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signData.putUrl)
    xhr.setRequestHeader('Content-Type', signData.contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 respondeu ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('Falha de rede no upload pro R2.'))
    xhr.send(file)
  })

  return signData.publicUrl as string
}
