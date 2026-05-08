<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('anomaly_baselines', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('device_id');
            $table->string('metric_type', 30);
            $table->unsignedInteger('object_id');
            $table->tinyInteger('hour_of_week'); // 0–167 (Mon 0:00 … Sun 23:00)
            $table->double('avg_value')->default(0);
            $table->double('stddev')->default(0);
            $table->unsignedInteger('sample_count')->default(0);
            $table->timestamp('updated_at')->useCurrent();

            $table->unique(['device_id', 'metric_type', 'object_id', 'hour_of_week'], 'uq_baseline');
            $table->index(['device_id', 'metric_type'], 'idx_bl_dev_type');
        });

        Schema::create('metric_forecasts', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('device_id');
            $table->unsignedInteger('object_id');
            $table->string('object_name', 100)->nullable();
            $table->string('metric_type', 30);
            $table->double('current_value')->default(0);
            $table->double('limit_value')->nullable();
            $table->double('slope_per_hour')->default(0);  // bytes/s per hour
            $table->double('r_squared')->default(0);       // regression confidence
            $table->float('days_until_limit')->nullable(); // null = not approaching
            $table->timestamp('updated_at')->useCurrent();

            $table->unique(['device_id', 'object_id', 'metric_type'], 'uq_forecast');
            $table->index('days_until_limit');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metric_forecasts');
        Schema::dropIfExists('anomaly_baselines');
    }
};
