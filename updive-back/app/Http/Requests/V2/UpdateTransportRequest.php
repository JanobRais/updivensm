<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTransportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transport_name'   => ['sometimes', 'string', 'max:30'],
            'is_default'       => ['boolean'],
            'transport_config' => ['nullable', 'array'],
        ];
    }
}
