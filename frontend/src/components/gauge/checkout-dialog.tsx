"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import api from "@/lib/api"
import { getErrorMessage } from "@/lib/errors"
import { apiCheckOutGauge, type Gauge } from "@/lib/gauges"

interface Props {
  gauge: Gauge
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

interface UserOption {
  id: number
  name: string
}

export function CheckoutDialog({ gauge, open, onOpenChange, onDone }: Props) {
  const [users, setUsers] = useState<UserOption[]>([])
  const [toUser, setToUser] = useState<string>("")
  const [jobRef, setJobRef] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        const { data } = await api.get("/users")
        setUsers((data.data ?? []).map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })))
      } catch {
        // Non-fatal — user can still type a note.
      }
    })()
  }, [open])

  const reset = () => {
    setToUser("")
    setJobRef("")
    setNotes("")
  }

  async function submit() {
    if (!toUser) {
      toast.error("Assignee is required")
      return
    }
    setBusy(true)
    try {
      await apiCheckOutGauge(gauge.id, {
        checked_out_to: Number(toUser),
        job_reference: jobRef.trim() || null,
        notes: notes.trim() || null,
      })
      toast.success(`${gauge.gauge_id} checked out`)
      reset()
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to check out"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out {gauge.gauge_id}</DialogTitle>
          <DialogDescription>
            Track who has the gauge and what job it&apos;s being used on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Assignee</Label>
            <Select value={toUser} onValueChange={setToUser} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Job Reference (optional)</Label>
            <Input
              placeholder="Part #, WO #, FAI #..."
              value={jobRef}
              onChange={(e) => setJobRef(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking out
              </>
            ) : (
              "Check Out"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
