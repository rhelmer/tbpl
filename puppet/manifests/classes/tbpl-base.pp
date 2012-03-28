class tbpl-base {

    service {
        apache2:
            enable => true,
            ensure => running,
            hasstatus => true,
            require => [Package[apache2], Exec[enable-mod-php]];
    }

    file {
        '/var/www/tbpl':
            mode  => 755,
            recurse => false,
            require => Package[apache2],
            ensure => directory;

        '/etc/apache2/sites-available/tbpl':
            require => Package[apache2],
            alias => 'tbpl-vhost',
            owner => root,
            group => root,
            mode  => 644,
            ensure => present,
            notify => Service[apache2],
            source => "/var/www/tbpl/puppet/files/etc_apache2_sites-available/tbpl";

       '/etc/cron.d/tbpl':
           owner => root,
           group => root,
           mode => 600,
           require => Exec['mysql-setup'],
           ensure => present,
           source => "/var/www/tbpl/puppet/files/etc_crond/tbpl";
    }

    package { ['apache2', 'build-essential', 'mysql-server', 'python-mysqldb',
               'python-tz', 'curl', 'php5-mysql', 'php5-cli']:
        ensure => latest,
        require => Exec['apt-get-update'];
    }

    package { 'libapache2-mod-php5':
        require => [Exec['apt-get-update'], Package[apache2]],
        ensure => latest;
    }

    user { 'tbpl':
        ensure => 'present',
        uid => '10000',
        shell => '/bin/bash',
        home => '/var/www/tbpl',
        managehome => true;
    }

    group { 'puppet':
        ensure => 'present',
    }

    exec {
        '/usr/bin/apt-get update':
            alias => 'apt-get-update';

        '/usr/sbin/a2ensite tbpl':
            alias => 'enable-tbpl-vhost',
            creates => '/etc/apache2/sites-enabled/tbpl',
            require => File['tbpl-vhost'];

        '/usr/sbin/a2enmod php5':
            alias => 'enable-mod-php',
            creates => '/etc/apache2/mods-enabled/php5.load',
            require => File['tbpl-vhost'];

        '/bin/cp -v /var/www/tbpl/php/config.php.example /var/www/tbpl/php/config.php':
            alias => 'tbpl-configure-php',
            creates => '/var/www/tbpl/php/config.php',
            require => User[tbpl],
            user => 'tbpl';

        '/bin/echo "create database if not exists tbpl; grant all on tbpl.* to tbpl identified by \'tbpl\';" | /usr/bin/mysql && /bin/cat /var/www/tbpl/schema.sql  | /usr/bin/mysql tbpl':
            unless => '/bin/echo "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = \'tbpl\'"  | mysql | grep tbpl',
            alias => 'mysql-setup',
            require => Package['mysql-server'],
    }
}
