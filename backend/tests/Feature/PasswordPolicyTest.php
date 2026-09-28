<?php

namespace Tests\Feature;

use App\Rules\WeakPasswordCheck;
use Illuminate\Validation\Rules\Password;
use Tests\TestCase;

/**
 * Password policy guards.
 *
 * The strength rules and the local weak-password screen are tested
 * without touching a database — both are pure functions of config and
 * input. History and rotation need tenant context and are covered by the
 * manual verification recorded in the commit message.
 *
 * The case that motivated WeakPasswordCheck: Laravel's uncompromised()
 * calls HaveIBeenPwned and FAILS OPEN when the network is unavailable.
 * These containers have no egress, so "Password123!" was accepted while
 * the policy claimed breach checking was active.
 */
class PasswordPolicyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('password_policy.min_length', 12);
        config()->set('password_policy.require_mixed_case', true);
        config()->set('password_policy.require_numbers', true);
        config()->set('password_policy.require_symbols', true);
        config()->set('password_policy.check_breached', false);
    }

    private function strengthFails(string $password): bool
    {
        return validator(
            ['password' => $password],
            ['password' => [Password::min(12)->mixedCase()->numbers()->symbols()]],
        )->fails();
    }

    /** @dataProvider weakPasswords */
    public function test_it_rejects_weak_passwords(string $password, string $why): void
    {
        $rejected = $this->strengthFails($password)
            || WeakPasswordCheck::reject($password) !== null;

        $this->assertTrue($rejected, "Expected [{$password}] to be rejected — {$why}");
    }

    public static function weakPasswords(): array
    {
        return [
            'too short' => ['Ab1!xyz', 'under 12 characters'],
            'old 8-char minimum' => ['Passw0rd!', 'the previous min:8 rule allowed this'],
            'no symbol' => ['LongEnoughPass1', 'missing symbol'],
            'no number' => ['LongEnoughPass!', 'missing number'],
            'no uppercase' => ['longenoughpass1!', 'missing uppercase'],

            // These satisfy every complexity rule and were accepted until
            // local screening was added.
            'common word + year' => ['Password123!', 'password is the most breached string there is'],
            'leetspeak common' => ['P@ssw0rd2026', 'leetspeak must not evade the check'],
            'welcome + year' => ['Welcome2026!', 'trailing year must not hide the stem'],
            'keyboard walk' => ['Qwerty123456!', 'keyboard walk'],
            'letmein' => ['Letmein12345!', 'common phrase'],
            'repeated character' => ['Aaaaaaaaaaa1!', 'no entropy'],
        ];
    }

    /** @dataProvider strongPasswords */
    public function test_it_accepts_strong_passwords(string $password): void
    {
        $this->assertFalse($this->strengthFails($password), "[{$password}] failed strength rules");
        $this->assertNull(WeakPasswordCheck::reject($password), "[{$password}] was wrongly flagged as weak");
    }

    public static function strongPasswords(): array
    {
        return [
            ['Kestrel-Vault-42-Quay'],
            ['Tr0ubad0ur&Anvil'],
            ['Copper#Lantern7Bridge'],
            ['Nimbus!Furnace93Deck'],
        ];
    }

    /**
     * A password containing the company or the user's own identity meets
     * every complexity rule and is still a poor choice.
     */
    public function test_it_rejects_passwords_containing_context_terms(): void
    {
        $terms = ['Boeing Aerospace', 'QA Manager', 'qa.manager@admi.test'];

        foreach (['Boeing2026!Xy', 'QaManager2026!', 'Aerospace#2026a'] as $password) {
            $this->assertNotNull(
                WeakPasswordCheck::reject($password, $terms),
                "Expected [{$password}] to be rejected for containing a context term",
            );
        }
    }

    /** A long passphrase that merely contains a common word is fine. */
    public function test_it_does_not_over_reject_long_passphrases(): void
    {
        $this->assertNull(WeakPasswordCheck::reject('Quiet#Master7Falcon9Ridge'));
    }

    /**
     * check_breached must stay off by default. Laravel's uncompromised()
     * fails open, so enabling it on a host without egress produces a
     * control that reports success while accepting anything.
     */
    public function test_breach_check_is_disabled_by_default(): void
    {
        $fresh = require base_path('config/password_policy.php');

        $this->assertFalse(
            $fresh['check_breached'],
            'check_breached must default to false — uncompromised() fails open without network egress',
        );
    }
}
