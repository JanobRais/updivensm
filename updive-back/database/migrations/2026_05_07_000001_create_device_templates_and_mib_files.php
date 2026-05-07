<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('os_name')->unique();
            $table->string('vendor')->default('');
            $table->string('display_name')->default('');
            $table->enum('type', ['network', 'server', 'camera', 'printer', 'ups', 'other'])->default('network');
            $table->string('icon')->default('');
            $table->text('description')->nullable();
            $table->json('sys_object_ids')->nullable();
            $table->json('sys_descr_patterns')->nullable();
            $table->json('mib_dirs')->nullable();
            $table->json('modules')->nullable();
            $table->json('custom_oids')->nullable();
            $table->boolean('builtin')->default(false);
            $table->timestamps();
        });

        Schema::create('mib_files', function (Blueprint $table) {
            $table->id();
            $table->string('filename');
            $table->string('vendor')->default('');
            $table->string('mib_name')->default('');
            $table->longText('content');
            $table->unsignedInteger('size')->default(0);
            $table->boolean('valid')->default(false);
            $table->text('parse_error')->nullable();
            $table->timestamps();

            $table->unique(['vendor', 'filename']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mib_files');
        Schema::dropIfExists('device_templates');
    }
};
