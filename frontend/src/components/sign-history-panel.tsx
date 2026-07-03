"use client"

import { History, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SignatureBlock } from "@/components/signature-block"
import { useSignatures, type SignableType } from "@/lib/signatures"

interface Props {
  signableType: SignableType
  signableId: number | null
  triggerLabel?: string
}

/**
 * Right-side drawer listing every signature ever applied to this form,
 * chronologically. Each entry shows the drawn signature + stamp + who,
 * when, and from which IP. Read-only audit view.
 */
export function SignHistoryPanel({
  signableType,
  signableId,
  triggerLabel = "Sign history",
}: Props) {
  const { signatures, loading, error } = useSignatures(signableType, signableId)
  const count = signatures.length

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={!signableId}>
          <History className="mr-1 h-3.5 w-3.5" />
          {triggerLabel}
          {count > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Sign history</SheetTitle>
          <SheetDescription>
            Every signature applied to this form, in the order it was signed.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && count === 0 && (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No signatures yet.
            </div>
          )}

          {signatures.map((sig, idx) => (
            <div key={sig.id} className="space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                #{idx + 1}
              </div>
              <SignatureBlock signature={sig} compact />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
