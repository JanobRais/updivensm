<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class StoreAlertRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'               => ['required', 'string', 'max:255', 'unique:alert_rules,name'],
            'severity'           => ['required', 'string', 'in:ok,warning,critical'],
            'builder'            => ['nullable', 'array'],
            'query'              => ['nullable', 'string'],
            'disabled'           => ['boolean'],
            'notes'              => ['nullable', 'string', 'max:10000'],
            'proc'               => ['nullable', 'string', 'max:80'],
            'invert_map'         => ['boolean'],
            'alert_operation_id' => ['nullable', 'integer', 'exists:alert_operations,id'],
            'confirm_count'      => ['nullable', 'integer', 'min:1', 'max:10'],
            'delay_min'          => ['nullable', 'integer', 'min:0', 'max:1440'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique'   => 'An alert rule with this name already exists.',
            'severity.in'   => 'severity must be ok, warning, or critical.',
        ];
    }
}
