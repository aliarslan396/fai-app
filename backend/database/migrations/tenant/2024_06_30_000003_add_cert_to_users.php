<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inspector certification info — appears on auto-generated digital
 * stamp at sign time. Per AS9102 spec the stamp must show:
 *   - inspector name (from users.name)
 *   - cert number
 *   - role / title
 *   - sign date (computed at sign time)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('cert_number', 50)->nullable()->after('email');
            $table->string('signature_role_title', 100)->nullable()->after('cert_number');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['cert_number', 'signature_role_title']);
        });
    }
};
