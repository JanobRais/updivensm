<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('updive_metrics', function (Blueprint $table) {
            // raw=5min snapshot, 1h=hourly aggregate, 1d=daily aggregate
            $table->enum('resolution', ['raw', '1h', '1d'])->default('raw')->after('collected_at');
            $table->index(['device_id', 'metric_type', 'resolution', 'collected_at'], 'idx_metrics_lookup');
        });
    }

    public function down(): void
    {
        Schema::table('updive_metrics', function (Blueprint $table) {
            $table->dropIndex('idx_metrics_lookup');
            $table->dropColumn('resolution');
        });
    }
};
