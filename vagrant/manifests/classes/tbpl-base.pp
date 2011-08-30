class tbpl-base {

    service {
        apache2:
            enable => true,
            ensure => running,
            hasstatus => true,
            require => [Package[apache2], Exec[enable-mod-php]];
    }

    file {
	'/etc/hosts':
	    owner => root,
	    group => root,
	    mode => 644,
	    ensure => present,
	    source => "/vagrant/files/hosts";

        '/var/www/tbpl':
            owner => tbpl,
            group => tbpl,
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
            source => "/vagrant/files/etc_apache2_sites-available/tbpl";

        '/home/tbpl':
	    require => User[tbpl],
            owner => tbpl,
            group => tbpl,
            mode  => 775,
	    recurse=> false,
	    ensure => directory;

        '/home/tbpl/dev':
	    require => File['/home/tbpl'],
            owner => tbpl,
            group => tbpl,
            mode  => 775,
	    recurse=> false,
	    ensure => directory;

       '/etc/cron.d/tbpl':
           owner => root,
           group => root,
           mode => 600,
           require => Exec['mysql-setup'],
           ensure => present,
           source => "/vagrant/files/etc_crond/tbpl";
    }

    package {
        'apache2':
            ensure => latest,
            require => [Exec['apt-get-update']];

        'libapache2-mod-php5':
            require => Package[apache2],
            ensure => 'present';

        'git-core':
            ensure => 'present';

        'rsync':
            ensure => 'present';

        'build-essential':
            ensure => 'present';

        'mysql-server':
            ensure => 'present';

        'python-mysqldb':
            ensure => 'present';

        'python-tz':
            ensure => 'present';

        'curl':
            ensure => 'present';

        'vim':
            ensure => 'present';

        'php5-mysql':
            ensure => 'present';
    }

    user { 'tbpl':
	ensure => 'present',
	uid => '10000',
	shell => '/bin/bash',
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
            creates => '/etc/apache2/mods-enabled/php.load',
            require => File['tbpl-vhost'];

        '/usr/bin/git clone git://github.com/rhelmer/tbpl.git':
            alias => 'git-clone',
            user => 'tbpl',
            cwd => '/home/tbpl/dev/',
            creates => '/home/tbpl/dev/tbpl',
            require => [Package['git-core'], File['/home/tbpl/dev']];

        '/usr/bin/git pull':
            alias => 'git-pull',
            user => 'tbpl',
            cwd => '/home/tbpl/dev/tbpl',
            require => Exec['git-clone'];

        '/usr/bin/rsync -av --exclude=".git" /home/tbpl/dev/tbpl/ /var/www/tbpl/':
            alias => 'tbpl-install',
            timeout => '3600',
            require => [User[tbpl], Exec[git-pull], Package[rsync], File['/var/www/tbpl']],
            user => 'tbpl';

        '/bin/echo "drop database if exists tbpl; create database tbpl; grant all on tbpl.* to tbpl identified by \'test\';" | /usr/bin/mysql && /bin/cat /home/tbpl/dev/tbpl/dataimport/schema.sql  | /usr/bin/mysql tbpl':
            alias => 'mysql-setup',
            require => [Package['mysql-server'], Exec['tbpl-install']]
    }
}
