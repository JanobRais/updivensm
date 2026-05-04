<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('updive_metrics', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('device_id');
            $table->string('metric_type', 50);   // port_in, port_out, cpu, mem, uptime
            $table->unsignedInteger('object_id')->nullable();  // port_id / processor_id / mempool_id
            $table->string('object_name', 128)->nullable();    // ifName / processor_descr / mempool_descr
            $table->double('value');
            $table->string('unit', 20)->nullable();            // Bps, %, s
            $table->timestamp('collected_at')->useCurrent();

            $table->index(['device_id', 'metric_type', 'collected_at'], 'idx_dev_type_time');
            $table->index(['object_id', 'metric_type', 'collected_at'], 'idx_obj_type_time');
            $table->index('collected_at', 'idx_collected_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('updive_metrics');
    }
};
