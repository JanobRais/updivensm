<?php

namespace UpdiveNSM\Authentication;

use App\Facades\UpdiveNSMConfig;
use UpdiveNSM\Interfaces\Authentication\Authorizer;

class LegacyAuth
{
    protected static $_instance;
    private static $configToClassMap = [
        'mysql' => \UpdiveNSM\Authentication\MysqlAuthorizer::class,
        'active_directory' => \UpdiveNSM\Authentication\ActiveDirectoryAuthorizer::class,
        'ldap' => \UpdiveNSM\Authentication\LdapAuthorizer::class,
        'radius' => \UpdiveNSM\Authentication\RadiusAuthorizer::class,
        'http-auth' => \UpdiveNSM\Authentication\HttpAuthAuthorizer::class,
        'ad-authorization' => \UpdiveNSM\Authentication\ADAuthorizationAuthorizer::class,
        'ldap-authorization' => \UpdiveNSM\Authentication\LdapAuthorizationAuthorizer::class,
        'sso' => \UpdiveNSM\Authentication\SSOAuthorizer::class,
    ];

    /**
     * Gets the authorizer based on the config
     *
     * @return Authorizer
     */
    public static function get()
    {
        if (! static::$_instance) {
            $class = self::getClass();
            static::$_instance = new $class;
        }

        return static::$_instance;
    }

    /**
     * The auth mechanism type.
     *
     * @return mixed
     */
    public static function getType()
    {
        return UpdiveNSMConfig::get('auth_mechanism');
    }

    /**
     * Get class for the given or current authentication type/mechanism
     *
     * @param  string  $type
     * @return string
     */
    public static function getClass($type = null)
    {
        if (is_null($type)) {
            $type = self::getType();
        }

        if (! isset(self::$configToClassMap[$type])) {
            throw new \RuntimeException($type . ' not found as auth_mechanism');
        }

        return self::$configToClassMap[$type];
    }

    /**
     * Destroy the existing instance and get a new one - required for tests.
     *
     * @return Authorizer
     */
    public static function reset()
    {
        static::$_instance = null;

        return static::get();
    }
}
