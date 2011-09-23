#!/usr/bin/python

# This script imports run data from build.mozilla.org into the local MySQL DB;
# specifically, into the "runs" table of the "tbpl" database.
# The data saved in the database is made accessible to TBPL clients via the
# php/get*.php scripts.
# TBPL clients don't request run data from build.mozilla.org directly for
# performance reasons. The JSON files are very large and include data from
# all branches, and most of that data isn't of interest to TBPL.

import urllib2
import calendar
import datetime
import gzip
import StringIO
import time
import re
import optparse
import pytz
import MySQLdb
import os
from string import Template

try:
   import simplejson as json
except ImportError:
   import json

log_path_try = Template("http://ftp.mozilla.org/pub/mozilla.org/$product/try-builds/$pusher-$rev/$branch_platform/$builder-build$buildnumber.txt.gz")
log_path_other = Template("http://ftp.mozilla.org/pub/mozilla.org/$product/tinderbox-builds/$branch_platform/$buildid/$builder-build$buildnumber.txt.gz")

verify_log_existence = False

try_pushers = {}

def try_pusher(rev):
    """Returns the pusher (an email address) of the try push with tip revision rev."""
    if rev not in try_pushers:
        try:
            io = urllib2.urlopen("http://hg.mozilla.org/try/json-pushes?changeset=" + rev)
        except urllib2.HTTPError:
            return None
        try:
            pushinfo = json.load(io).values()
        except ValueError:
            print "Warning: Invalid JSON returned by pushlog when asking for pusher of revision", rev
            return None
        io.close()
        if not pushinfo:
            return None
        try_pushers[rev] = pushinfo[0].get("user")
    return try_pushers[rev]

def buildidnumber(buildid):
    """Converts "20110509111413" to 1304964853, because that's the form used in log URLs."""
    if len(buildid) != 14:
        return None
    (Y, m, d) = (int(buildid[0:4]), int(buildid[4:6]), int(buildid[6:8]))
    (H, i, s) = (int(buildid[8:10]), int(buildid[10:12]), int(buildid[12:14]))
    tzinfo = pytz.timezone("America/Los_Angeles")
    return calendar.timegm(tzinfo.localize(datetime.datetime(Y, m, d, H, i, s)).utctimetuple())

def fix_revision(revision):
    if revision is None:
        return ""
    return revision[0:12]

def convert_status(status):
    # from http://hg.mozilla.org/build/buildbot/file/7348713b55c5/buildbot/status/builder.py#l23
    return {
        0: "success",
        1: "testfailed",
        2: "busted",
        3: "skipped",
        4: "exception",
        5: "retry",
    }.get(status, "unknown")

class Run(object):
    def __init__(self, build, builder, slave):
        self.id = build["id"]
        self._build = build
        self._props = build["properties"]
        self._builder = builder
        self._slave = slave
        self._rev = fix_revision(self._props["revision"])

    def get_info(self):
        tzinfo = pytz.timezone("America/Los_Angeles")
        info = {
            "buildername": self._props.get("buildername", self._builder), # builder ux_leopard_test-scroll doesn't have a props["buildername"]
            "slave": self._slave,
            "revision": self._rev,
            "starttime": datetime.datetime.fromtimestamp(self._build["starttime"], tzinfo),
            "endtime": datetime.datetime.fromtimestamp(self._build["endtime"], tzinfo),
            "result": convert_status(self._build["result"]),
            "branch": self._props["branch"],
        }
        log = self._log()
        if log:
            if verify_log_existence:
                self._verify_existence_of_log(log)
            info["log"] = log
        return info

    def _log(self):
        """Return the log URL for this run, or None if it can't be figured out."""
        data = {
          "builder": self._builder,
          "buildnumber": self._props["buildnumber"],
          "branch_platform": self._branchplatform(),
          "rev": self._rev,
          "product": self._props.get("product", "firefox"),
        }
        if self._props["branch"] == "try":
            data["pusher"] = try_pusher(self._rev)
            if not [v for v in data.values() if v is None or v == '']:
                return log_path_try.substitute(data)
        elif "buildid" in self._props:
            data["buildid"] = buildidnumber(self._props["buildid"])
            if not [v for v in data.values() if v is None or v == '']:
                return log_path_other.substitute(data)
        return None

    def _branchplatform(self):
        """Constructs the directory name that's based on branch and platform.
        The rules for this have been reverse-engineered."""
        platform = self._props.get("stage_platform", self._props.get("platform"))
        if not platform: # probably because it's a nightly l10n build (what is that?)
            return None
        dir = self._props["branch"] + "-" + platform
        # inconsistency: sometimes "-debug" is included, sometimes it's not
        if "-debug" in self._builder and not dir.endswith("-debug"):
            dir += "-debug"
        # another inconsistency: android logs are in special directories
        dir = dir.replace("mobile-browser-android", "android-r7")
        if self._props["branch"] in ["mozilla-1.9.1", "mozilla-1.9.2"] and "-unittest" in self._builder:
            dir += "-unittest"
        return dir

    def _verify_existence_of_log(self, logurl):
        try:
            io = urllib2.urlopen(logurl)
        except urllib2.HTTPError, ex:
            print "Log not available:"
            print self.id, logurl

