<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Config extends Model
{
    protected $table = 'config';
    protected $primaryKey = 'config_id';
    public $timestamps = false;

    protected $fillable = [
        'config_name',
        'config_value',
        'config_default',
        'config_descr',
        'config_group',
        'config_group_order',
        'config_sub_group',
        'config_sub_group_order',
        'config_hidden',
        'config_disabled',
    ];

    /**
     * Scope: select a key and all its dot-notation children.
     * e.g. Config::withChildren('alert') matches 'alert', 'alert.foo', 'alert.foo.bar'
     *
     * @param  Builder  $query
     * @param  string   $key
     * @return Builder
     */
    public function scopeWithChildren(Builder $query, string $key): Builder
    {
        return $query->where('config_name', $key)
                     ->orWhere('config_name', 'like', $key . '.%');
    }
}
