"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

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

export type CharType =
  | "linear"
  | "diameter"
  | "radius"
  | "angle"
  | "gdt"
  | "surface_finish"
  | "note"

export interface Characteristic {
  id?: number
  char_type: CharType
  description?: string | null
  nominal?: number | string | null
  upper_tolerance?: number | string | null
  lower_tolerance?: number | string | null
  unit?: string | null
  gdt_symbol?: string | null
  gdt_datum_a?: string | null
  gdt_datum_b?: string | null
  gdt_datum_c?: string | null
  gdt_material_condition?: "mmc" | "lmc" | "rfs" | null
  finish_value?: string | null
  finish_unit?: string | null
  inspection_method?: string | null
  requirement_string?: string | null
}

interface Props {
  planId: number
  balloonId: number
  balloonNumber: number
  initialCharType: CharType
  initialCharacteristic?: Characteristic | null
  onSaved: (char: Characteristic) => void
}

// 14 GD&T symbols per doc 4.2
const GDT_SYMBOLS = [
  { symbol: "⊕", name: "True Position" },
  { symbol: "⊥", name: "Perpendicularity" },
  { symbol: "⏥", name: "Flatness" },
  { symbol: "⌭", name: "Cylindricity" },
  { symbol: "⌒", name: "Profile of Line" },
  { symbol: "⌓", name: "Profile of Surface" },
  { symbol: "∠", name: "Angularity" },
  { symbol: "∥", name: "Parallelism" },
  { symbol: "◎", name: "Concentricity" },
  { symbol: "≡", name: "Symmetry" },
  { symbol: "↗", name: "Total Runout" },
  { symbol: "⇗", name: "Circular Runout" },
  { symbol: "○", name: "Circularity" },
  { symbol: "⏤", name: "Straightness" },
]

const FINISH_UNITS = ["Ra μin", "Ra μm", "Rz μin", "Rz μm", "RMS μin"]

