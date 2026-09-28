<?php

namespace App\Rules;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

/**
 * The single source of truth for password strength across the app.
 *
 * Before this existed every entry point carried its own `min:8`, which
 * meant a new endpoint could silently ship with weaker rules than the
 * rest — exactly the drift 21 CFR Part 11 §11.300 exists to prevent.
 *
 * Usage:
 *   'password' => ['required', 'string', new PasswordPolicy()]
 *
 * When changing an existing user's password, pass the user so the new
 * value can be checked against their password history:
 *   'password' => ['required', 'string', new PasswordPolicy($user)]
 */
class PasswordPolicy implements ValidationRule
{
    public function __construct(
        private ?object $user = null,
    ) {}

    /**
     * The underlying Laravel rule, built from config. Exposed so callers
     * that need a Password instance (rather than this wrapper) stay
     * consistent with the configured policy.
     */
    public static function base(): Password
    {
        $rule = Password::min(config('password_policy.min_length'));

        if (config('password_policy.require_mixed_case')) {
            $rule = $rule->mixedCase();
        }
        if (config('password_policy.require_numbers')) {
            $rule = $rule->numbers();
        }
        if (config('password_policy.require_symbols')) {
            $rule = $rule->symbols();
        }
        if (config('password_policy.check_breached')) {
            $rule = $rule->uncompromised();
        }

        return $rule;
    }

    /**
     * Human-readable requirements, for the UI checklist and for the
     * handoff documentation an auditor will ask for.
     */
    public static function describe(): array
    {
        $lines = ['At least ' . config('password_policy.min_length') . ' characters'];

        if (config('password_policy.require_mixed_case')) {
            $lines[] = 'Upper and lower case letters';
        }
        if (config('password_policy.require_numbers')) {
            $lines[] = 'At least one number';
        }
        if (config('password_policy.require_symbols')) {
            $lines[] = 'At least one symbol';
        }
        $lines[] = 'Not a common or easily guessed password';

        if (config('password_policy.check_breached')) {
            $lines[] = 'Not found in a known data breach';
        }
        if (config('password_policy.history_count') > 0) {
            $lines[] = 'Not one of your last ' . config('password_policy.history_count') . ' passwords';
        }

        return $lines;
    }

    public function validate(string $attribute, mixed $value, \Closure $fail): void
    {
        // Delegate length/character rules to Laravel so we inherit its
        // message wording rather than reimplementing it.
        $validator = validator(
            [$attribute => $value],
            [$attribute => self::base()],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->get($attribute) as $message) {
                $fail($message);
            }
            return;
        }

        // Local screening. Runs regardless of network state, so unlike
        // the remote breach lookup it cannot quietly pass everything.
        if ($reason = WeakPasswordCheck::reject($value, $this->contextTerms())) {
            $fail($reason);
            return;
        }

        if ($this->isReused($value)) {
            $fail('This password was used recently. Choose one you have not used before.');
        }
    }

    /**
     * Terms the password must not contain — the tenant's name and the
     * user's own identity. "Boeing2026!" passes every complexity rule and
     * is still a poor password for somebody at Boeing.
     */
    private function contextTerms(): array
    {
        $terms = [];

        if ($tenant = tenant()) {
            $terms[] = $tenant->name ?? null;
            $terms[] = $tenant->getTenantKey();
        }

        if ($this->user) {
            $terms[] = $this->user->name ?? null;
            if (! empty($this->user->email)) {
                $terms[] = explode('@', $this->user->email)[0];
            }
        }

        return array_values(array_filter($terms));
    }

    /**
     * Delegated to the user model so tenant users check the tenant
     * history table and central master admins check theirs, without this
     * rule needing to know which kind of user it was handed.
     */
    private function isReused(string $value): bool
    {
        if (! $this->user || ! method_exists($this->user, 'hasUsedPassword')) {
            return false;
        }

        return $this->user->hasUsedPassword($value);
    }
}
