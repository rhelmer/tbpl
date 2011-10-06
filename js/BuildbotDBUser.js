/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var BuildbotDBUser = {

  load: function BuildbotDBUser_load(tree, forPushes, noIgnore, loadTracker, loadCallback, data) {
    var self = this;
    var branch = Config.treeInfo[tree].buildbotBranch;
    var urlPrefix = Config.baseURL + 'php/getRevisionBuilds.php?branch=' + branch;
    if (noIgnore)
      urlPrefix += '&noignore=1';
    forPushes.reverse(); // Load recent pushes first.
    forPushes.forEach(function (push) {
      if (!push.defaultTip)
        return;

      loadTracker.addTrackedLoad();
      $.ajax({
        url: urlPrefix + '&rev=' + push.defaultTip,
        dataType: 'json',
        success: function (runs) {
          loadCallback(self._createMachineResults(tree, push.defaultTip, data, runs));
          loadTracker.loadCompleted();
        },
        error: function (request, textStatus, error) {
          loadTracker.loadFailed(textStatus);
        },
        cache: false,
      });
    });
  },

  openAdminUI: function BuildbotDBUser_openAdminUI(tree) {
    var branch = Config.treeInfo[tree].buildbotBranch;
    HiddenBuildsAdminUI.open(branch);
  },

  _createMachineResults: function BuildbotDBUser__createMachineResults(tree, rev, data, runs) {
    var machineResults = {};
    var self = this;
    runs.forEach(function (run) {
      var machine = data.getMachine(run.buildername);
      if (!machine)
        return;
      var revs = {};
      revs[Config.treeInfo[tree].primaryRepo] = rev;
      var runID = "" + run._id;
      machineResults[runID] = new MachineResult({
        "tree" : tree,
        "machine": machine,
        "slave": run.slave,
        "runID": runID,
        "state": run.result,
        "startTime": new Date(run.starttime * 1000),
        "endTime": new Date(run.endtime * 1000),
        "briefLogURL": Config.baseURL + 'php/getParsedLog.php?id=' + run._id + '&tree=' + tree,
        "absoluteBriefLogURL": Config.absoluteBaseURL + 'php/getParsedLog.php?id=' + run._id + '&tree=' + tree,
        "fullLogURL": Config.baseURL + 'php/getParsedLog.php?id=' + run._id + '&tree=' + tree + '&full=1',
        "summaryURL": Config.baseURL + "php/getLogExcerpt.php?id=" + run._id,
        "annotatedSummaryURL": Config.baseURL + "php/getLogExcerpt.php?id=" + run._id + '&tree=' + tree + '&type=annotated',
        "reftestLogURL": Config.baseURL + "php/getLogExcerpt.php?id=" + run._id + '&type=reftest',
        "_scrapeURL": Config.baseURL + "php/getLogExcerpt.php?id=" + run._id + '&type=tinderbox_print',
        "revs": revs,
        "notes": run.notes || [],
      });
    });
    return machineResults;
  },
};
