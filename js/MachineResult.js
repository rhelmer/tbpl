/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

function MachineResult(data) {
  for (var i in data) {
    this[i] = data[i];
  }
  this._finished = ['building', 'running', 'pending'].indexOf(this.state) == -1;
}

MachineResult.prototype = {
  isFinished: function MachineResult_isFinished() {
    return this._finished;
  },

  getTestResults: function MachineResult_getTestResults(callback) {
    if (!this._finished) {
      return [];
    }

    var self = this;
    var machine = this.machine;
    if (!("_scrape" in this)) {
      this._getScrape(function (scrape) {
        self._scrape = scrape;
        callback(self);
      });
      return null;
    }

    var scrape = this._scrape;
    if (!scrape)
      return [];
    return (function callRightScrapeParser(fun) {
      if (/talos/i.test(machine.type))
        return self._getTalosResults.call(self, scrape);
      return (fun[machine.type] ? fun[machine.type] : fun.generic).call(self, scrape);
    })({
      "Unit Test": self._getUnitTestResults,
      "Everythingelse Test": self._getUnitTestResults,
      "Talos Performance": self._getTalosResults,
      "Build": self._getScrapeResults,
      "generic": self._getScrapeResults
    });
  },
  
  _getScrape: function MachineResult__getScrape(callback) {
    NetUtils.loadText(this._scrapeURL, function successCallback(text) {
      callback(text.trim().split("\n"));
    }, function failCallback() {
      callback(null);
    }, function timeoutCallback() {
      callback(null);
    });
  },

  _getScrapeResults: function MachineResult__getScrapeResults(scrape) {
    return $(scrape).map(function parseGenericTestScrapeLine() {
      if (this.match(/rev(ision)?\:/))
        return null;
      var match = this.match(/(.*)(\:|<br\/>)(.*)/);
      return (match ? { name: match[1], result: match[3]} : { name: this });
    }).filter(function filterNull() { return this; }).get();
  },
  
  _getUnitTestResults: function MachineResult__getUnitTestResults(scrape) {
    return $(scrape).map(function parseUnitTestScrapeLine() {
      var match = this.match(/(.*)<br\/>(.*)/);
      return match && {
        name: match[1],
        result: match[2]
      };
    }).filter(function filterNull() { return this; }).get();
  },
  
  _getTalosResults: function MachineResult__getTalosResults(scrape) {
    var seriesURLs = {};
    var foundSomething = false;
    var cell = document.createElement("td");
    cell.innerHTML = scrape.join("<br>\n");
    $('p a', cell).each(function lookForGraphLink() {
      if (this.getAttribute("href").indexOf("http://graphs") != 0)
        return;
      seriesURLs[this.textContent] = this.getAttribute("href");
      foundSomething = true;
    });
  
    if (!foundSomething)
      return this._getScrapeResults(scrape);

    var results = $(scrape).map(function findSlaveName() {
      return /^s:/.test(this) && { name: this };
    }).filter(function filterNull() { return this; }).get();

    var failLines = $(scrape).map(function parseFailedTalosRunScrapeLine() {
      return this.match(/FAIL\:(.*)/) && { name: this };
    }).filter(function filterNull() { return this; }).get();
    results = results.concat(failLines);

    return results.concat($('a', cell).map(function parseEachGraphLink() {
      var resultURL = $(this).attr("href");
      if (resultURL.indexOf("http://graphs") != 0)
        return;
      var match = this.textContent.match(/(.*)\:(.*)/);
      if (!match)
        return null;
      var testname = match[1].trim();
      return {
        name: testname,
        result: match[2].trim(),
        detailsURL: seriesURLs[testname],
        "resultURL": resultURL
      };
    }).filter(function filterNull() { return this; }).get());
  },

  getBuildIDForSimilarBuild: function MachineResult_getBuildIDForSimilarBuild(callback, failCallback, timeoutCallback) {
    if (!this._finished) {
      callback(this.runID.replace(/^(pending|running)-/, ''));
      return;
    }

    // We don't know the build ID number for a finished build, but from
    // the information exposed by the Build API we can find out the
    // build ID for a "similar" build, one that was of the same type and
    // on the same revision.
    var self = this;
    if (this._similarBuildID) {
      callback(this._similarBuildID);
      return;
    }

    var tree = Config.treeInfo[this.tree].buildbotBranch;
    var rev = this.revs[Config.treeInfo[this.tree].primaryRepo];
    BuildAPI.getBuildsForRevision(
      tree, rev,
      function getBuildID_BuildsLoaded(builds) {
        try {
          builds = builds.filter(function(b) { return b.buildername == self.machine.name });
          if (!builds.length) {
            throw "could not find build";
          }
          self._similarBuildID = builds[0].build_id;
          callback(self._similarBuildID);
        } catch (e) {
          failCallback(e);
        }
      },
      failCallback, timeoutCallback);
  },

  getBuildbotBranch: function MachineResult_getBuildbotBranch() {
    return Config.treeInfo[this.tree].buildbotBranch;
  },
};
