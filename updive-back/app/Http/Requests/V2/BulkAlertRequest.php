<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class BulkAlertRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'ids'         => ['required', 'array', 'min:1', 'max:500'],
            'ids.*'       => ['required', 'integer', 'min:1'],
            'note'        => ['nullable', 'string', 'max:2000'],
            'until_clear' => ['boolean'],
            'muted_until' => ['nullable', 'date', 'after:now'],
        ];
    }

    public function messages(): array
    {
        return [
            'ids.required'    => 'ids[] array of alert IDs is required.',
            'ids.max'         => 'Maximum 500 alerts per bulk operation.',
            'ids.*.integer'   => 'Each id must be an integer.',
            'muted_until.after' => 'muted_until must be a future date/time.',
        ];
    }
}
