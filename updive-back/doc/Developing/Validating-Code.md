#### Validating Code

As part of the pull request process with GitHub we run some automated
build tests to ensure that  the code is error free, standards compliant
and our test suite builds successfully.

Rather than submit a pull request and wait for the results, you can
run these checks yourself to ensure  a more seamless merge.

> All of these commands should be run from within the UpdiveNSM
> directory and can be run as the UpdiveNSM user  unless otherwise noted.

Install composer (you can skip this if composer is already installed).

`curl -sS https://getcomposer.org/installer | php`

Composer will now be installed into /opt/UpdiveNSM/composer.phar.

Now install the dependencies we require:

`./composer.phar install`

Once composer is installed you can now run the code validation script:

`./lnms dev:check`

If you see `Tests ok, submit away :)` then all is well. If you see
other output then it should contain  what you need to resolve the issues and re-test.

#### Git Hooks

Git has a hook system which you can use to trigger checks at various
stages. Utilising the `./lnms dev:check`  you can make this part of your
commit process.

Add `./lnms dev:check` to your `.git/hooks/pre-commit`:

    echo "/opt/UpdiveNSM/lnms dev:check" >> /opt/UpdiveNSM/.git/hooks/pre-commit
    chmod +x /opt/UpdiveNSM/.git/hooks/pre-commit
