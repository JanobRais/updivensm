<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class AckAlertRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // protected by can:admin middleware on route
    }

    public function rules(): array
    {
        return [
            'note'        => ['nullable', 'string', 'max:2000'],
            'until_clear' => ['boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'note.max'  => 'Note must not exceed 2000 characters.',
        ];
    }
}
