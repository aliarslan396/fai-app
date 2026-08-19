<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Action-plan items on a CAPA (doc 3.10).
 *
 * Three types per AS9100 §10.2:
 *   - containment: stop the bleeding right now (may duplicate capas.containment_action for tracked history)
 *   - corrective: fix the root cause so this specific defect doesn't recur
 *   - preventive: change the system so similar defects can't happen elsewhere
 *
 * Each item is assigned to a user with a due date. Status flows
 * pending → in_progress → done | blocked. Completion snapshot
 * (completed_at + completed_by) captured on close so we can later
 * prove the plan was executed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('capa_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('capa_id')->constrained('capas')->cascadeOnDelete();
            $table->string('action_type', 20);
            $table->text('description');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->nullable();
            $table->string('status', 20)->default('pending');
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index('capa_id');
            $table->index(['capa_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('capa_actions');
    }
};
