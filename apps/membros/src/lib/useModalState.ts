'use client'

import { useState } from 'react'

export function useModalState() {
  const [open, setOpen] = useState(false)
  return { open, abrir: () => setOpen(true), fechar: () => setOpen(false) }
}
