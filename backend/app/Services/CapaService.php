<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Capa;
use App\Models\CapaAction;
use App\Models\CapaFiveWhy;
use App\Models\Ncr;
use App\Models\TenantUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Single entry point for CAPA mutations. Same guarantees as NcrService:
 *   - Auto-numbering CAPA-YYYY-NNNN stays race-safe
 *   - State-machine transitions gated here (throws RuntimeException on bad move)
 *   - Audit log always fires
 *
 * State machine (doc 3.10 / prompt 4.7):
 *   open
 *     → root_cause_pending   (problem refined + containment saved)
 *     → action_plan_pending  (5-Why level 5 saved + root_cause_summary set)
 *     → approved             (all required roles signed off)
 *     → in_progress          (at least one action started)
 *     → closed | ineffective (effectiveness reviewed)
 *
 * Any method that mutates status validates the transition against
 * ALLOWED_TRANSITIONS below — invalid moves throw, controller
 * translates to 422.
 */
class CapaService
{
    /**
     * Roles required to approve a CAPA before the action plan runs.
     * Multi-role sign-off — matches AS9100 §10.2 governance intent.
     * qa_manager = quality authority. admin = management/production authority.
     */
    public const REQUIRED_APPROVER_ROLES = ['qa_manager', 'admin'];

    private const ALLOWED_TRANSITIONS = [
        Capa::STATUS_OPEN => [Capa::STATUS_ROOT_CAUSE_PENDING],
        Capa::STATUS_ROOT_CAUSE_PENDING => [Capa::STATUS_ACTION_PLAN_PENDING],
        Capa::STATUS_ACTION_PLAN_PENDING => [Capa::STATUS_APPROVED],
        // approved → in_progress: normal path (first action starts)
        // approved → closed/ineffective: happens when all work was done
        //   pre-approval; close() handles both origins.
        Capa::STATUS_APPROVED => [Capa::STATUS_IN_PROGRESS, Capa::STATUS_CLOSED, Capa::STATUS_INEFFECTIVE],
        Capa::STATUS_IN_PROGRESS => [Capa::STATUS_CLOSED, Capa::STATUS_INEFFECTIVE],
    ];

    // ---------------------------------------------------------------- create

