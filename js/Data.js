/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

function Data(treeName, noIgnore, config) {
  this._bugcache = {};
  this._treeName = treeName;
  this._noIgnore = noIgnore;
  this._config = config;
  this._mostRecentPush = null;
  this._pushes = {};
  this._machines = {};
  this._finishedResultsWithPush = {};
  this._finishedResultsWithoutPush = {};
  this._pendingJobs = {};
  this._runningJobs = {};
  this._hiddenBuilders = null;
  this._hiddenBuildersAreLoading = false;
  this._afterLoadedHiddenBuildersCallback = null;
};

Data.prototype = {
  getBug: function Data_getBug(id, callback) {
    if (id in this._bugcache)
      return callback(this._bugcache[id]);
    var self = this;
    $.getJSON("https://api-dev.bugzilla.mozilla.org/latest/bug?id=" + id, function (data) {
      if (data.bugs) {
        self._bugcache[id] = data.bugs.length ?
          {status: data.bugs[0].status, summary: data.bugs[0].summary} : 
          {status: "UNKNOWN", summary: "The bug is inaccessible or doesn’t exist."};
        callback(self._bugcache[id]);
      }
    });
  },

  getLoadedPushRange: function Data_getLoadedPushRange() {
    if (!this._mostRecentPush)
      return null;
    return {
      startID: this._mostRecentPush.id - Object.values(this._pushes).length,
      endID: this._mostRecentPush.id,
    };
  },

  loadPushRange: function Data_loadPushRange(pushRange, loadPendingRunning, loadTracker, updatedPushCallback, infraStatsCallback, initialPushlogLoadCallback) {
    var self = this;
    var pushlogRequestParams = this._getPushlogParamsForRange(pushRange);
    pushlogRequestParams.forEach(function (params) {
      self._loadPushlogData(params, loadTracker, updatedPushCallback, initialPushlogLoadCallback);
    });
    if (loadPendingRunning)
      this._loadPendingAndRunningBuilds(loadTracker, updatedPushCallback, infraStatsCallback);
  },

  refresh: function Data_refresh(loadTracker, trackTip, updatedPushCallback, infraStatsCallback) {
    if (trackTip) {
      // Passing only startID means "Load all pushes with push.id > startID".
      this._loadPushlogData({ startID: this._mostRecentPush.id }, loadTracker, updatedPushCallback);
    }
    this._loadTinderboxDataForPushes(this._pushes, loadTracker, updatedPushCallback);
    this._loadPendingAndRunningBuilds(loadTracker, updatedPushCallback, infraStatsCallback);
  },

  _getPushlogParamsForRange: function Data__getPushlogParamsForRange(pushRange) {
    // This function determines what to load from pushlog so that our total
    // loaded range matches the requested pushRange.
    // pushRange is guaranteed to be a superset of this.getLoadedPushRange().
    // We never make our window smaller.

    if ("startID" in pushRange && "endID" in pushRange) {
      // The startID/endID mode is our default mode of operation. We start
      // using it as soon as we've got our first result from pushlog, since
      // only then do we know about push IDs.
      // A pushRange with startID and endID describes the range of all pushes
      // with startID < push.id <= endID. Note: startID is NOT included.
      // So the number of pushes in the range is endID - startID.
      // endID is always > startID, push ranges in the form startID/endID
      // are never empty.

      var params = [];
      var currentRange = this.getLoadedPushRange();

      // Above loaded range:
      if (pushRange.endID > currentRange.endID) {
        params.push({
          startID: currentRange.endID,
          endID: pushRange.endID,
        });
      }

      // Below loaded range:
      if (pushRange.startID < currentRange.startID) {
        params.push({
          startID: pushRange.startID,
          endID: currentRange.startID,
        });
      }

      return params;
    }

    // We're not in startID/endID mode yet. This is the initial request.
    if ("rev" in pushRange)
      return [{ changeset: pushRange.rev }];
    if ("fromchange" in pushRange && "tochange" in pushRange)
      return [{ fromchange: pushRange.fromchange, tochange: pushRange.tochange }];
    if ("startdate" in pushRange && "enddate" in pushRange)
      return [{ startdate: pushRange.startdate, enddate: pushRange.enddate }];
    // "maxhours" does not directly map to pushlog parameters and is only
    // used internally in _restrictPushesToRequestedRange.
    if ("maxhours" in pushRange)
      return [{ maxhours: pushRange.maxhours }];
    return [{}];
  },

  _restrictPushesToRequestedRange: function Data__restrictPushesToRequestedRange(pushes, requestParams) {
    if (!("maxhours" in requestParams))
      return;

    var maxHours = requestParams.maxhours;

    // First pass: Find the date of the most recent push.
    var mostRecentPushDate = null;
    for (var toprev in pushes) {
      var push = pushes[toprev];
      if (!mostRecentPushDate || mostRecentPushDate < push.date)
        mostRecentPushDate = push.date;
    }

    // Second pass: Drop all pushes older than mostRecentPushDate - maxHours hours.
    for (var toprev in pushes) {
      var push = pushes[toprev];
      if (push.date < mostRecentPushDate - maxHours * 60 * 60 * 1000)
        delete pushes[toprev];
    }
  },

  _loadPushlogData: function Data__loadPushlogData(params, loadTracker, updatedPushCallback, initialPushlogLoadCallback) {
    var self = this;
    var tinderboxLoadEstimation = loadTracker.addMorePotentialLoads(30);
    Config.pushlogDataLoader.load(
      Config.treeInfo[this._treeName].primaryRepo,
      params,
      loadTracker,
      function pushlogLoadCallback(loadedPushes) {
        self._restrictPushesToRequestedRange(loadedPushes, params);
        var updatedPushes = {};
        self._addPushes(loadedPushes, updatedPushes);
        self._addPendingOrRunningResultsToPushes("pending", updatedPushes);
        self._addPendingOrRunningResultsToPushes("running", updatedPushes);
        self._addFinishedResultsToPushes(self._finishedResultsWithoutPush, updatedPushes, updatedPushes);
        self._notifyUpdatedPushes(updatedPushes, updatedPushCallback);
        if (initialPushlogLoadCallback)
          initialPushlogLoadCallback();
        self._loadTinderboxDataForPushes(updatedPushes, loadTracker, updatedPushCallback);
        tinderboxLoadEstimation.cancel();
      }
    );
  },

  _loadTinderboxDataForPushes: function Data__loadTinderboxDataForPushes(unfilteredPushes, loadTracker, updatedPushCallback) {
    var self = this;
    Config.tinderboxDataLoader.load(
      this._treeName,
      this._getSortedPushesArray(unfilteredPushes),
      this._noIgnore,
      loadTracker,
      function tinderboxDataLoadCallback(machineResults) {
        var updatedPushes = [];
        self._addFinishedResultsToPushes(machineResults, self._pushes, updatedPushes);
        self._notifyUpdatedPushes(updatedPushes, updatedPushCallback);
      },
      this
    );
  },

  _loadPendingAndRunningBuilds: function Data__loadPendingAndRunningBuilds(loadTracker, updatedPushCallback, infraStatsCallback) {
    var self = this;
    this._reloadHiddenBuilders(loadTracker);
    ["pending", "running"].forEach(function (pendingOrRunning) {
      self._getPendingOrRunningBuilds(pendingOrRunning, loadTracker, function (data) {
        var updatedPushes = {};
        self._clearOldPendingOrRunningResultsFromTheirPushes(pendingOrRunning, updatedPushes);
        self["_" + pendingOrRunning + "Jobs"] = (typeof data == "object") ? data : {};
        self._discardPendingRunsThatAreAlreadyRunning(updatedPushes);
        self._addPendingOrRunningResultsToPushes(pendingOrRunning, self._pushes, updatedPushes);
        self._notifyUpdatedPushes(updatedPushes, updatedPushCallback);
        self._reportInfrastructureStatistics(infraStatsCallback);
      });
    });
  },

  _addPushes: function Data__addPushes(loadedPushes, updatedPushes) {
    for (var toprev in loadedPushes) {
      var push = loadedPushes[toprev];
      if (!(toprev in this._pushes)) {
        this._pushes[toprev] = push;
        updatedPushes[toprev] = push;
        if (!this._mostRecentPush || push.id > this._mostRecentPush.id)
          this._mostRecentPush = push;
      }
    }
  },

  _accumulatePushesWithRunningBuildsOnMachine: function Data__accumulatePushesWithRunningBuildsOnMachine(machine, updatedPushes) {
    for (var repo in this._runningJobs) {
      for (var rev in this._runningJobs[repo]) {
        if (!(rev in this._pushes) || (rev in updatedPushes))
          continue;
        for (var i = 0; i < this._runningJobs[repo][rev].length; i++) {
          var runningResult = this._runningJobs[repo][rev][i];
          if (machine == this.getMachine(runningResult.buildername)) {
            updatedPushes[rev] = this._pushes[rev];
            break;
          }
        }
      }
    }
  },

  _getSortedPushesArray: function Data__getSortedPushesArray(unsortedPushesObject) {
    var pushes = Object.values(unsortedPushesObject);
    pushes.sort(function(a,b) { return a.date - b.date; });
    return pushes;
  },

  _notifyUpdatedPushes: function Data__notifyUpdatedPushes(updatedPushes, callback) {
    this._getSortedPushesArray(updatedPushes).forEach(callback);
  },

  _reportInfrastructureStatistics: function Data__reportInfrastructureStatistics(infraStatsCallback) {
    if (!this._pendingJobs || !this._runningJobs)
      return;

    var self = this;
    var infraStats = {};
    ["pending", "running"].forEach(function (pendingOrRunning) {
      var data = self["_" + pendingOrRunning + "Jobs"];
      // For every branch, sum up pending and running builds from all pushes on that branch.
      for (var branch in data) {
        if (!(branch in infraStats))
          infraStats[branch] = { pending: 0, running: 0 };
        for (var rev in data[branch])
          infraStats[branch][pendingOrRunning] += data[branch][rev].length;
      }
    });
    infraStatsCallback(infraStats);
  },

  _addPendingOrRunningResultsToPushes: function Data__addPendingOrRunningResultsToPushes(pendingOrRunning, toWhichPushes, updatedPushes) {
    var data = this["_" + pendingOrRunning + "Jobs"];
    var prBranchName =
      Config.treeInfo[this._treeName].primaryRepo.replace(/^[^\/]+\//, '');
    if (prBranchName in data) {
      for (var rev in data[prBranchName]) {
        if (!(rev in toWhichPushes))
          continue;
        for (var i = 0; i < data[prBranchName][rev].length; i++) {
          var run = data[prBranchName][rev][i];
          var result = this._machineResultFromPendingOrRunningRun(pendingOrRunning, run, rev);
          if (result)
            this._addResultToPush(result);
        }
        if (updatedPushes) {
          updatedPushes[rev] = this._pushes[rev];
        }
      }
    }
  },

  _addFinishedResultToPush: function Data__addFinishedResultToPush(result, toWhichPushes, updatedPushes) {
    result.push = this._getPushForResult(result);
    if (!result.push) {
      this._finishedResultsWithoutPush[result.runID] = result;
      return;
    }

    if (!(result.push.toprev in toWhichPushes))
      return;

    if (result.runID in this._finishedResultsWithPush) {
      var existing = this._finishedResultsWithPush[result.runID];
      if (result.notes != existing.notes) {
        existing.notes = result.notes;
        updatedPushes[existing.push.toprev] = existing.push;
      }
      return;
    }

    this._finishedResultsWithPush[result.runID] = result;
    delete this._finishedResultsWithoutPush[result.runID];
    this._addResultToPush(result);
    updatedPushes[result.push.toprev] = result.push;

    var machine = result.machine;
    if (!machine.latestFinishedRun ||
        result.push.date.getTime() > machine.latestFinishedRun.push.date.getTime() ||
        (result.push.date.getTime() == machine.latestFinishedRun.push.date.getTime() &&
         result.startTime > machine.latestFinishedRun.startTime)) {
      machine.latestFinishedRun = result;
    }
    if (result.state == "success") {
      machine.runs++;
      machine.runtime += (result.endTime.getTime() - result.startTime.getTime())/1000;
      machine.averageCycleTime = Math.ceil(machine.runtime/machine.runs);

      // We've updated the averageCycleTime of this machine. This time is
      // used in the calculation for the ETA of running builds, which is
      // displayed in a tooltip in the machineResult column of the pushes
      // list. In order to update it, we have to update all pushes that
      // have running builds from this machine.
      this._accumulatePushesWithRunningBuildsOnMachine(machine, updatedPushes);
    }
  },

  _addFinishedResultsToPushes: function Data__addFinishedResultsToPushes(results, toWhichPushes, updatedPushes) {
    for (var machineResultID in results) {
      this._addFinishedResultToPush(results[machineResultID], toWhichPushes, updatedPushes);
    }
  },

  _clearOldPendingOrRunningResultsFromTheirPushes: function Data__clearOldPendingOrRunningResultsFromTheirPushes(pendingOrRunning, updatedPushes) {
    var data = this["_" + pendingOrRunning + "Jobs"];
    var prBranchName =
      Config.treeInfo[this._treeName].primaryRepo.replace(/^[^\/]+\//, '');
    if (prBranchName in data) {
      for (var rev in data[prBranchName]) {
        if (!(rev in this._pushes))
          continue;
        for (var i = 0; i < data[prBranchName][rev].length; i++) {
          var run = data[prBranchName][rev][i];
          var result = this._machineResultFromPendingOrRunningRun(pendingOrRunning, run, rev);
          if (result)
            this._removeResultFromPush(result, updatedPushes);
        }
      }
    }
  },

  _machineResultFromPendingOrRunningRun: function Data__machineResultFromPendingOrRunningRun(pendingOrRunning, run, rev) {
    var machine = this.getMachine(run.buildername);
    if (!machine)
      return null;
    var key = pendingOrRunning + "-" + run.id;
    var revs = {};
    revs[Config.treeInfo[this._treeName].primaryRepo] = rev;
    return new MachineResult({
      tree: this._treeName,
      runID: key,
      machine: machine,
      startTime: new Date(run[{pending: "submitted_at", running: "start_time"}[pendingOrRunning]] * 1000),
      revs: revs,
      push: this._pushes[rev],
      state: pendingOrRunning,
    });
  },

  _addResultToPush: function Data__addResultToPush(result) {
    var push = result.push;
    var machine = result.machine;
    var group = this.machineGroup(machine.type);
    if (!push.results)
      push.results = {};
    if (!push.results[machine.os])
      push.results[machine.os] = {};
    if (!push.results[machine.os][machine.flavor])
      push.results[machine.os][machine.flavor] = {};
    if (!push.results[machine.os][machine.flavor][group])
      push.results[machine.os][machine.flavor][group] = [];
    push.results[machine.os][machine.flavor][group].push(result);
  },

  _removeResultFromPush: function Data__removeResultFromPush(result, updatedPushes) {
    var push = result.push;
    var machine = result.machine;
    var group = this.machineGroup(machine.type);
    var grouparr = push.results[machine.os][machine.flavor][group];
    for (var i in grouparr) {
      if (grouparr[i].runID == result.runID) {
        grouparr.splice(i, 1);
        updatedPushes[push.toprev] = push;
        break;
      }
    }
  },

  _discardPendingRunsThatAreAlreadyRunning: function Data__discardPendingRunsThatAreAlreadyRunning(updatedPushes) {
    var self = this;
    for (var repo in this._pendingJobs) {
      for (var rev in this._pendingJobs[repo]) {
        if (!(rev in this._pushes))
          continue;
        for (var i = 0; i < this._pendingJobs[repo][rev].length; i++) {
          var pendingJob = this._pendingJobs[repo][rev][i];
          if (self._runningJobHasPickedUpPendingJob(pendingJob)) {
            this._pendingJobs[repo][rev].splice(i, 1);
            var pendingResult = this._machineResultFromPendingOrRunningRun("pending", pendingJob, rev);
            this._removeResultFromPush(pendingResult, updatedPushes);
          }
        }
      }
    }
  },

  _runningJobHasPickedUpPendingJob: function Data__runningJobHasPickedUpPendingJob(pendingResult) {
    var pendingID = pendingResult.id;
    for (var repo in this._runningJobs) {
      for (var rev in this._runningJobs[repo]) {
        for (var i = 0; i < this._runningJobs[repo][rev].length; i++) {
          var runningJob = this._runningJobs[repo][rev][i];
          if (runningJob.request_ids.indexOf(pendingID) !== -1)
            return true;
        }
      }
    }
    return false;
  },

  machineGroup: function Data_machineGroup(machineType) {
    if (!("hasGroups" in this._config.treeInfo[this._treeName]))
      return machineType;
    for (var groupname in this._config.groupedMachineTypes) {
      if (this._config.groupedMachineTypes[groupname].indexOf(machineType) != -1)
        return groupname;
    }
    return machineType;
  },

  getMachineResult: function Data_getMachineResult(id) {
    return this._finishedResultsWithPush[id];
  },

  getUnfinishedMachineResult: function Data_getUnfinishedMachineResult(runID) {
    var self = this;

    function getMachineResult(status) {
      var jobs = self["_" + status + "Jobs"];
      for (var repo in jobs) {
        for (var rev in jobs[repo]) {
          for (var i = 0; i < jobs[repo][rev].length; i++) {
            var job = jobs[repo][rev][i];
            if (job.id == runID) {
              return self._machineResultFromPendingOrRunningRun(status, job, rev);
            }
          }
        }
      }
    }

    return getMachineResult("pending") ||
           getMachineResult("running");
  },

  getPushForRev: function Data_getPushForRev(toprev) {
    return this._pushes[toprev];
  },

  _getPushForResult: function Data__getPushForResult(machineResult) {
    var repo = Config.treeInfo[this._treeName].primaryRepo;
    if (!(repo in machineResult.revs))
      return null;

    var resultRev = machineResult.revs[repo];
    for (var rev in this._pushes) {
      if (this._pushes[rev].defaultTip == resultRev) {
        return this._pushes[rev];
      }
    }

    return this._pushes[resultRev] || null;
  },

  getMachine: function Data__getMachine(name) {
    if (!(name in this._machines)) {
      // XXX clean all this up after all builders have been
      // transitioned to the new bug 586664 form
      var os =
        /linux.*64/i.test(name) ? "linux64" :
        /fedora.*64/i.test(name) ? "linux64" :
        /linux/i.test(name) ? "linux" :
        /fedora/i.test(name) ? "linux" :
        /OS\s?X.*10\.7/.test(name) ? "osxlion" :
        /lion/.test(name) ? "osxlion" :
        /macosx64/.test(name) ? "osx64" :
        /snowleopard/.test(name) ? "osx64" :
        /OS\s?X.*10\.6/.test(name) ? "osx64" :
        /macosx/.test(name) ? "osx" :
        /leopard/.test(name) ? "osx" :
        /OS\s?X/.test(name) ? "osx" :
        /w764/.test(name) ? "windows7-64" :
        /WINNT 6\.1 x86-64/i.test(name) ? "windows7-64" :
        /WINNT 6\.1 x64/i.test(name) ? "windows7-64" :
        /WINNT 5\.1/i.test(name) ? "windowsxp" :
        /win7/.test(name) ? "windows" :
        /win32/.test(name) ? "windows" :
        /WINNT 6\.1/i.test(name) ? "windows" :
        /WINNT 5\.2/i.test(name) ? "windows" :
        /android xul/i.test(name) ? "android-xul" :
        /android/i.test(name) ? "android" :
        /Maemo 5/.test(name) ? "maemo5" :
        /Maemo/.test(name) ? "maemo4" :
        /N810/.test(name) ? "maemo4" :
        /n900/.test(name) ? "maemo5" :
        /xp/i.test(name) ? "windowsxp" :
        /static-analysis/.test(name) ? "linux" : "";

      var flavor = /pgo/i.test(name) ? "pgo" :
                   /(debug|leak|bloat)/i.test(name) ? "debug" :
                   "opt";

      // see Config.testNames and Config.buildNames
      var type =
        /talos.*xperf$/i.test(name) ? "Talos xperf" :
        /talos.*tsspider$/i.test(name) ? "Talos sspider" :
        /talos.*twinopen$/i.test(name) ? "Talos winopen" :
        /talos.*tpan$/i.test(name) ? "Talos pan" :
        /talos.*tdhtml$/i.test(name) ? "Talos dhtml" :
        /talos.*ts$/i.test(name) ? "Talos ts" :
        /talos.*tzoom$/i.test(name) ? "Talos zoom" :
        /talos.*dromaeo$/i.test(name) ? "Talos dromaeo" :
        /talos.*svg$/i.test(name) ? "Talos svg" :
        /talos.*tp4m_nochrome$/i.test(name) ? "Talos tp nochrome" :
        /talos.*tp4m$/i.test(name) ? "Talos tp" :
        /talos.*nochrome$/i.test(name) ? "Talos nochrome" :
        /talos.*tp4$/i.test(name) ? "Talos tp4" :
        /talos.*tp$/i.test(name) ? "Talos tp" :
        /talos.*tp_responsiveness$/i.test(name) ? "Talos tp" :
        /talos.*dirty$/i.test(name) ? "Talos dirty" :
        /talos.*chrome(_mac)?$/i.test(name) ? "Talos chrome" :
        /talos.*paint$/i.test(name) ? "Talos paint" :
        /talos.*v8$/i.test(name) ? "Talos v8" :
        /talos/i.test(name) ? "Talos Performance" :
        /mobile desktop .* nightly/i.test(name) ? "Mobile Desktop Nightly" :
        /maemo .* qt .* nightly/i.test(name) ? "Maemo Qt Nightly" :
        /rpm .* nightly/i.test(name) ? "RPM Nightly" :
        /nightly/i.test(name) ? "Nightly" :
        /spidermonkey-dtrace/i.test(name) ? "SpiderMonkey DTrace" :
        /spidermonkey-nomethodjit/i.test(name) ? "SpiderMonkey --disable-methodjit" :
        /spidermonkey-notracejit/i.test(name) ? "SpiderMonkey --disable-tracejit" :
        /spidermonkey-shark/i.test(name) ? "SpiderMonkey Shark" :
        /spidermonkey-warnaserr/i.test(name) ? "SpiderMonkey --enable-sm-fail-on-warnings" :
        /shark/i.test(name) ? "Shark Nightly" :
        /mochitest/i.test(name) ? "Mochitest" :
        /unit chrome|browser-chrome|robocop/i.test(name) ? "Mochitest" :
        /crashtest-ipc/.test(name) ? "Crashtest-IPC" :
        /crashtest/i.test(name) ? "Crashtest" :
        /jsreftest/i.test(name) ? "JSReftest" :
        /opengl/i.test(name) ? "Reftest-OpenGL" :
        /reftest-no-accel/i.test(name) ? "Reftest Unaccelerated" :
        /reftest-ipc/i.test(name) ? "Reftest-IPC" :
        /reftest/i.test(name) ? "Reftest" :
        /xpcshell/i.test(name) ? "XPCShellTest" :
        /depend/i.test(name) ? "Build" :
        /qt .* xulrunner/i.test(name) ? "Qt XULRunner" :
        /xulrunner/i.test(name) ? "XULRunner" :
        /(linux|maemo .*) qt/i.test(name) ? "Qt Build" :
        /mobile desktop/i.test(name) ? "Mobile Desktop Build" :
        /build/i.test(name) ? "Build" :
        // The Jetpack tree runs tests from multiple branches, with names like
        // "jetpack-mozilla-central-fedora-opt"
        /jetpack-mozilla-central/i.test(name) ? "Jetpack mozilla-central" :
        /jetpack-mozilla-aurora/i.test(name) ? "Jetpack mozilla-aurora" :
        /jetpack-mozilla-beta/i.test(name) ? "Jetpack mozilla-beta" :
        /jetpack-mozilla-release/i.test(name) ? "Jetpack mozilla-release" :
        // While on other trees, Jetpack tests have names more like
        // "Rev3 Fedora 12 mozilla-central opt test jetpack"
        /jetpack/i.test(name) ? "Jetpack SDK Test" :
        /mozmill-all/i.test(name) ? "Mozmill" :
        /valgrind/i.test(name) ? "Valgrind" :
        /(a11y|chrome|cold|dirty|dromaeo|scroll|svg|tp4)/.test(name) ? "Talos Performance" :
        /(check|test)/.test(name) ? "Unit Test" : "";

      if (!os || !type)
        return;

      this._machines[name] = new Machine({
        name: name,
        os: os,
        type: type,
        flavor: flavor,
        latestFinishedRun: null,
        runs: 0,
        runtime: 0,
        averageCycleTime: 0
      });
    }
    return this._machines[name];
  },

  getMachines: function Data_getMachines() {
    return Object.values(this._machines);
  },

  _getPendingOrRunningBuilds: function Data__getPendingOrRunningBuilds(pendingOrRunning, loadTracker, loadCallback) {
    var self = this;
    loadTracker.addTrackedLoad();
    $.ajax({
      url: Config.jsonPendingOrRunningBaseURL + "builds-" + pendingOrRunning + ".js",
      dataType: 'json',
      success: function (json) {
        if (!json || !json[pendingOrRunning])
          return;
        var data = json[pendingOrRunning];
        self._filterHiddenBuilds(data, function (filteredData) {
          loadCallback(filteredData);
        });
        loadTracker.loadCompleted();
      },
      error: function (request, textStatus, er) {
        loadTracker.loadFailed(textStatus);
      }
    });
  },

  _filterHiddenBuilds: function Data__filterHiddenBuilds(obj, callback) {
    if (this._noIgnore)
      return callback(obj);
    var self = this;
    this._afterHiddenBuildersHaveLoaded(function (hiddenBuilders) {
      var filteredObj = {};
      for (var repo in obj) {
        filteredObj[repo] = {};
        for (var toprev in obj[repo]) {
          filteredObj[repo][toprev] = obj[repo][toprev].filter(function (build) {
            return hiddenBuilders.indexOf(build.buildername) == -1;
          });
        }
      }
      callback(filteredObj);
    });
  },

  _afterHiddenBuildersHaveLoaded: function Data__afterHiddenBuildersHaveLoaded(callback) {
    if (this._hiddenBuildersAreLoading) {
      var oldCallback = this._afterLoadedHiddenBuildersCallback;
      if (oldCallback) {
        this._afterLoadedHiddenBuildersCallback = function (hiddenBuilders) {
          oldCallback(hiddenBuilders);
          callback(hiddenBuilders);
        };
      } else {
        this._afterLoadedHiddenBuildersCallback = callback;
      }
      return;
    }

    callback(this._hiddenBuilders || []);
  },

  _reloadHiddenBuilders: function Data__reloadHiddenBuilders(loadTracker) {
    this._hiddenBuilders = null;
    this._hiddenBuildersAreLoading = true;
    var branch = Config.treeInfo[this._treeName].buildbotBranch;
    var self = this;
    loadTracker.addTrackedLoad();
    $.ajax({
      url: Config.baseURL + "php/getHiddenBuilderNames.php?branch=" + branch,
      dataType: 'json',
      success: function (json) {
        self._hiddenBuildersAreLoading = false;
        if (!json) {
          loadTracker.loadFailed("JSON from getHiddenBuilderNames.php is invalid");
          return;
        }
        self._hiddenBuilders = json;
        if (self._afterLoadedHiddenBuildersCallback) {
          self._afterLoadedHiddenBuildersCallback(self._hiddenBuilders);
          self._afterLoadedHiddenBuildersCallback = null;
        }
        loadTracker.loadCompleted();
      },
      error: function (request, textStatus, er) {
        self._hiddenBuildersAreLoading = false;
        loadTracker.loadFailed(textStatus);
      }
    });
  },

  getPushes: function Data_getPushes() {
    return this._pushes;
  },
};

function Machine(data) {
  for (var k in data) {
    this[k] = data[k];
  }
}

Machine.prototype = {
  getShortDescription: function Machine_getShortDescription() {
    var number = this.machineNumber();
    return this.type + (number ? " " + number : "") + " " + this.flavor;
  },

  getShortDescriptionWithOS: function Machine_getShortDescriptionWithOS() {
    return Config.OSNames[this.os] + " " + this.getShortDescription();
  },

  machineNumber: function Machine_machineNumber() {
    var match = /([0-9]+)\/[0-9]/.exec(this.name);
    if (match)
      return match[1];

    if (this.name.match(/mochitest\-other/))
      return "oth";

    // The Mobile tree uses both mochitest1 and mochitest-1 as machine names.
    match = /mochitest\-?([1-9])/.exec(this.name);
    if (match && /qt/i.test(this.name))
      match[1] += "q";

    if (match)
      return match[1];

    // Mobile split reftests and jsreftests
    match = /reftest\-([1-9])/.exec(this.name);
    if (match)
      return match[1];

    // Mobile split crashtests
    match = /crashtest\-([1-9])/.exec(this.name);
    if (match)
      return match[1];

    if (this.name.match(/unit chrome/))
      return "c";

    if (this.name.match(/browser\-chrome/))
      return "b-c";

    if (this.name.match(/robocop/))
      return "rc";

    return "";
  },
};
