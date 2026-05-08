<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('port_state_changes', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('port_id')->index();
            $table->unsignedInteger('device_id')->index();
            $table->string('from_state', 16);
            $table->string('to_state',   16);
            $table->timestamp('changed_at')->useCurrent();

            $table->index(['port_id', 'changed_at'], 'idx_port_time');
        });

        Schema::table('ports', function (Blueprint $table) {
            // 1 = port is currently flapping (rapid up/down)
            $table->tinyInteger('flapping')->default(0)->after('ifAlias');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('port_state_changes');

        Schema::table('ports', function (Blueprint $table) {
            $table->dropColumn('flapping');
        });
    }
};
