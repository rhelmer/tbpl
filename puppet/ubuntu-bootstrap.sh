#!/bin/bash
#
# Quick bootstrap script for an Ubuntu Lucid host
#
# This allows you to bootstrap any Lucid box (VM, physical hardware, etc)
# using Puppet and automatically install a full Socorro environment on it.
#

apt-get install git-core puppet

GIT_REPO_URL="git://github.com/mozilla/tbpl.git"

# Clone the project from github
useradd tbpl
mkdir /var/www/tbpl
chown tbpl:tbpl /var/www/tbpl
su - tbpl
cd /var/www/
git clone $GIT_REPO_URL tbpl
exit

# Let puppet take it from here...
puppet /var/www/tbpl/puppet/manifests/*.pp
