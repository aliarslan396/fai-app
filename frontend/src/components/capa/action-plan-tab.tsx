"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Play, Plus, Trash2, XOctagon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import api from "@/lib/api"
import {
  CAPA_ACTION_STATUS_COLOR,
  CAPA_ACTION_STATUS_LABEL,
  CAPA_ACTION_TYPE_COLOR,
  CAPA_ACTION_TYPE_LABEL,
  apiAddAction,
  apiDeleteAction,
  apiUpdateAction,
  type Capa,
  type CapaActionRow,
  type CapaActionStatus,
  type CapaActionType,
} from "@/lib/capas"
import { getErrorMessage } from "@/lib/errors"

interface UserOption {
  id: number
  name: string
}

/**
 * Tab 3 — Action Plan. Add/edit/delete containment, corrective, and
 * preventive actions. Deletion is only allowed while status is
 * ROOT_CAUSE_PENDING or ACTION_PLAN_PENDING; after approval, actions
 * become status-transition-only.
 */
export function ActionPlanTab({ capa, onSaved }: { capa: Capa; onSaved: () => void }) {
  const [users, setUsers] = useState<UserOption[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get("/users")
        setUsers((data.data ?? []).map((u: { id: number; name: string }) => ({ id: u.id, name: u.name })))
      } catch {
        // Non-fatal — assignee dropdown will just be empty.
      }
    })()
  }, [])

  const actions = capa.actions ?? []
  const editable = capa.status === "action_plan_pending" || capa.status === "root_cause_pending"

  return (
    <div className="space-y-4">
      {editable && <AddActionForm capaId={capa.id} users={users} onAdded={onSaved} />}

      {actions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No actions yet. Add at least one before requesting approval.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {actions.map((a) => (
            <ActionRow
              key={a.id}
              action={a}
              users={users}
              capaId={capa.id}
              editable={editable}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddActionForm({
  capaId,
  users,
  onAdded,
}: {
  capaId: number
  users: UserOption[]
  onAdded: () => void
}) {
  const [type, setType] = useState<CapaActionType>("corrective")
  const [description, setDescription] = useState("")
  const [assignee, setAssignee] = useState<string>("")
  const [dueDate, setDueDate] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!description.trim()) {
      toast.error("Description required")
      return
    }
    setBusy(true)
    try {
      await apiAddAction(capaId, {
        action_type: type,
        description: description.trim(),
        assigned_to: assignee ? Number(assignee) : null,
        due_date: dueDate || null,
      })
      setDescription("")
      setAssignee("")
      setDueDate("")
      toast.success("Action added")
      onAdded()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add action"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add Action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CapaActionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="containment">Containment</SelectItem>
                <SelectItem value="corrective">Corrective</SelectItem>
                <SelectItem value="preventive">Preventive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Assigned To</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
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
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea
            rows={3}
            placeholder="What exactly needs to happen?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={add} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Add Action
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ActionRow({
  action,
  users,
  capaId,
  editable,
  onSaved,
}: {
  action: CapaActionRow
  users: UserOption[]
  capaId: number
  editable: boolean
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function updateStatus(status: CapaActionStatus) {
    setBusy(true)
    try {
      await apiUpdateAction(capaId, action.id, { status })
      toast.success(`Status → ${CAPA_ACTION_STATUS_LABEL[status]}`)
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update"))
    } finally {
      setBusy(false)
    }
  }

  async function del() {
    setBusy(true)
    try {
      await apiDeleteAction(capaId, action.id)
      toast.success("Action removed")
      setConfirmDelete(false)
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to remove"))
    } finally {
      setBusy(false)
    }
  }

  const assigneeName = action.assignee?.name ?? users.find((u) => u.id === action.assigned_to)?.name

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={CAPA_ACTION_TYPE_COLOR[action.action_type]}>
                  {CAPA_ACTION_TYPE_LABEL[action.action_type]}
                </Badge>
                <Badge variant="outline" className={CAPA_ACTION_STATUS_COLOR[action.status]}>
                  {CAPA_ACTION_STATUS_LABEL[action.status]}
                </Badge>
              </div>
              <div className="whitespace-pre-wrap text-sm">{action.description}</div>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {assigneeName && <span>Assigned: {assigneeName}</span>}
                {action.due_date && <span>Due: {new Date(action.due_date).toLocaleDateString()}</span>}
                {action.completed_at && action.completer && (
                  <span>
                    Completed {new Date(action.completed_at).toLocaleDateString()} by {action.completer.name}
                  </span>
                )}
              </div>
            </div>

            {editable && (
              <Button
                variant="ghost"
                size="icon"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <StatusActions action={action} busy={busy} onChange={updateStatus} />
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this action?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The action will be permanently removed from the CAPA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={del} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function StatusActions({
  action,
  busy,
  onChange,
}: {
  action: CapaActionRow
  busy: boolean
  onChange: (s: CapaActionStatus) => void
}) {
  const buttons: Array<{ status: CapaActionStatus; label: string; icon: React.ReactNode }> = []

  if (action.status === "pending") {
    buttons.push({ status: "in_progress", label: "Start", icon: <Play className="mr-1 h-3 w-3" /> })
    buttons.push({ status: "blocked", label: "Block", icon: <XOctagon className="mr-1 h-3 w-3" /> })
  } else if (action.status === "in_progress") {
    buttons.push({ status: "done", label: "Mark Done", icon: <CheckCircle2 className="mr-1 h-3 w-3" /> })
    buttons.push({ status: "blocked", label: "Block", icon: <XOctagon className="mr-1 h-3 w-3" /> })
  } else if (action.status === "blocked") {
    buttons.push({ status: "in_progress", label: "Resume", icon: <Play className="mr-1 h-3 w-3" /> })
  } else if (action.status === "done") {
    buttons.push({ status: "in_progress", label: "Reopen", icon: <Play className="mr-1 h-3 w-3" /> })
  }

  if (!buttons.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button
          key={b.status}
          variant="outline"
          size="sm"
          onClick={() => onChange(b.status)}
          disabled={busy}
        >
          {b.icon}
          {b.label}
        </Button>
      ))}
    </div>
  )
}