def json_from_gz_url(url):
    """Returns the JSON parsed object found at url."""
    try:
        io = urllib2.urlopen(url)
    except urllib2.HTTPError, ex:
        if ex.code == 404:
            # It's ok for the file to be missing.
            return
        raise
    # thanks to http://diveintopython.org/http_web_services/gzip_compression.html
    sio = StringIO.StringIO(io.read())
    io.close()
    gz = gzip.GzipFile(fileobj=sio)
    j = json.load(gz, encoding="UTF-8")
    gz.close()
    return j

def get_runs(j):
    for build in j["builds"]:
        p = build["properties"]
        # some builds (which?) have no revision field, some (like fuzzer)
        # have null in the JSON, which turns into None in python, and some
        # (like addontester) have "None" in the JSON.
        if not p.get("revision") or not p.get("branch"):
            # Builds with no revision/branch aren't of interest.
            continue
        if build["result"] is None:
            # Ignore builds with unspecified result for now.
            continue
        builder = j["builders"][str(build["builder_id"])]["name"]
        slave_id = str(build["slave_id"])
        slave = j["slaves"].get(slave_id)
        if slave is None:
            print "Warning: The slave", slave_id, "for build", build["id"], "doesn't exist in the slave list."
            continue
        yield Run(build, builder, slave)

def get_builders(j):
    for build in j["builds"]:
        builder = j["builders"][str(build["builder_id"])]
        props = build["properties"]
        if "buildername" not in builder and "buildername" in props:
            builder["buildername"] = props["buildername"]
    for builder in j["builders"].values():
        yield builder["name"], builder["category"], builder.get("buildername")

def add_run_to_db(run, db, overwrite):
    cursor = db.cursor()
    cursor.execute("SELECT count(*) FROM runs WHERE buildbot_id = %s", run.id)
    count = cursor.fetchone()[0]
    if not overwrite and count > 0:
        return False

    params = [run.id]
    for key in ('buildername', 'slave', 'revision', 'starttime', 'endtime', 
                'result', 'branch', 'log'):
        params.append(run.get_info().get(key))

    cursor.execute("""INSERT INTO runs (buildbot_id, buildername, slave, revision, 
                                        starttime, endtime, result, branch, log)
                      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                      ON DUPLICATE KEY UPDATE 
                        buildbot_id=%s, buildername=%s, slave=%s, revision=%s, 
                        starttime=%s, endtime=%s, result=%s, branch=%s, 
                        log=%s""", params * 2)
    return True

def add_builder_to_db(builder, db):
    (name, branch, buildername) = builder
    cursor = db.cursor()
    cursor.execute("SELECT count(*) FROM builders WHERE name = %s", name)
    count = cursor.fetchone()[0]
    if count == 0:
        params = (name, branch, buildername)
        cursor.execute("""INSERT INTO builders (name, branch, buildername)
                          VALUES (%s, %s, %s)""", params)

        builder_id = cursor.lastrowid

        cursor.execute("""INSERT INTO builders_history (builder_id, action)
                          VALUES (%s, %s)""", (builder_id, "insert"))
        return True
    elif buildername != None:
        cursor.execute("""UPDATE builders
                           SET buildername = %s, branch = %s
                           WHERE name = %s""",
                        (buildername, branch, name))

        if cursor.rowcount == 0:
            return False
        else:
            return True
    return False

def add_to_db(url, db, overwrite):
    print "Fetching", url, "..."
    j = json_from_gz_url(url)
    if j is None:
        return

    print "Traversing runs and inserting into database..."
    count = sum([add_run_to_db(run, db, overwrite) for run in get_runs(j)])
    if overwrite:
        print "Inserted or updated", count, "run entries."
    else:
        print "Inserted", count, "new run entries."

    print "Traversing builders and updating database..."
    count = sum([add_builder_to_db(builder, db) for builder in get_builders(j)])
    print "Updated", count, "builders."

def do_date(date, db, overwrite):
    add_to_db(date.strftime("http://build.mozilla.org/builds/builds-%Y-%m-%d.js.gz"), db, overwrite)

def do_recent(db, overwrite):
    add_to_db("http://build.mozilla.org/builds/builds-4hr.js.gz", db, overwrite)

usage = """
%prog [options]

Import run information from JSON files on build.mozilla.org into the local MySQL database."""

def main():
    parser = optparse.OptionParser(usage=usage)
    parser.add_option("-d","--days",help="number of days to import",type=int,default=0)
    parser.add_option("-f","--force",help="force overwrite",dest="overwrite",action="store_true",default=False)
    parser.add_option("-u","--username",help="mysql username",type=str,default="tbpl")
    parser.add_option("-p","--password",help="mysql password",type=str,default=None)
    parser.add_option("-H","--hostname",help="mysql hostname",type=str,default="localhost")
    parser.add_option("-n","--dbname",help="mysql database name",type=str,default="tbpl")
    (options,args) = parser.parse_args()

    password = ""
    if options.password is None:
        env_pass = os.getenv("MYSQL_PASSWORD")
        if env_pass != None:
            password = env_pass
    else:
        password = options.password
        

    # Import recent runs.
    db = MySQLdb.connect(
        host = options.hostname,
        user = options.username,
        passwd = password,
        db = options.dbname)
    do_recent(db, options.overwrite)

    # Import options.days days of history.
    tzinfo = pytz.timezone("America/Los_Angeles")
    today = datetime.datetime.now(tzinfo)
    for i in range(options.days):
        do_date(today - datetime.timedelta(i), db, options.overwrite)
    db.commit()

if __name__ == "__main__":
   main()