    /**
     * Escalate an NCR to a CAPA. Copies part, defect_code, and a
     * summary problem_statement so the CAPA form is pre-populated.
     */
    public function createFromNcr(TenantUser $creator, Ncr $ncr): Capa
    {
        if ($ncr->capa_id) {
            throw new RuntimeException("NCR {$ncr->ncr_number} is already linked to a CAPA (#{$ncr->capa_id}). One NCR ↔ one CAPA.");
        }

        return DB::transaction(function () use ($creator, $ncr) {
            $problemStatement = $this->buildProblemStatement($ncr);

            $capa = Capa::create([
                'capa_number' => $this->nextCapaNumber(),
                'source' => Capa::SOURCE_NCR,
                'source_ncr_id' => $ncr->id,
                'part_id' => $ncr->part_id,
                'defect_code' => $ncr->defect_code,
                'problem_statement' => $problemStatement,
                'status' => Capa::STATUS_OPEN,
                'created_by' => $creator->id,
            ]);

            $ncr->update(['capa_id' => $capa->id]);

            AuditLog::record('capa.created', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'source_ncr_id' => $ncr->id,
                    'source_ncr_number' => $ncr->ncr_number,
                    'part_id' => $ncr->part_id,
                    'defect_code' => $ncr->defect_code,
                    'user_id' => $creator->id,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    // ------------------------------------------------------------- Tab 1: Problem

    /**
     * Save the refined problem statement + containment action.
     * Transitions open → root_cause_pending on first save.
     */
    public function refineProblem(TenantUser $user, Capa $capa, array $attrs): Capa
    {
        $problem = trim((string) ($attrs['problem_statement'] ?? ''));
        $containment = trim((string) ($attrs['containment_action'] ?? ''));

        if ($problem === '') {
            throw new InvalidArgumentException('Problem statement is required.');
        }
        if ($containment === '') {
            throw new InvalidArgumentException('Containment action is required — describe what stopped the bleeding right now.');
        }

        return DB::transaction(function () use ($user, $capa, $problem, $containment) {
            $capa->problem_statement = $problem;
            $capa->containment_action = $containment;

            if ($capa->status === Capa::STATUS_OPEN) {
                $this->guardTransition($capa->status, Capa::STATUS_ROOT_CAUSE_PENDING);
                $capa->status = Capa::STATUS_ROOT_CAUSE_PENDING;
            }
            $capa->save();

            AuditLog::record('capa.problem_refined', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'user_id' => $user->id,
                    'status' => $capa->status,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    // ------------------------------------------------------------- Tab 2: 5-Why

    /**
     * Save one level of the 5-Why chain. Enforces progressive lock —
     * cannot write level N until level N-1 exists.
     */
    public function saveFiveWhy(TenantUser $user, Capa $capa, int $level, string $whyText): CapaFiveWhy
    {
        if ($level < 1 || $level > 5) {
            throw new InvalidArgumentException('5-Why level must be between 1 and 5.');
        }
        if (trim($whyText) === '') {
            throw new InvalidArgumentException('Why text is required.');
        }
        if ($capa->status === Capa::STATUS_OPEN) {
            throw new RuntimeException('Complete the Problem tab before starting root-cause analysis.');
        }

        if ($level > 1) {
            $priorExists = CapaFiveWhy::where('capa_id', $capa->id)
                ->where('level', $level - 1)
                ->exists();
            if (! $priorExists) {
                throw new RuntimeException("Save level " . ($level - 1) . " first — 5-Why chain must be filled in order.");
            }
        }

        return DB::transaction(function () use ($user, $capa, $level, $whyText) {
            $row = CapaFiveWhy::updateOrCreate(
                ['capa_id' => $capa->id, 'level' => $level],
                ['why_text' => trim($whyText), 'created_by' => $user->id],
            );

            AuditLog::record('capa.five_why_saved', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'level' => $level,
                    'user_id' => $user->id,
                ],
            ]);

            return $row;
        });
    }

    /**
     * After all five whys exist and the summary is set, advance status
     * to action_plan_pending.
     */
    public function completeRootCause(TenantUser $user, Capa $capa, string $summary): Capa
    {
        $summary = trim($summary);
        if ($summary === '') {
            throw new InvalidArgumentException('Root cause summary is required.');
        }

        $count = CapaFiveWhy::where('capa_id', $capa->id)->count();
        if ($count < 5) {
            throw new RuntimeException("All 5 levels must be filled before completing root cause ({$count}/5 done).");
        }

        return DB::transaction(function () use ($user, $capa, $summary) {
            $capa->root_cause_summary = $summary;

            if ($capa->status === Capa::STATUS_ROOT_CAUSE_PENDING) {
                $this->guardTransition($capa->status, Capa::STATUS_ACTION_PLAN_PENDING);
                $capa->status = Capa::STATUS_ACTION_PLAN_PENDING;
            }
            $capa->save();

            AuditLog::record('capa.root_cause_completed', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'user_id' => $user->id,
                    'status' => $capa->status,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    // ------------------------------------------------------------- Tab 3: Action Plan

    public function addAction(TenantUser $user, Capa $capa, array $attrs): CapaAction
    {
        $this->validateActionType($attrs['action_type'] ?? '');
        $description = trim((string) ($attrs['description'] ?? ''));
        if ($description === '') {
            throw new InvalidArgumentException('Action description is required.');
        }

        return DB::transaction(function () use ($user, $capa, $attrs, $description) {
            $action = CapaAction::create([
                'capa_id' => $capa->id,
                'action_type' => $attrs['action_type'],
                'description' => $description,
                'assigned_to' => $attrs['assigned_to'] ?? null,
                'due_date' => $attrs['due_date'] ?? null,
                'status' => CapaAction::STATUS_PENDING,
                'created_by' => $user->id,
            ]);

            AuditLog::record('capa.action_added', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'action_id' => $action->id,
                    'action_type' => $action->action_type,
                    'user_id' => $user->id,
                ],
            ]);

            return $action->fresh(['assignee:id,name']);
        });
    }

    public function updateAction(TenantUser $user, CapaAction $action, array $attrs): CapaAction
    {
        $capa = $action->capa()->firstOrFail();

        return DB::transaction(function () use ($user, $capa, $action, $attrs) {
            if (array_key_exists('action_type', $attrs)) {
                $this->validateActionType($attrs['action_type']);
                $action->action_type = $attrs['action_type'];
            }
            if (array_key_exists('description', $attrs) && trim((string) $attrs['description']) !== '') {
                $action->description = trim((string) $attrs['description']);
            }
            if (array_key_exists('assigned_to', $attrs)) {
                $action->assigned_to = $attrs['assigned_to'] ?: null;
            }
            if (array_key_exists('due_date', $attrs)) {
                $action->due_date = $attrs['due_date'] ?: null;
            }
            if (array_key_exists('status', $attrs)) {
                $newStatus = $attrs['status'];
                if (! in_array($newStatus, CapaAction::STATUSES, true)) {
                    throw new InvalidArgumentException("Invalid action status: {$newStatus}");
                }

                if ($newStatus === CapaAction::STATUS_DONE) {
                    $action->completed_at = now();
                    $action->completed_by = $user->id;
                } elseif ($action->status === CapaAction::STATUS_DONE && $newStatus !== CapaAction::STATUS_DONE) {
                    // Reopened
                    $action->completed_at = null;
                    $action->completed_by = null;
                }

                $action->status = $newStatus;

                // First time any action starts moves the parent to in_progress.
                if ($newStatus === CapaAction::STATUS_IN_PROGRESS
                    && $capa->status === Capa::STATUS_APPROVED) {
                    $this->guardTransition($capa->status, Capa::STATUS_IN_PROGRESS);
                    $capa->status = Capa::STATUS_IN_PROGRESS;
                    $capa->save();
                }
            }

            $action->save();

            AuditLog::record('capa.action_updated', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'action_id' => $action->id,
                    'status' => $action->status,
                    'user_id' => $user->id,
                ],
            ]);

            return $action->fresh(['assignee:id,name', 'completer:id,name']);
        });
    }

    public function deleteAction(TenantUser $user, CapaAction $action): void
    {
        $capa = $action->capa()->firstOrFail();

        if (! in_array($capa->status, [Capa::STATUS_ACTION_PLAN_PENDING, Capa::STATUS_ROOT_CAUSE_PENDING], true)) {
            throw new RuntimeException('Actions can only be removed before the CAPA is approved.');
        }

        DB::transaction(function () use ($user, $capa, $action) {
            AuditLog::record('capa.action_deleted', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'action_id' => $action->id,
                    'user_id' => $user->id,
                ],
            ]);
            $action->delete();
        });
    }

    // ------------------------------------------------------------- Tab 4: Approval

    /**
     * Multi-role approval. The approving user's role is captured in
     * approved_by (JSON array). When every required role has signed,
     * the CAPA transitions to approved.
     */
    public function approve(TenantUser $user, Capa $capa, ?string $note = null): Capa
    {
        if ($capa->status !== Capa::STATUS_ACTION_PLAN_PENDING) {
            throw new RuntimeException('CAPA is not ready for approval — complete the action plan first.');
        }

        $actionCount = CapaAction::where('capa_id', $capa->id)->count();
        if ($actionCount === 0) {
            throw new RuntimeException('At least one action item is required before approval.');
        }

        $userRole = $this->resolvePrimaryRole($user);
        if (! in_array($userRole, self::REQUIRED_APPROVER_ROLES, true)) {
            throw new RuntimeException("Role '{$userRole}' cannot approve CAPAs. Required roles: " . implode(', ', self::REQUIRED_APPROVER_ROLES));
        }

        return DB::transaction(function () use ($user, $capa, $userRole, $note) {
            $existing = collect($capa->approved_by ?? []);

            if ($existing->pluck('role')->contains($userRole)) {
                throw new RuntimeException("Role '{$userRole}' has already approved this CAPA.");
            }

            $existing->push([
                'user_id' => $user->id,
                'user_name' => $user->name,
                'role' => $userRole,
                'note' => $note,
                'approved_at' => now()->toIso8601String(),
            ]);
            $capa->approved_by = $existing->values()->all();

            $rolesApproved = $existing->pluck('role')->unique();
            $allDone = collect(self::REQUIRED_APPROVER_ROLES)->every(fn ($r) => $rolesApproved->contains($r));

            if ($allDone) {
                $this->guardTransition($capa->status, Capa::STATUS_APPROVED);
                $capa->status = Capa::STATUS_APPROVED;
                $capa->approved_at = now();
            }
            $capa->save();

            AuditLog::record('capa.approved', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'user_id' => $user->id,
                    'role' => $userRole,
                    'fully_approved' => $allDone,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    // ------------------------------------------------------------- Tab 5: Effectiveness

    public function scheduleEffectiveness(TenantUser $user, Capa $capa, string $date): Capa
    {
        if (! in_array($capa->status, [Capa::STATUS_APPROVED, Capa::STATUS_IN_PROGRESS], true)) {
            throw new RuntimeException('Effectiveness review can only be scheduled after approval.');
        }

        try {
            $parsed = Carbon::parse($date);
        } catch (\Throwable $e) {
            throw new InvalidArgumentException("Invalid date: {$date}");
        }
        if ($parsed->isPast()) {
            throw new InvalidArgumentException('Effectiveness review date must be in the future.');
        }

        return DB::transaction(function () use ($user, $capa, $parsed) {
            $capa->effectiveness_review_date = $parsed->toDateString();
            $capa->save();

            AuditLog::record('capa.effectiveness_scheduled', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'review_date' => $parsed->toDateString(),
                    'user_id' => $user->id,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    /**
     * Close the CAPA. `effective` → closed; `ineffective` → ineffective
     * (which reopens a new CAPA cycle manually — not automatic to force human review).
     */
    public function close(TenantUser $user, Capa $capa, string $result, ?string $notes = null): Capa
    {
        if (! in_array($capa->status, [Capa::STATUS_APPROVED, Capa::STATUS_IN_PROGRESS], true)) {
            throw new RuntimeException('CAPA must be approved (or in progress) before it can be closed.');
        }
        if (! in_array($result, Capa::EFFECTIVENESS_RESULTS, true)) {
            throw new InvalidArgumentException("Invalid effectiveness result: {$result}");
        }

        $openActions = CapaAction::where('capa_id', $capa->id)
            ->whereNotIn('status', [CapaAction::STATUS_DONE])
            ->count();
        if ($openActions > 0) {
            throw new RuntimeException("Cannot close CAPA — {$openActions} action item(s) still open.");
        }

        return DB::transaction(function () use ($user, $capa, $result, $notes) {
            $capa->effectiveness_result = $result;
            $capa->effectiveness_notes = $notes;
            $capa->closed_by = $user->id;
            $capa->closed_at = now();

            $newStatus = $result === Capa::EFFECTIVENESS_INEFFECTIVE
                ? Capa::STATUS_INEFFECTIVE
                : Capa::STATUS_CLOSED;

            $this->guardTransition($capa->status, $newStatus);
            $capa->status = $newStatus;
            $capa->save();

            AuditLog::record('capa.closed', [
                'subject_type' => Capa::class,
                'subject_id' => $capa->id,
                'meta' => [
                    'capa_number' => $capa->capa_number,
                    'result' => $result,
                    'status' => $newStatus,
                    'user_id' => $user->id,
                ],
            ]);

            return $capa->fresh($this->baseLoad());
        });
    }

    // ---------------------------------------------------------------- helpers

    private function guardTransition(string $from, string $to): void
    {
        $allowed = self::ALLOWED_TRANSITIONS[$from] ?? [];
        if (! in_array($to, $allowed, true)) {
            throw new RuntimeException("Illegal CAPA transition: {$from} → {$to}");
        }
    }

    private function validateActionType(string $type): void
    {
        if (! in_array($type, CapaAction::TYPES, true)) {
            throw new InvalidArgumentException("Invalid action type: {$type}. Must be one of: " . implode(', ', CapaAction::TYPES));
        }
    }

    /**
     * Resolve the user's primary role for approval-gate purposes.
     * Tenant users use spatie/permission — first role name wins.
     */
    private function resolvePrimaryRole(TenantUser $user): string
    {
        $role = $user->roles->first();
        return $role?->name ?? 'unknown';
    }

    private function buildProblemStatement(Ncr $ncr): string
    {
        $parts = ["Escalated from NCR {$ncr->ncr_number}"];
        if ($ncr->defect_code) {
            $parts[] = "defect: {$ncr->defect_code}";
        }
        if ($ncr->part_id) {
            $partNumber = $ncr->part?->part_number;
            if ($partNumber) {
                $parts[] = "part: {$partNumber}";
            }
        }
        if ($ncr->quantity_affected) {
            $parts[] = "qty affected: {$ncr->quantity_affected}";
        }
        if ($ncr->detection_point) {
            $parts[] = "detected at: {$ncr->detection_point}";
        }
        return implode(' · ', $parts);
    }

    private function nextCapaNumber(): string
    {
        $year = now()->year;
        $prefix = "CAPA-{$year}-";

        return DB::transaction(function () use ($year, $prefix) {
            $lastNumber = Capa::withTrashed()
                ->where('capa_number', 'like', $prefix . '%')
                ->lockForUpdate()
                ->orderByDesc('capa_number')
                ->value('capa_number');

            $lastSeq = 0;
            if ($lastNumber) {
                $lastSeq = (int) substr($lastNumber, strlen($prefix));
            }

            return sprintf('CAPA-%04d-%04d', $year, $lastSeq + 1);
        });
    }

    private function baseLoad(): array
    {
        return [
            'sourceNcr:id,ncr_number,status,defect_code,severity',
            'part:id,part_number,description',
            'creator:id,name',
            'closer:id,name',
            'fiveWhys',
            'actions.assignee:id,name',
            'actions.completer:id,name',
        ];
    }
}
