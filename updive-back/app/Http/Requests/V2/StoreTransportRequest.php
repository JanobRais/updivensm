<?php

namespace App\Http\Requests\V2;

use Illuminate\Foundation\Http\FormRequest;

class StoreTransportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transport_name'   => ['required', 'string', 'max:30'],
            'transport_type'   => ['required', 'string', 'max:20'],
            'is_default'       => ['boolean'],
            'transport_config' => ['nullable', 'array'],
        ];
    }
}
