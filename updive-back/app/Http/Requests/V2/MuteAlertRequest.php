<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class MuteAlertRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'note'        => ['nullable', 'string', 'max:2000'],
            'muted_until' => ['nullable', 'date', 'after:now'],
        ];
    }

    public function messages(): array
    {
        return [
            'muted_until.after' => 'muted_until must be a future date/time.',
            'muted_until.date'  => 'muted_until must be a valid ISO date/time.',
        ];
    }
}
