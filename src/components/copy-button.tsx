'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy Link
        </>
      )}
    </Button>
  )
}