export function CharacteristicPanel({
  planId,
  balloonId,
  balloonNumber,
  initialCharType,
  initialCharacteristic,
  onSaved,
}: Props) {
  const [form, setForm] = useState<Characteristic>({
    char_type: initialCharType,
    description: "",
    nominal: "",
    upper_tolerance: "",
    lower_tolerance: "",
    unit: "in",
    gdt_symbol: "",
    gdt_datum_a: "",
    gdt_datum_b: "",
    gdt_datum_c: "",
    gdt_material_condition: "rfs",
    finish_value: "",
    finish_unit: "Ra μin",
    inspection_method: "",
  })
  const [preview, setPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (initialCharacteristic) {
      setForm((prev) => ({
        ...prev,
        ...initialCharacteristic,
        char_type: initialCharacteristic.char_type || initialCharType,
        nominal: initialCharacteristic.nominal ?? "",
        upper_tolerance: initialCharacteristic.upper_tolerance ?? "",
        lower_tolerance: initialCharacteristic.lower_tolerance ?? "",
      }))
      setPreview(initialCharacteristic.requirement_string ?? "")
    } else {
      setForm((prev) => ({ ...prev, char_type: initialCharType }))
      setPreview("")
    }
  }, [initialCharacteristic, initialCharType, balloonId])

  // Live preview via server-side formatter
  useEffect(() => {
    if (previewDebounce.current) clearTimeout(previewDebounce.current)
    previewDebounce.current = setTimeout(() => {
      api
        .post("/plans/preview", form)
        .then((res) => setPreview(res.data.requirement_string || ""))
        .catch(() => {})
    }, 250)
    return () => {
      if (previewDebounce.current) clearTimeout(previewDebounce.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form)])

  const update = (k: keyof Characteristic, v: unknown) => {
    setForm((prev) => ({ ...prev, [k]: v as never }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await api.post(`/plans/${planId}/balloons/${balloonId}/characteristic`, form)
      toast.success(`Bubble #${balloonNumber} saved`)
      onSaved(data.characteristic)
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"))
    } finally {
      setSaving(false)
    }
  }

  const t = form.char_type

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Bubble</span>
          <span className="font-mono text-lg font-semibold">#{balloonNumber}</span>
        </div>
        <div className="mt-2">
          <Label className="mb-1.5 block text-xs">Type</Label>
          <Select
            value={form.char_type}
            onValueChange={(v) => update("char_type", v as CharType)}
            disabled={saving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="diameter">Diameter</SelectItem>
              <SelectItem value="radius">Radius</SelectItem>
              <SelectItem value="angle">Angle</SelectItem>
              <SelectItem value="gdt">GD&T</SelectItem>
              <SelectItem value="surface_finish">Surface finish</SelectItem>
              <SelectItem value="note">Note</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {(t === "linear" || t === "diameter" || t === "radius") && (
            <>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  value={(form.description ?? "") as string}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="e.g. Wing bracket length"
                />
              </div>
              <div>
                <Label className="text-xs">Nominal</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.nominal as string | number}
                  onChange={(e) => update("nominal", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">+ Tol</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.upper_tolerance as string | number}
                    onChange={(e) => update("upper_tolerance", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">- Tol</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.lower_tolerance as string | number}
                    onChange={(e) => update("lower_tolerance", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Select
                  value={form.unit ?? "in"}
                  onValueChange={(v) => update("unit", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">in (inches)</SelectItem>
                    <SelectItem value="mm">mm (millimeters)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {t === "angle" && (
            <>
              <div>
                <Label className="text-xs">Description</Label>
                <Input
                  value={(form.description ?? "") as string}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Nominal (degrees)</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.nominal as string | number}
                  onChange={(e) => update("nominal", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">+ Tol</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.upper_tolerance as string | number}
                    onChange={(e) => update("upper_tolerance", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">- Tol</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.lower_tolerance as string | number}
                    onChange={(e) => update("lower_tolerance", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {t === "gdt" && (
            <>
              <div>
                <Label className="mb-2 block text-xs">Symbol</Label>
                <div className="grid grid-cols-7 gap-1">
                  {GDT_SYMBOLS.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      title={s.name}
                      onClick={() => update("gdt_symbol", s.symbol)}
                      className={`flex aspect-square items-center justify-center rounded border text-xl transition-colors ${
                        form.gdt_symbol === s.symbol
                          ? "border-primary bg-primary/10"
                          : "border-input hover:bg-muted"
                      }`}
                    >
                      {s.symbol}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Tolerance</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.upper_tolerance as string | number}
                  onChange={(e) => update("upper_tolerance", e.target.value)}
                  placeholder="0.005"
                />
              </div>
              <div>
                <Label className="text-xs">Material Condition</Label>
                <Select
                  value={form.gdt_material_condition ?? "rfs"}
                  onValueChange={(v) =>
                    update("gdt_material_condition", v as "mmc" | "lmc" | "rfs")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rfs">RFS (Regardless of Feature Size)</SelectItem>
                    <SelectItem value="mmc">MMC (Maximum Material Condition) Ⓜ</SelectItem>
                    <SelectItem value="lmc">LMC (Least Material Condition) Ⓛ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Datum A</Label>
                  <Input
                    value={(form.gdt_datum_a ?? "") as string}
                    onChange={(e) => update("gdt_datum_a", e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </div>
                <div>
                  <Label className="text-xs">Datum B</Label>
                  <Input
                    value={(form.gdt_datum_b ?? "") as string}
                    onChange={(e) => update("gdt_datum_b", e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </div>
                <div>
                  <Label className="text-xs">Datum C</Label>
                  <Input
                    value={(form.gdt_datum_c ?? "") as string}
                    onChange={(e) => update("gdt_datum_c", e.target.value.toUpperCase())}
                    maxLength={5}
                  />
                </div>
              </div>
            </>
          )}

          {t === "surface_finish" && (
            <>
              <div>
                <Label className="text-xs">Finish Value</Label>
                <Input
                  value={(form.finish_value ?? "") as string}
                  onChange={(e) => update("finish_value", e.target.value)}
                  placeholder="63"
                />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Select
                  value={form.finish_unit ?? "Ra μin"}
                  onValueChange={(v) => update("finish_unit", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINISH_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {t === "note" && (
            <div>
              <Label className="text-xs">Note text</Label>
              <Textarea
                value={(form.description ?? "") as string}
                onChange={(e) => update("description", e.target.value)}
                rows={6}
              />
            </div>
          )}

          {t !== "note" && (
            <div>
              <Label className="text-xs">Inspection Method</Label>
              <Input
                value={(form.inspection_method ?? "") as string}
                onChange={(e) => update("inspection_method", e.target.value)}
                placeholder="Calipers, CMM, Gauge, etc."
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-muted/40 p-3">
        <Label className="text-xs text-muted-foreground">Live preview</Label>
        <div className="mt-1 rounded-md border bg-background px-3 py-2 font-mono text-sm">
          {preview || <span className="text-muted-foreground">—</span>}
        </div>
        <Button onClick={save} disabled={saving} className="mt-3 w-full">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  )
}
