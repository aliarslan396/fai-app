<?php

namespace App\Console\Commands;

use App\Models\CentralAuditLog;
use App\Models\Tenant;
use App\Services\TenantOnboardingService;
use Illuminate\Console\Command;

/**
 * Hard-drops every tenant whose 30-day grace window has expired.
 * Scheduled daily (see Console\Kernel).
 */
class PurgeExpiredTenants extends Command
{
    protected $signature = 'tenants:purge {--dry-run : List what would be purged without touching anything}';

    protected $description = 'Hard-drop tenants whose 30-day grace window has expired';

    public function handle(TenantOnboardingService $onboarding): int
    {
        $due = Tenant::where('status', 'cancelled')
            ->whereNotNull('purge_at')
            ->where('purge_at', '<=', now())
            ->get();

        if ($due->isEmpty()) {
            $this->info('No tenants due for purge.');
            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');
        $this->info(($dryRun ? '[DRY RUN] ' : '') . 'Purging ' . $due->count() . ' tenant(s):');

        foreach ($due as $tenant) {
            $this->line("  - {$tenant->id} ({$tenant->subdomain}) marked {$tenant->deleted_at}");
            if ($dryRun) {
                continue;
            }
            try {
                $onboarding->purge($tenant);
            } catch (\Throwable $e) {
                $this->error("    FAILED: {$e->getMessage()}");
                CentralAuditLog::record('tenant.purge_failed', [
                    'tenant_id' => $tenant->id,
                    'meta' => ['error' => $e->getMessage()],
                ]);
            }
        }

        return self::SUCCESS;
    }
}
