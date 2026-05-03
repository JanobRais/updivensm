<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAlertRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = (int) $this->route('id');

        return [
            'name'               => ['sometimes', 'string', 'max:255', Rule::unique('alert_rules', 'name')->ignore($id)],
            'severity'           => ['sometimes', 'string', 'in:ok,warning,critical'],
            'builder'            => ['nullable', 'array'],
            'query'              => ['nullable', 'string'],
            'disabled'           => ['boolean'],
            'notes'              => ['nullable', 'string', 'max:10000'],
            'proc'               => ['nullable', 'string', 'max:80'],
            'invert_map'         => ['boolean'],
            'alert_operation_id' => ['nullable', 'integer', 'exists:alert_operations,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique'  => 'Another alert rule already uses this name.',
            'severity.in'  => 'severity must be ok, warning, or critical.',
        ];
    }
}
