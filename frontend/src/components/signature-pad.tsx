"use client"

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react"
import SignaturePadLib from "signature_pad"

import { Button } from "@/components/ui/button"
import { Eraser } from "lucide-react"

export interface SignaturePadHandle {
  /** Base64 data URL (image/png) of the drawn signature, or null if canvas is empty. */
  getDataUrl: () => string | null
  isEmpty: () => boolean
  clear: () => void
}

interface Props {
  width?: number
  height?: number
  className?: string
  onChange?: (empty: boolean) => void
}

/**
 * Thin wrapper around signature_pad. Handles high-DPI canvas scaling
 * (fixes blurry signatures on retina + 4K displays) and a Clear button.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { width = 500, height = 180, className, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const padRef = useRef<SignaturePadLib | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // High-DPI scaling — logical size = props, backing store = props * dpr
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.getContext("2d")?.scale(dpr, dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "rgb(0,0,0)",
      minWidth: 0.8,
      maxWidth: 2.2,
      throttle: 16,
    })
    padRef.current = pad

    if (onChange) {
      pad.addEventListener("beginStroke", () => onChange(pad.isEmpty()))
      pad.addEventListener("endStroke", () => onChange(pad.isEmpty()))
    }

    return () => {
      pad.off()
      padRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  useImperativeHandle(
    ref,
    () => ({
      getDataUrl: () => {
        const pad = padRef.current
        if (!pad || pad.isEmpty()) return null
        return pad.toDataURL("image/png")
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => {
        padRef.current?.clear()
        onChange?.(true)
      },
    }),
    [onChange],
  )

  return (
    <div className={className}>
      <div className="rounded-md border bg-white">
        <canvas ref={canvasRef} className="rounded-md" style={{ touchAction: "none" }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Draw with mouse or finger</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => padRef.current?.clear()}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  )
})
