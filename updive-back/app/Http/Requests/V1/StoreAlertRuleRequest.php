<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates incoming data for POST /api/v1/alert-rules.
 *
 * Field names mirror the frontend form; the controller maps them
 * to DB column names before persisting.
 *
 * Frontend field  →  DB column
 * ─────────────────────────────
 * rule_name       →  name
 * start_disabled  →  disabled
 * invert_device_map → invert_map
 * severity "info" →  "ok"  (closest DB equivalent)
 */
class StoreAlertRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Name must be unique across all alert rules
            'rule_name'         => ['required', 'string', 'max:100',
                                    Rule::unique('alert_rules', 'name')],

            // DB ENUM is ok|warning|critical; we accept "info" as alias for "ok"
            'severity'          => ['required', 'string',
                                    Rule::in(['ok', 'warning', 'critical', 'info'])],

            // Raw SQL condition — sanitised in controller, not blank
            'query'             => ['required', 'string', 'max:3000'],

            'notes'             => ['nullable', 'string', 'max:2000'],

            'start_disabled'    => ['boolean'],

            'invert_device_map' => ['boolean'],

            // Optional: attach to an existing notification operation
            'alert_operation_id' => ['nullable', 'integer',
                                     Rule::exists('alert_operations', 'id')],

            'confirm_count'      => ['nullable', 'integer', 'min:1', 'max:10'],
            'delay_min'          => ['nullable', 'integer', 'min:0', 'max:1440'],
        ];
    }

    public function messages(): array
    {
        return [
            'rule_name.required' => 'Rule name is required.',
            'rule_name.unique'   => 'An alert rule with this name already exists.',
            'rule_name.max'      => 'Rule name may not exceed 100 characters.',
            'severity.in'        => 'Severity must be one of: ok, warning, critical, info.',
            'query.required'     => 'Query condition is required.',
            'query.max'          => 'Query may not exceed 3000 characters.',
        ];
    }

    /**
     * Normalise booleans so "1"/"0"/true/false all work.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'start_disabled'    => $this->boolean('start_disabled', false),
            'invert_device_map' => $this->boolean('invert_device_map', false),
        ]);
    }
}
