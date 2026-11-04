import { useCallback, useRef, useState } from 'react';

const FOLDER_ID = '1RudAGfciHhJtHdpfCFR7imO52q7c6WhN';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink,webContentLink';
const CHUNK_SIZE = 5 * 1024 * 1024;

type UploadDestination = { month: string; cardId: string; publicLink?: boolean };

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: { initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: { error?: string; error_description?: string; access_token?: string }) => void;
    }) => { requestAccessToken: (options: { prompt: string }) => void } } } };
  }
}

export function useGoogleDriveUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const accessTokenRef = useRef<string | null>(null);

  const getAccessToken = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('O Google nao retornou autorizacao. Confira se o popup foi bloqueado e tente novamente.'));
      }, 45000);

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        callback();
      };

      if (!window.google?.accounts?.oauth2) {
        finish(() => reject(new Error('Google Identity Services nao carregado. Recarregue a pagina.')));
        return;
      }

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        finish(() => reject(new Error('VITE_GOOGLE_CLIENT_ID nao configurado no ambiente.')));
        return;
      }

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            finish(() => reject(new Error(response.error_description || response.error)));
            return;
          }
          if (!response.access_token) {
            finish(() => reject(new Error('O Google não retornou um token de acesso.')));
            return;
          }

          finish(() => {
            accessTokenRef.current = response.access_token;
            resolve(response.access_token);
          });
        },
      });

      tokenClient.requestAccessToken({ prompt: accessTokenRef.current ? '' : 'consent' });
    });
  }, []);

  const uploadToDrive = useCallback(async (file: File, destination?: UploadDestination): Promise<string> => {
    setUploading(true);
    setProgress(0);
    setStatusMessage('Abrindo autorizacao do Google...');

    try {
      setProgress(1);
      const token = accessTokenRef.current || await getAccessToken();
      setStatusMessage('Conectando com o Google Drive...');
      setProgress(5);

      let parentId = FOLDER_ID;
      if (destination) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(destination.month) || !/^[0-9a-f-]{36}$/i.test(destination.cardId)) {
          throw new Error('Destino do conteúdo inválido. Confira a data e salve o card novamente.');
        }
        setStatusMessage('Organizando pasta do conteúdo...');
        parentId = await ensureDriveFolder(token, parentId, 'Marketing');
        parentId = await ensureDriveFolder(token, parentId, destination.month);
        parentId = await ensureDriveFolder(token, parentId, destination.cardId);
      }

      const initRes = await fetchWithTimeout(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': file.type || 'application/octet-stream',
          'X-Upload-Content-Length': String(file.size),
        },
        body: JSON.stringify({
          name: file.name,
          parents: [parentId],
        }),
      }, 45000);

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err?.error?.message || 'Erro ao iniciar upload no Drive.');
      }

      const uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) throw new Error('URL de upload nao retornada pelo Drive.');

      setStatusMessage('Enviando arquivo para o Drive...');
      setProgress(10);

      let offset = 0;
      let fileId = '';
      let viewUrl = '';
      let downloadUrl = '';

      while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE - 1, file.size - 1);
        const chunk = file.slice(offset, end + 1);

        const res = await uploadChunk(uploadUrl, chunk, file.type, offset, end, file.size, (loaded) => {
          const uploadedBytes = offset + loaded;
          setProgress(Math.min(99, Math.round(10 + (uploadedBytes / file.size) * 85)));
        });

        if (res.status === 200 || res.status === 201) {
          const data = await res.json();
          fileId = data.id;
          viewUrl = data.webViewLink || '';
          downloadUrl = data.webContentLink || '';
        } else if (res.status !== 308) {
          const errorText = await res.text().catch(() => '');
          throw new Error(errorText || `Erro durante upload (status ${res.status}).`);
        }

        offset += CHUNK_SIZE;
      }

      if (!fileId) throw new Error('ID do arquivo nao retornado pelo Drive.');

      if (destination?.publicLink !== false) {
        setStatusMessage('Liberando link de acesso...');
        const permissionRes = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }, 45000);

        if (!permissionRes.ok) {
          const err = await permissionRes.json().catch(() => ({}));
          throw new Error(err?.error?.message || 'Arquivo enviado, mas nao foi possivel liberar o acesso.');
        }
      }

      setStatusMessage('Upload concluido.');
      setProgress(100);
      return viewUrl || downloadUrl || `https://drive.google.com/file/d/${fileId}/view`;
    } finally {
      setUploading(false);
    }
  }, [getAccessToken]);

  const hasAccessToken = useCallback(() => !!accessTokenRef.current, []);

  return { uploadToDrive, getAccessToken, hasAccessToken, uploading, progress, statusMessage };
}

async function ensureDriveFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
  const list = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 45000);
  if (!list.ok) throw new Error('Não foi possível localizar a pasta no Drive.');
  const existing = await list.json();
  if (existing.files?.[0]?.id) return existing.files[0].id;

  const created = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  }, 45000);
  if (!created.ok) {
    const error = await created.json().catch(() => ({}));
    throw new Error(error?.error?.message || 'Não foi possível criar a pasta do conteúdo no Drive.');
  }
  const data = await created.json();
  if (!data.id) throw new Error('O Drive não confirmou a pasta criada.');
  return data.id;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('O Google Drive demorou demais para responder. Tente novamente.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function uploadChunk(
  uploadUrl: string,
  chunk: Blob,
  contentType: string,
  start: number,
  end: number,
  total: number,
  onProgress: (loaded: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.timeout = 30 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };

    xhr.onload = () => {
      const headers = new Headers();
      xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((line) => {
        if (!line) return;
        const parts = line.split(': ');
        const header = parts.shift();
        if (header) headers.append(header, parts.join(': '));
      });

      resolve(new Response(xhr.responseText || null, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers,
      }));
    };

    xhr.onerror = () => reject(new Error('Falha de rede durante o upload para o Drive.'));
    xhr.ontimeout = () => reject(new Error('O upload demorou demais e foi interrompido. Tente novamente.'));
    xhr.send(chunk);
  });
}
