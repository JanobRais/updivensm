<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alert_rules', function (Blueprint $table) {
            // How many consecutive positive evaluations before firing
            $table->unsignedTinyInteger('confirm_count')->default(1)->after('proc');
            // Minutes to wait (since first positive) before firing
            $table->unsignedSmallInteger('delay_min')->default(0)->after('confirm_count');
        });

        Schema::table('alerts', function (Blueprint $table) {
            // Consecutive positive poll count (state = -1 = pending)
            $table->unsignedSmallInteger('pending_count')->default(0)->after('info');
            // When the condition first became true (pending start time)
            $table->timestamp('last_change')->nullable()->after('pending_count');
        });
    }

    public function down(): void
    {
        Schema::table('alert_rules', function (Blueprint $table) {
            $table->dropColumn(['confirm_count', 'delay_min']);
        });

        Schema::table('alerts', function (Blueprint $table) {
            $table->dropColumn(['pending_count', 'last_change']);
        });
    }
};
