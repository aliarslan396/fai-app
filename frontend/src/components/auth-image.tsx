"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import api from "@/lib/api"

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string
  fallback?: React.ReactNode
}

/**
 * Renders an image from an authenticated API endpoint by fetching as blob
 * with the bearer token, then displaying via object URL.
 */
export function AuthImage({ src, alt, fallback, onLoad, onError, ...rest }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setError(false)
    setBlobUrl(null)

    api
      .get(src, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(res.data)
        setBlobUrl(createdUrl)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
      })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [src])

  if (error) {
    return fallback ? <>{fallback}</> : null
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 80 }}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={blobUrl} alt={alt} onLoad={onLoad} onError={onError} {...rest} />
}
