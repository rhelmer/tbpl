/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var UserInterface = {

  _controller: null,
  _treeName: "",
  _data: null,
  _activeResult: "",
  _selectedBuilds: { },
  _selectedRevs: { },
  _onlyUnstarred: false,
  _pusher: "",
  _machine: "",
  _statusMessageIDs: { },
  _lastMessageID: 0,
  _nextBuildRequest: 0,
  _keymap: {
    '?': 'help',
    'u': 'toggle-unstarred',
    'c': 'show-comment',
    'j': 'prev-unstarred',
    'k': 'next-unstarred',
    'p': 'prev-unstarred',
    'n': 'next-unstarred',
    ' ': 'select'
  },
  _cmddoc: { 'prev-unstarred': 'Highlight previous unstarred failure',
             'next-unstarred': 'Highlight next unstarred failure',
             'toggle-unstarred': 'Toggle showing only unstarred failures',
             'select': 'Select/deselect active build or changeset',
             'help': 'Show the help box',
             'show-comment': 'Show the comment box'
           },

  init: function UserInterface_init(controller) {
    var self = this;
    this._controller = controller;
    this._treeName = controller.treeName;
    this._data = controller.getData();

    document.title = "[0] " + this._getPrettyTreeName(controller.treeName) + " - Tinderboxpushlog";

    this._refreshMostRecentlyUsedTrees();
    this._buildShortcuts();
    this._buildLegend();
    this._buildTreeInfo();
    this._initFilters();
    this._initWindowEvents();

    $(window).resize(function refreshTooltips() {
      $("#pushes > li").each(function () {
        $(".patches .popup", this).remove();
        self._installTooltips($(this));
      });
    });
    $("#localTime").bind("click", function localTimeClick() {
      self._switchTimezone(true);
      return false;
    });

    $("#mvtTime").bind("click", function mvtTimeClick() {
      self._switchTimezone(false);
      return false;
    });

    $("#adminUILink").bind("click", function adminUILinkClick() {
      Config.tinderboxDataLoader.openAdminUI(self._treeName);
      UserInterface._closeAllPopupUI();
      return false;
    });

    $("#pushes, #topbar").bind("mousedown", function pushesMouseDown(e) {
      self._clickNowhere(e);
    });

    $(".dropdown").live("click", function dropdownClick(ev) {
      $(this).addClass("open");
    });

    $(".popupForm").draggable({
      containment: 'window',
      handle: 'form, h2, table, tbody, tr, th, td, label, p'
    });

    $(".closePopup").bind("click", function closePopupClick() {
      UserInterface.closePopup($(this).parents(".popupForm"));
      return false;
    });

    $("html").bind("mousedown", function clickAnywhere(e) {
      // Close open dropdowns if the event's target is not inside
      // an open dropdown.
      if ($(e.target).parents(".dropdown.open").length == 0)
        $(".dropdown").removeClass("open");
    });

    $(".machineResult").live("click", function clickMachineResult(e) {
      var id = $(this).attr('resultID');
      if (e.ctrlKey || e.metaKey)
        self._toggleSelectedBuild(id);
      else
        self._resultLinkClick(id);
      return false;
    });

    $.event.props.push("dataTransfer");
    $(".machineResult:not(.pending):not(.running)").live("dragstart", function (e) {
      e.dataTransfer.effectAllowed = "link";
      var resultID = $(this).attr("resultID");
      // Note: This doesn't work in Chromium due to bug 31037.
      e.dataTransfer.setData("text/x-tbpl-resultid", resultID);
    });

    $(".revlink").live("dragstart", function (e) {
      e.dataTransfer.effectAllowed = "link";
      e.dataTransfer.setData("text/x-tbpl-revision", $(this).attr("data-rev"));
    });

    $("a.pushStatable").live("click", function (e) {
      self._controller.pushURL(this.href);
      return false;
    });

    SummaryLoader.init();
    AddCommentUI.init();
    AddCommentUI.registerNumSendingCommentChangedCallback(function commentSendUpdater(changedResult) {
      self.updateStatus();
      if (changedResult) {
        // Starredness is reflected in several places:
        //  - a star after the letter in the results column next to the push
        //  - the list of failed jobs in the top right corner
        //  - the number of unstarred failures in the title
        //  - the panel showing the star if the starred result is selected
        // We need to refresh all these places.
        self.handleUpdatedPush(changedResult.push);
        self._updateFailingBuildsDisplay();
        self._setActiveResult(self._activeResult, false);
      }
    });
    AddCommentUI.registerNumSendingBugChangedCallback(function bugSendUpdater() {
      self.updateStatus();
    });
    HiddenBuildsAdminUI.init();

    this._updateTimezoneDisplay();

    $("#pushes").append(
      $('<li id="goBackLi"><a id="goBack" href="#" title="add another ' + Config.goBackPushes + ' pushes"></a></li>')
        .children().first().bind('click', function goBack() {
          self._controller.extendPushRange(-Config.goBackPushes);
          return false;
        }).parent());

    return {
      status: function (status) {
        self.updateStatus(status);
      },
      handleUpdatedPush: function (push) {
        self.handleUpdatedPush(push);
      },
      handleInfraStatsUpdate: function (infraStats) {
        self.handleInfraStatsUpdate(infraStats);
      },
      handleInitialPushlogLoad: function () {
        $("#pushes").removeClass("initialload");
      },
      updateTreeStatus: function (data, calendarFallback) {
        var div = $("<div>").html(data);
        $("#preamble", div).remove();
        $("#tree-status").empty();
        $("#status-container", div).contents().appendTo("#tree-status");
        if (calendarFallback) {
          ["#sheriff", "#releng"].forEach(function (role) {
            var info = $(role, div).contents();
            if (!info.text())
              $("<div>Unknown</div>").replaceAll(role);
            else
              info.replaceAll(role);
          });
        }
      },
      updateCalendar: function (role, result, error) {
        var fallbacks = {"sheriff": "#developers", "releng": "#build"};
        if (error) {
          $("#current-" + role).html('<span style="color:red; text-decoration:underline" title="Error: ' + (error.cause ? error.cause.statusText : error.message).escapeAttribute() + '">probably ' + fallbacks[role].escapeContent() + '</span>');
          return;
        }

        var resultText = result.length ? result[0].getTitle().getText() : fallbacks[role];
        var resultHTML = (resultText.charAt(0) == '#') ?
          '<a href="irc://irc.mozilla.org/' + escape(resultText.slice(1)) + '">' +
          resultText.escapeContent() + '</a>' : resultText.escapeContent();
        $("#current-" + role).html(resultHTML);
      },
      paramsChanged: function (params) {
        self._updatePusherFilter(params.pusher || "");
        self._updateMachineFilter(params.jobname || "");
        self._updateUnstarredFilter(params.onlyunstarred == '1');
        self._updateTreeSwitcher();
      }
    };
  },

  _getPrettyTreeName: function UserInterface_getPrettyTreeName(treeName) {
    if (!(treeName in Config.treeInfo))
      return "Unknown Tree";
    return ("prettierName" in Config.treeInfo[treeName])
             ? Config.treeInfo[treeName].prettierName : treeName;
  },

  handleUpdatedPush: function UserInterface_handleUpdatedPush(push) {
    $("#nopushes").remove();
    var existingPushNode = $("#push-" + push.id);
    if (existingPushNode.length) {
      this._refreshPushResultsInPushNode(push, existingPushNode);
    } else {
      var pushNode = this._generatePushNode(push);
      pushNode.insertBefore(this._getInsertBeforeAnchor(push));

      // It's a new push node which might need to be filtered.
      if (this._pusher && this._pusher != push.pusher) {
        pushNode.hide();
      }
    }
    this._updateFailingBuildsDisplay();
  },

  _getInsertBeforeAnchor: function UserInterface__getInsertBeforeAnchor(push) {
    var allPushNodes = $("#pushes").children(".push");
    // allPushNodes are sorted in decreasing pushID order.
    // The first pushNode with pushID < push.id will be our
    // insertBefore anchor. If all existing pushes have
    // pushID > push.id, the goBack arrow container li is the
    // anchor.
    for (var i = 0; i < allPushNodes.length; i++) {
      var currentPushNode = allPushNodes.eq(i);
      if (+currentPushNode.attr("data-id") < push.id)
        return currentPushNode;
    }
    return $("#goBackLi");
  },

  handleInfraStatsUpdate: function UserInterface_handleInfraStatsUpdate(infraStats) {
    var html = '<dt>Branch</dt><dd><a href="' +
      Config.htmlPendingOrRunningBaseURL + 'pending">pending</a>' +
      ' / <a href="' + Config.htmlPendingOrRunningBaseURL +
      'running">running</a></dd>';
    var total = {pending: 0, running: 0};
    for (var branch in infraStats) {
      html += "<dt>" + branch.escapeContent() + "</dt><dd>" + infraStats[branch].pending + " / " + infraStats[branch].running + "</dd>";
      total.pending += infraStats[branch].pending;
      total.running += infraStats[branch].running;
    }
    html += "<dt>Total</dt><dd>" + total.pending + " / " + total.running + "</dd>";
    $("#infrastructure").html(html);
  },

  updateStatus: function UserInterface_updateStatus(status) {
    var self = this;

    function showStatusMessage(statusType, messageText, messageType) {
      if (!self._statusMessageIDs[statusType]) {
        var mid = self.showMessage(messageText, messageType);
        if (messageType) {
          self._statusMessageIDs[statusType] = mid;
        }
      } else {
        self.updateMessage(self._statusMessageIDs[statusType], messageText, messageType);
        if (!messageType) {
          self._statusMessageIDs[statusType] = 0;
        }
      }
    }

    var text = "", type = "";
    if (status) {
      if (status.loadpercent < 1) {
        text = "Loading " + Math.ceil(status.loadpercent * 100) + "% …";
        type = "loading";
      } else if (status.failed) {
        text = "Loading failed: " + status.failed.join(", ");
        type = "error";
      }
    }
    showStatusMessage("loading", text, type);

    var numComments = AddCommentUI.numSendingComments;
    if (numComments) {
      text = "Sending " + numComments + " " + (numComments == 1 ? "comment" : "comments") + "…";
      type = "loading";
    } else {
      text = "";
      type = "";
    }
    showStatusMessage("sendingComments", text, type);

    var numBugs = AddCommentUI.numSendingBugs;
    if (numBugs) {
      text = "Marking " + numBugs + " " + (numBugs == 1 ? "bug" : "bugs") + "…";
      type = "loading";
    } else {
      text = "";
      type = "";
    }
    showStatusMessage("sendingBugs", text, type);
  },

  _mostRecentlyUsedTrees: function() {
    if (!("mostRecentlyUsedTrees" in storage) ||
        !storage.mostRecentlyUsedTrees)
      this._setMostRecentlyUsedTrees([]);
    if (JSON.parse(storage.mostRecentlyUsedTrees).length != 3)
      this._setMostRecentlyUsedTrees(Object.keys(Config.treeInfo).slice(0, 3));
    return JSON.parse(storage.mostRecentlyUsedTrees);
  },

  _setMostRecentlyUsedTrees: function(trees) {
    storage.mostRecentlyUsedTrees = JSON.stringify(trees);
  },

  _refreshMostRecentlyUsedTrees: function UserInterface__refreshMostRecentlyUsedTrees() {
    if (this._treeName in Config.treeInfo) {
      // Remove the least recently used tree and add this tree as the most recently used one.
      // The array is ordered from recent to not recent.
      var mruTrees = this._mostRecentlyUsedTrees();
      if (mruTrees.indexOf(this._treeName) != -1)
        mruTrees.splice(mruTrees.indexOf(this._treeName), 1);
      else
        mruTrees = mruTrees.slice(0, 2);
      this._setMostRecentlyUsedTrees([this._treeName].concat(mruTrees));
    }
  },

  _updateTreeSwitcher: function UserInterface__updateTreeSwitcher() {
    var self = this;
    var mruList = $("#mruList").children().remove().end();
    var moreList = $("#moreList").children().remove().end();
    Object.keys(Config.treeInfo).forEach(function (tree) {
      var treeName = self._getPrettyTreeName(tree);
      var effects = self._controller.effectsOfParamChanges({tree:tree});
      var treeLink = effects ?
        '<a href="' + effects.url + '"' +
        (effects.pushStatable ? ' class="pushStatable"' : '') +
        '>' + treeName + '</a>' :
        '<strong>' + treeName + '</strong>';
      var isMostRecentlyUsedTree = (self._mostRecentlyUsedTrees().indexOf(tree) != -1);
      $("<li>" + treeLink + "</li>").appendTo(isMostRecentlyUsedTree ? mruList : moreList);
    });
  },

  _buildShortcuts: function UserInterface__buildShortcuts() {
    var shortcuts = $('#shortcuts');

    for (var key in this._keymap) {
      var action = this._keymap[key];
      var keydesc = key;
      if (keydesc == ' ')
        keydesc = 'space';
      $('<dt>' + keydesc + '</dt><dd>' + (this._cmddoc[action] || action) + '</dd>').appendTo(shortcuts);
    }
    $('<dt>Click</dt><dd>Choose an active build and display its details</dd>').appendTo(shortcuts);
    $('<dt>Ctrl/Cmd-Click</dt><dd>Select/deselect build or changeset</dd>').appendTo(shortcuts);
    $('<dt>Drag</dt><dd>Add build or changeset to comment</dd>').appendTo(shortcuts);
  },

  _buildLegend: function UserInterface__buildLegend() {
    for (var name in Config.buildNames) {
      $('<dt>' + Config.buildNames[name] + '</dt><dd>' + name + '</dd>').appendTo($('#legend-builds'));
    }
    for (var name in Config.testNames) {
      $('<dt>' + Config.testNames[name] + '</dt><dd>' + name + '</dd>').appendTo($('#legend-tests'));
    }
  },

  _buildTreeInfo: function UserInterface__buildTreeInfo() {
    if (this._treeName in Config.treeInfo) {
      var treeInfo = $('#treeInfo');
      var primaryRepo = Config.treeInfo[this._treeName].primaryRepo;
      $('<dt>Pushlog:</dt><dd><a href="https://hg.mozilla.org/' + primaryRepo + '/pushloghtml">' +
        Config.treeInfo[this._treeName].primaryRepo +
        '</a></dd>').appendTo(treeInfo);

      if ('otherRepo' in Config.treeInfo[this._treeName]) {
        var otherRepo = Config.treeInfo[this._treeName].otherRepo;

        $('<dt></dt><dd><a href="https://hg.mozilla.org/' + otherRepo + '/pushloghtml">' +
        Config.treeInfo[this._treeName].otherRepo +
        '</a></dd>').appendTo(treeInfo);
      }
    } else {
      $("#wrongtree").html(
        "The tree “" + this._treeName.escapeContent() +
        "” does not exist in Tinderboxpushlog. " +
        "Please choose a tree from the list on the upper left.<br/>" +
        'Maybe the tree you’re looking for is on the <a href="' +
        Config.alternateTinderboxPushlogURL + escape(this._treeName) +
        '">' + Config.alternateTinderboxPushlogName.escapeContent() +
        ' version of Tinderboxpushlog</a>.');
    }
  },

  _updateUnstarredFilter: function UserInterface__updateOnlyStarredFilter(state) {
    document.getElementById('onlyUnstarred').checked = state;
    this._onlyUnstarred = state;

    var pushes = Object.values(this._data.getPushes());
    for (var i = 0; i < pushes.length; ++i) {
      this.handleUpdatedPush(pushes[i]);
    }

    this._updateFailingBuildsDisplay();
  },

  _updatePusherFilter: function UserInterface__updatePusherFilter(pusher) {
    document.getElementById('pusher').value = pusher;
    this._pusher = pusher;

    var self = this;
    // This loop needs to be executed even if the pusher hasn't changed
    // because a different param might have changed, so we need to update
    // the pusher link href.
    $(".push").each(function(index) {
      var pusher = $(this).attr("data-pusher");
      if (self._pusher) {
        if (self._pusher != pusher) {
          $(this).hide();
        } else {
          // Make pusher links work as an exit out of the pusher filtered mode.
          var newURL = self._controller.getURLForChangedParams({pusher:null});
          $(this).find("a.pusher").attr("href", newURL);
        }
      } else {
        var newURL = self._controller.getURLForChangedParams({pusher:pusher});
        $(this).find("a.pusher").attr("href", newURL);
        $(this).show();
      }
    });

    this._updateFailingBuildsDisplay();
  },

  _updateMachineFilter: function UserInterface__updateMachineFilter(machine) {
    if (machine == this._machine)
      return;

    document.getElementById('machine').value = machine;
    this._machine = machine;

    var self = this;
    var pushes = Object.values(this._data.getPushes());
    for (var i = 0; i < pushes.length; ++i) {
      this.handleUpdatedPush(pushes[i]);
    }

    this._updateFailingBuildsDisplay();
  },

  _initFilters: function UserInterface__initFilters() {
    var onlyUnstarredCheckbox = document.getElementById('onlyUnstarred');
    var pusherField = document.getElementById('pusher');
    var machineField = document.getElementById('machine');

    // Use the values passed in parameter as the default values.
    onlyUnstarredCheckbox.checked = this._onlyUnstarred;
    pusherField.value = this._pusher;
    machineField.value = this._machine;

    var self = this;

    onlyUnstarredCheckbox.onchange = function() {
      self._setOnlyUnstarred(onlyUnstarredCheckbox.checked);
    }

    machineField.onchange = function() {
      self._setJobName(machineField.value);
    }

    pusherField.onchange = function() {
      // If the UA knows HTML5 Forms validation, don't update the UI when the
      // value isn't a valid email address.
      if (("validity" in pusherField) && !pusherField.validity.valid)
        return;

      self._setPusher(pusherField.value);
    }
  },

  _setPusher: function UserInterface__setPusher(pusher) {
    this._controller.pushParamsChange({
      pusher: pusher
    });
  },

  _setJobName: function UserInterface__setJobName(jobname) {
    this._controller.pushParamsChange({
      jobname: jobname
    });
  },

  _setOnlyUnstarred: function UserInterface__setOnlyUnstarred(value) {
    this._controller.pushParamsChange({
      onlyunstarred: value && 1
    });
  },

  _toggleOnlyUnstarred: function UserInterface__toggleOnlyUnstarred() {
    this._setOnlyUnstarred(!this._onlyUnstarred);
  },

  closePopup: function UserInterface__closePopup(popup) {
    $(popup).fadeOut('fast', function afterFadeOut() {
      if ('afterCloseCallback' in this)
        this.afterCloseCallback();
    });
  },

  // Close all dropdowns and popups
  _closeAllPopupUI: function UserInterface__closeAllPopupUI() {
    $('.dropdown').removeClass('open');
    this.closePopup($('.popupForm:visible'));
  },

  // Get all jobs' results, optionally filtered by a pusher
  _getAllResults: function UserInterface__getAllResults() {
    var self = this;
    var results = [];
    var oses = Object.keys(Config.OSNames);
    var flavors = ['debug', 'opt', 'pgo'];
    var groups = Object.keys(Config.resultNames);

    var pushes = Object.values(this._data.getPushes());
    pushes = pushes.filter(function (push) {
      if (self._pusher && push.pusher != self._pusher)
        return false;
      if (!push.results)
        return false;
      return true;
    });
    
    pushes.forEach(function (push) {
      oses.forEach(function (os) {
        if (!push.results[os])
          return;

        flavors.forEach(function (flavor) {
          if (!push.results[os][flavor])
            return;

          groups.forEach(function (group) {
            if (!push.results[os][flavor][group])
              return;

            push.results[os][flavor][group].forEach(function (result) {
              results.push(result);
            });
          });
        });
      });
    });

    return results.filter(function (result) {
      return !(result.state == 'pending' ||
               result.state == 'retry' ||
               result.state == 'unknown');
    });
  },

  // Get the latest result for each job type, optionally filtered by pusher
  _getCurrentResults: function UserInterface__getCurrentResults() {
    // If there is no pusher filter, the current results are the last results
    // for each machines.
    if (!this._pusher) {
      var results = [];
      var machines = this._data.getMachines();
      machines.forEach(function getLastResultFromMachines(machine) {
        if (machine.latestFinishedRun) {
          results.push(machine.latestFinishedRun);
        }
      });

      return results;
    }

    // When there is a pusher filter set, we get the current result by
    // traversing all pushes, keep the non-filtered one and get the results
    // from the newest to the oldest.
    // We set the results in a dictionary that takes the machine name. Thus, we
    // are sure we do not add twice a result for the same job.
    var results = {};
    var pushes = Object.values(this._data.getPushes());
    var oses = Object.keys(Config.OSNames);
    var flavors = ['debug', 'opt', 'pgo'];
    var groups = Object.keys(Config.resultNames);

    for (var i = pushes.length-1; i >= 0; --i) {
      if (pushes[i].pusher != this._pusher) {
        continue;
      }
      if (!pushes[i].results) {
        continue;
      }

      for (var x = 0; x < oses.length; ++x) {
        var os = oses[x];
        if (!pushes[i].results[os]) {
          continue;
        }
        for (var y = 0; y < flavors.length; ++y) {
          var flavor = flavors[y];
          if (!pushes[i].results[os][flavor]) {
            continue;
          }
          for (var z = 0; z < groups.length; ++z) {
            var group = groups[z];
            if (!pushes[i].results[os][flavor][group]) {
              continue;
            }
            for (var j = 0; j < pushes[i].results[os][flavor][group].length; ++j) {
              var result = pushes[i].results[os][flavor][group][j];
              var key = result.machine.name;

              if ((result.state == "pending" || result.state == "retry" ||
                   result.state == "unknown") ||
                  (results[key] && result.startTime < results[key].startTime)) {
                continue;
              }
              results[key] = result;
            }
          }
        }
      }
    }

    return Object.values(results);
  },

  _getFailingJobs: function UserInterface__getFailingJobs(results) {
    var machineFilter = this._machine ? new RegExp(this._machine, "i") : null;
    var failing = [];
    var self = this;

    results.forEach(function addResultsToTreeStatus1(result) {
      // Ignore filtered jobs.
      if (machineFilter && result.machine.name.match(machineFilter) == null)
        return;
      if (self._onlyUnstarred && self._machineResultHasNotes(result)) {
        return;
      }

      switch (result.state)
      {
        case 'busted':
        case 'exception':
        case 'unknown':
          failing.unshift(result);
        break;
        case 'testfailed':
          failing.push(result);
        break;
      }
    });

    return failing;
  },

  _initWindowEvents: function UserInterface__initWindowEvents() {
    var self = this;

    jQuery(document).keypress(function(event) {
      // We don't have keybindings with modifiers.
      if (event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }

      // This could be improved by checking :editable maybe...
      if (event.target.nodeName == 'INPUT' ||
          event.target.nodeName == 'TEXTAREA') {
        return;
      }

      var action = self._keymap[String.fromCharCode(event.which)];

      // Toggle the help box
      if (action == 'help') {
        $('#helpContainer').toggleClass('open');
        return false;
      }

      // Toggle "Only unstarred" filter
      if (action == 'toggle-unstarred') {
        self._toggleOnlyUnstarred();
        return false;
      }

      // Move between unstarred failing jobs
      if (action == 'next-unstarred' || action == 'prev-unstarred') {
        // We want only the unstarred failures
        var failures = self._getFailingJobs(self._getAllResults());
        var unstarred = failures.filter(function (job) {
          return self._isUnstarredFailure(job);
        });

        if (unstarred.length == 0) {
          return;
        }

        // Sort by display order (note that result.order is only meaningful
        // with respect to a single push)
        unstarred.sort(function (a,b) {
          if (a.push.id != b.push.id)
            return b.push.id < a.push.id ? -1 : 1;

          var da = a.order || 0;
          var db = b.order || 0;
          return da < db ? -1 : (da > db ? 1 : 0);
        });

        var advance = (action == 'next-unstarred') ? 1 : -1;

        // Set the default value (if nothing is currently selected).
        var result = (action == 'next-unstarred') ? 0 : unstarred.length - 1;

        if (self._activeResult) {
          for (var i = 0; i < unstarred.length; ++i) {
            if (unstarred[i].runID == self._activeResult) {
              result = i + advance;
              if (result >= unstarred.length)
                result = 0;
              else if (result < 0)
                result = unstarred.length - 1;
              break;
            }
          }
        }

        self._setActiveResult(unstarred[result].runID, true);
        AddCommentUI.clearAutoStarBugs();
        return false;
      }

      // Show the starring UI
      if (action == 'show-comment') {
        AddCommentUI.openCommentBox();
        return false;
      }

      // Toggle 'selected' status
      if (action == 'select') {
        if (self._activeResult) {
          self._toggleSelectedBuild(self._activeResult);
          return false;
        }
      }

      return true;
    });

    // Use keydown instead of keypress for non-character keys
    jQuery(document).keydown(function(event) {
      // We don't have keybindings with modifiers.
      if (event.metaKey || event.altKey || event.ctrlKey) {
        return;
      }

      switch (event.which) {
        case 27: // escape
          UserInterface._closeAllPopupUI();
          return false;
      }
    });
  },

  _updateTimezoneDisplay: function UserInterface__updateTimezoneDisplay() {
    document.getElementById('localTime').className = this._useLocalTime() ? 'selected' : '';
    document.getElementById('mvtTime').className = !this._useLocalTime() ? 'selected' : '';
  },

  _switchTimezone: function UserInterface__switchTimezone(local) {
    var self = this;
    this._setUseLocalTime(local);
    this._updateTimezoneDisplay();
    $(".date").each(function() {
      var elem = $(this);
      if (!elem.attr("data-timestamp"))
        return;
      var date = new Date();
      date.setTime(elem.attr("data-timestamp"));
      elem.html(self._getDisplayDate(date));
    });
  },

  _linkBugs: function UserInterface__linkBugs(text, addOrangefactorLink) {
    var buglink = '<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=$2" ' +
      'data-bugid="$2" onmouseover="UserInterface.loadBug(this);">$1$2</a>';
    if (addOrangefactorLink && "orangeFactor" in Config.treeInfo[this._treeName]) {
      var today = new Date();
      var sixtyDaysAgo = new Date(today.getTime() - (1000 * 60 * 60 * 24 * 60));
      buglink += ' [<a href="http://brasstacks.mozilla.com/orangefactor/?display=Bug&endday=' +
                  this._ISODateString(today) + '&startday=' + this._ISODateString(sixtyDaysAgo) + '&bugid=$2">orangefactor</a>]'
    }
    return text.escapeContent()
           .replace(/(bug\s*|b=)([1-9][0-9]*)\b/ig, buglink)
           .replace(/(changeset\s*)?([0-9a-f]{12})\b/ig, '<a href="https://hg.mozilla.org/' + Config.treeInfo[this._treeName].primaryRepo + '/rev/$2">$1$2</a>');
  },

  loadBug: function UserInterface_loadBug(elem) {
    var id = $(elem).attr("data-bugid");
    // avoid double request when we have a popup
    $("[data-bugid=" + id + "]").removeAttr("onmouseover");
    if (!id)
      return;
    this._data.getBug(id, function (bug) {
      $("[data-bugid=" + id + "]").attr("title", bug.status + " - " + bug.summary);
    });
  },

  _isFailureState: function UserInterface__isFailureState(state) {
    switch (state) {
      case 'busted':
      case 'exception':
      case 'unknown':
      case 'testfailed':
        return true;
    }
    return false;
  },

  _isUnstarredFailure: function UserInterface__isUnstarredFailure(result) {
    return !(this._machineResultHasNotes(result)) && this._isFailureState(result.state);
  },

  _updateFailingBuildsDisplay: function UserInterface__updateFailingBuildsDisplay() {
    var failing = this._getFailingJobs(this._getCurrentResults());
    var unstarred = 0;
    for (var i = 0; i < failing.length; ++i) {
      if (this._isUnstarredFailure(failing[i])) {
        unstarred++;
      }
    }

    var self = this;
    $('#status').get(0).innerHTML = (function calcHTML() {
      return '<strong>' + failing.length + '</strong> Job' + (failing.length != 1 ? 's are' : ' is') + ' failing:<br />' +
      failing.map(function(machineResult) {
        var className = "machineResult " + machineResult.state;
        var title = self._resultTitle(machineResult);
        if (self._machineResultHasNotes(machineResult)) {
          className += " hasNote";
          title = "(starred) " + title;
        }
        return '<a href="' + machineResult.briefLogURL + '"' +
               ' class="' + className + '"' +
               ' title="' + title.escapeAttribute() + '"' +
               (machineResult.runID == self._activeResult ? ' active="true"' : '') +
               ' resultID="' + machineResult.runID + '"' +
               '>' + title.escapeContent() + '</a>';
      }).join('\n');
    })();
    document.title = document.title.replace(/\[\d*\]/, "[" + unstarred + "]");
  },

  _toggleSelectedBuild: function UserInterface__toggleSelectedBuild(id) {
    var selected;
    if (id in this._selectedBuilds) {
      delete this._selectedBuilds[id];
      selected = false;
    } else {
      this._selectedBuilds[id] = true;
      selected = true;
    }
    AddCommentUI.updateUI();
    return selected;
  },

  _toggleSelectedRev: function UserInterface__toggleSelectedRev(rev, force) {
    var add;
    if (typeof(force) != "undefined")
      add = force;
    else
      add = !(rev in this._selectedRevs);

    if (add) {
      this._selectedRevs[rev] = true;
      AddCommentUI.addRevToComment(rev);
    } else {
      delete this._selectedRevs[rev];
      AddCommentUI.removeRevFromComment(rev);
    }
    AddCommentUI.updateUI();
    this._markSelected();
    return add;
  },

  _useLocalTime: function UserInterface__useLocalTime() {
    return storage.useLocalTime == "true"; // Storage stores Strings, not Objects :-(
  },

  _setUseLocalTime: function UserInterface__setUseLocalTime(value) {
    if (value)
      storage.useLocalTime = "true";
    else
      delete storage.useLocalTime;
  },

  _getTimezoneAdaptedDate: function UserInterface__getTimezoneAdaptedDate(date) {
    if (this._useLocalTime())
      return date;

    var hoursdiff = date.getTimezoneOffset() / 60 + Config.mvtTimezoneOffset;
    return new Date(date.getTime() + hoursdiff * 60 * 60 * 1000);
  },

  _getDisplayDate: function UserInterface__getDisplayDate(date) {
    var timezoneName = this._useLocalTime() ? "" : " " + Config.mvtTimezoneName;
    var d = this._getTimezoneAdaptedDate(date);
    // Thu Jan 7 20:25:03 2010 (PST)
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " +
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " +
    d.getDate() + " " + d.getHours().pad() + ":" + d.getMinutes().pad() + ":" + d.getSeconds().pad() + " " +
    d.getFullYear() + timezoneName;
  },

  _getDisplayTime: function UserInterface__getDisplayTime(date) {
    if (!date.getTime)
      return '';

    var d = this._getTimezoneAdaptedDate(date);
    return d.getHours().pad() + ":" + d.getMinutes().pad();
  },

  _ISODateString: function(date) {
    return date.getUTCFullYear() + '-' +
           (date.getUTCMonth() + 1).pad() + '-' +
           date.getUTCDate().pad();
  },

  _resultTitle: function UserInterface__resultTitle(result) {
    var type = result.machine.getShortDescription();
    return {
      "pending": type + ' is pending',
      "running": type + ' is still running',
      "success": type + ' was successful',
      "testfailed": 'Tests failed on ' + type + ' on ' + Config.OSNames[result.machine.os],
      "exception": 'Infrastructure exception on ' + type + ' on ' + Config.OSNames[result.machine.os],
      "busted": type + ' on ' + Config.OSNames[result.machine.os] + ' is burning',
      "retry": type + ' on ' + Config.OSNames[result.machine.os] + ' has been restarted',
      "unknown": 'Unknown error on ' + type + ' on ' + Config.OSNames[result.machine.os],
    }[result.state] + (result.state == "pending" ? "" : ', ' + this._timeString(result));
  },

  _timeString: function UserInterface__timeString(result) {
    if (["running", "pending"].indexOf(result.state) == -1) {
      return 'took ' + Math.ceil((result.endTime.getTime() - result.startTime.getTime()) / 1000 / 60)
        + 'mins';
    }
    if (!result.machine.averageCycleTime)
      return 'ETA unknown';
    var elapsed = Math.ceil(((new Date()).getTime() - result.startTime.getTime()) / 1000);
    if (elapsed > result.machine.averageCycleTime)
      return 'ETA any minute now';
    return 'ETA ~' + Math.ceil((result.machine.averageCycleTime - elapsed) / 60)
      + 'mins';
  },

  _machineResultHasNotes: function UserInterface__machineResultHasNotes(machineResult) {
    return (machineResult.notes && machineResult.notes.length);
  },

  _machineResultLink: function UserInterface__machineResultLink(machineResult, onlyNumber) {
    var machine = machineResult.machine;
    var linkText = machine.type == "Mochitest" && onlyNumber ?
      machine.machineNumber() :
      Config.resultNames[machine.type] + machine.machineNumber();
    if (this._machineResultHasNotes(machineResult))
      linkText += '*';
    return '<a' +
      (machineResult.isFinished() ? ' href="' + machineResult.briefLogURL + '"' : '') +
      ' resultID="' + machineResult.runID + '"' +
      (machineResult.runID == this._activeResult ? ' active="true"' : '') +
      ' class="machineResult ' + machineResult.state +
        (machineResult.runID in this._selectedBuilds ? ' selected' : '') +
      '"' +
      ' title="' + this._resultTitle(machineResult) + '"' +
      '>' + linkText + '</a>';
  },

  _addSuggestionLink: function UserInterface__addSuggestionLink(machineResults, target) {
    if (machineResults.suggestions) {
      for (var i = 0; i < machineResults.suggestions.length; ++i) {
        var item = machineResults.suggestions[i];
        var link =
        $("<a href=\"#\">Bug " + item.id + "</a>").click(function() {
          AddCommentUI.toggleSuggestion(this.getAttribute("data-id"));
          return false;
        }).attr("title", "[" + item.status.trim() + "] " + item.summary)
        .attr("data-id", item.id)
        .appendTo(target);
        AddCommentUI.markSuggestedBug(item.id);
      }
    }
  },

  _machineGroupResultLink: function UserInterface__machineGroupResultLink(machineType, machineResults) {
    if (!machineResults.length)
      return "";
    var self = this;
    return '<span class="machineResultGroup" machineType="' +
    Config.resultNames[machineType] +
    '"> ' +
    machineResults.map(function linkMachineResult(a) { return self._machineResultLink(a, true); }).join(" ") +
    ' </span>';
  },

  _filterDisplayedResults: function UserInterface__filterDisplayedResults(results) {
    if (!this._onlyUnstarred && !this._machine)
      return results;

    var self = this;
    var filteredResults = results;

    if (this._onlyUnstarred) {
     filteredResults = filteredResults.filter(function (result) {
        return self._isUnstarredFailure(result);
      });
    }

    if (this._machine) {
     var machineFilter = new RegExp(this._machine, "i");
     filteredResults = filteredResults.filter(function (result) {
       return machineFilter.test(result.machine.name);
     });
    }

    return filteredResults;
  },

  _buildHTMLForOS: function UserInterface__buildHTMLForOS(os, flavorSuffix, results, order) {
    var self = this;

    // Sort finished before running before pending results, and then via start
    // time.
    function resultOrder(a, b) {
      if (a.state != b.state &&
          (a.state == "pending" || b.state == "pending" ||
           a.state == "running" || b.state == "running")) {
        // When does b go after a? Return -1 in those cases.
        if ((b.state == "pending") ||
            (b.state == "running" && a.state != "pending"))
          return -1;
        return 1;
      }
      return a.startTime.getTime() - b.startTime.getTime();
    }

    var osresults = Object.keys(Config.resultNames).map(function getFilteredAndSortedResults(machineType) {
      var displayedResults = self._filterDisplayedResults(results[machineType] || []);
      if ("hasGroups" in Config.treeInfo[self._treeName] &&
          Object.keys(Config.groupedMachineTypes).indexOf(machineType) != -1) {
        displayedResults.sort(function machineResultSortOrderComparison(a, b) {
          // machine.type does not mess up the numeric/alphabetic sort
          var numA = a.machine.type + a.machine.machineNumber();
          var numB = b.machine.type + b.machine.machineNumber();
          if (numA == numB)
            return resultOrder(a, b);

          return numA > numB ? 1 : -1;
        });
        return { 'machineType': machineType, 'results': displayedResults };
      }

      displayedResults.sort(resultOrder);
      return displayedResults;
    });

    var oshtml = osresults.map(function (osresult) {
      if ('machineType' in osresult) {
        osresult.results.forEach(function (result) {
          result.order = ++order[0];
        });
        return self._machineGroupResultLink(osresult.machineType, osresult.results);
      } else {
        return osresult.map(function (result) {
          result.order = ++order[0];
          return self._machineResultLink(result);
        }).join(" ");
      }
    }).join("");

    if (!oshtml)
      return '';

    return '<li><span class="os ' + os + '">' + (Config.OSNames[os] + flavorSuffix).escapeContent() +
    '</span><span class="osresults">' + oshtml + '</span></li>';
  },

  _buildHTMLForPushResults: function UserInterface__buildHTMLForPushResults(push) {
    var self = this;
    var order = [ 0 ];
    return Object.keys(Config.OSNames).map(function buildHTMLForPushResultsOnOS(os) {
      if (!push.results || !push.results[os])
        return '';
      return (push.results[os].opt   ? self._buildHTMLForOS(os, " opt"  , push.results[os].opt  , order) : '') +
             (push.results[os].pgo   ? self._buildHTMLForOS(os, " pgo"  , push.results[os].pgo  , order) : '') +
             (push.results[os].debug ? self._buildHTMLForOS(os, " debug", push.results[os].debug, order) : '');
    }).join("\n");
  },

  _buildHTMLForPushPatches: function UserInterface__buildHTMLForPushPatches(push) {
    var self = this;

    var patches = push.patches.slice(0);
    var max = Config.maxChangesets;
    var preElision = Math.floor(max / 2);
    var elide = (patches.length > max) ? patches.length - max : 0;
    if (max == 0)
      elide = 0;
    if (elide)
      patches.splice(preElision, elide);
    var patchhtml = patches.map(function buildHTMLForPushPatch(patch, patchIndex) {
      return '<li>\n' +
      '<a class="revlink" data-rev="' + patch.rev + '" href="' + self._changesetURL(patch.rev) + '">' + patch.rev +
      '</a>\n<div><div class="patchTitle"><span><span class="author">' +
      patch.author.escapeContent() + '</span> &ndash; ' +
      '<span class="desc">' + self._linkBugs(patch.desc.split("\n")[0], false) + '</span>' +
      (function buildHTMLForPatchTags() {
        if (!patch.tags.length)
          return '';

        return ' <span class="logtags">' + $(patch.tags).map(function () {
          return ' <span class="' + this.type.escapeAttribute() + '">' + this.name.escapeContent() + '</span>';
        }).get().join('') + '</span>';
      })() +
      '</span></div></div>\n' +
      '</li>';
    });

    if (elide) {
      var url = this._changesetsURL(push);
      patchhtml.splice(preElision, 0, "<li>...<a href='" + url + "'>" + elide + " changesets omitted</a>...</li>");
    }

    return patchhtml.join("\n");
  },

  _changesetsURL: function UserInterface__changesetsUrl(push) {
    // pushloghtml is bizarre -- startID is *exclusive*, endID is inclusive
    return Config.mercurialURL + Config.treeInfo[this._treeName].primaryRepo + '/pushloghtml?startID=' + (push.id-1) + '&endID=' + push.id;
  },

  _changesetURL: function UserInterface__changesetUrl(rev) {
    return Config.mercurialURL + Config.treeInfo[this._treeName].primaryRepo + '/rev/' + rev;
  },

  _generatePushNode: function UserInterface__generatePushNode(push) {
    var self = this;
    var linkedPusher = this._pusher == push.pusher ? null : push.pusher;
    var nodeHtml = '<li class="push" id="push-' + push.id + '" data-id="' + push.id + '" data-pusher="' + push.pusher + '">\n' +
      '<h2><a href="' + this._controller.getURLForChangedParams({pusher:linkedPusher}) + '"' +
      'class="pusher pushStatable">' + push.pusher.escapeContent() + '</a> &ndash; ' +
      '<a class="date" data-timestamp="' + push.date.getTime() +
      '" href="' + this._controller.getURLForChangedParams({rev:push.toprev}) + '">' +
      self._getDisplayDate(push.date) + '</a>' +
      ' <span class="talosCompare">(<label>compare: <input onclick="UserInterface._comparisonClickHandler();"' +
      ' class="revsToCompare" type="checkbox" value="' + push.toprev + '"></label>)</span>' +
      '<a class="csetList" onclick="UserInterface._listChangesetsForPush(\''+ push.toprev +'\'); return false" href="#">List changeset URLs</a>';
    var buildAPILink = this._buildAPIURL(push.toprev);
    if (buildAPILink) {
      nodeHtml += '<a class="buildAPI" target="_blank" href="'+ buildAPILink +'">Self-serve Build API</a>';
    }
    nodeHtml += '</h2>\n';
    if (this._treeName == 'Try') {
      nodeHtml += '<img class="cancelAllBuildsButton" src="images/tango-process-stop.png" title="Cancel all builds" onclick="UserInterface._cancelAllButtonClick(this, \'' + push.toprev + '\')">\n';
    }
    nodeHtml +=
      '<ul class="results"></ul>\n' +
      '<ul class="patches"></ul>\n' +
      '</li>';
    var node = $(nodeHtml);
    this._refreshPushPatchesInPushNode(push, node);
    this._refreshPushResultsInPushNode(push, node);
    this._installTooltips(node);
    return node;
  },

  _refreshPushPatchesInPushNode: function UserInterface__refreshPushPatchesInPushNode(push, node) {
    var self = this;
    var patchesList = $(".patches", node);
    patchesList.get(0).innerHTML = this._buildHTMLForPushPatches(push);
  },

  _refreshPushResultsInPushNode: function UserInterface__refreshPushResultsInPushNode(push, node) {
    var resultsList = $(".results", node);
    resultsList.get(0).innerHTML = this._buildHTMLForPushResults(push);
  },

  _listChangesetsForPush: function UserInterface__listChangesetsForPush(toprev) {
    var self = this;
    var push = this._data.getPushForRev(toprev);
    var urls = push.patches.map(function (patch) { return self._changesetURL(patch.rev); });
    // We want to show the csets' URLs first-to-last for pasting into bugs,
    // instead of last-to-first as they're displayed in the UI
    urls.reverse();
    var html = "<!DOCTYPE html><title>Changeset URLs for push " + toprev +
               "</title><pre>" + urls.join('\n') + "</pre>";
    window.open("data:text/html," + escape(html), "", "width=600,height=300,scrollbars=yes");
  },

  _buildAPIURL: function UserInterface__buildAPIURL(toprev) {
    var base = Config.selfServeAPIBaseURL;
    var treeInfo = Config.treeInfo[this._treeName];
    if (!base || !base.length || !('buildbotBranch' in treeInfo)) {
      return null;
    }
    return base + "/" + treeInfo.buildbotBranch + "/rev/" + toprev;
  },

  _permanentMessagesShowing: function UserInterface__permanentMessagesShowing() {
    // Only messages of type "loading" and "error" are permanent.
    // Other messages aren't permanent and should be hidden after a timeout,
    // for example the ones created by rebuild success callbacks, which have
    // no type (and thus className == "").
    return document.querySelector("#messages > .loading, #messages > .error") != null;
  },

  hideMessages: function UserInterface_hideMessages(onlyIfNoneLoading) {
    if (onlyIfNoneLoading && this._permanentMessagesShowing()) {
      return;
    }

    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
    }

    $("#messages").hide().empty();
  },

  _resetMessageTimer: function UserInterface__resetMessageTimer() {
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
      this._messageTimer = 0;
    }
    if (this._permanentMessagesShowing()) {
      return;
    }

    var self = this;
    this._messageTimer = setTimeout(function() {
      self._messageTimer = 0;
      self.hideMessages();
    }, 8000);
  },

  _showMessage: function UserInterface__showMessage(div, message, type) {
    var messages = document.getElementById("messages");

    if (message == '') {
      if (div.parentNode) {
        messages.removeChild(div);
        if (!messages.firstChild) {
          this.hideMessages();
        }
      }
      return;
    }

    messages.style.display = 'inline-block';
    div.className = type || '';
    div.innerHTML = (type == 'error' ? '<a class="messageDismiss" href="#" onclick="UserInterface.updateMessage(\'' + div.id + '\', \'\'); return false"></a>'
                                     : '') +
                    message.escapeContent();
    if (!div.parentNode) {
      messages.appendChild(div);
    }
  },

  showMessage: function UserInterface_showMessage(message, type) {
    if (message == '') {
      return;
    }

    var mid = "message" + ++this._lastMessageID;
    var div = document.createElement("div");
    div.setAttribute("id", mid);
    this._showMessage(div, message, type);
    this._resetMessageTimer();
    return mid;
  },

  updateMessage: function UserInterface_updateMessage(mid, message, type) {
    this._showMessage(document.getElementById(mid), message, type);
    this._resetMessageTimer();
  },

  /**
   * Finds pushes with checked boxes in the UI, gets the first revision number
   * from each, and opens mconnors talos compare script in a new window.
   *
   * Usage:
   * - Selecting two pushes will trigger the comparison.
   *
   * TODO:
   * - allow to select multiple revs, show them somewhere in the ui with a
   *   button that does the compare
   */
  _comparisonClickHandler: function UserInterface__comparisonClickHandler() {
    // get selected revisions
    var revs = $(".revsToCompare").map(function() {
      return this.checked ? this.value : null;
    }).get();
    // the new rev is first in the dom

    if (revs.length < 2)
      return;

    // I dont like popups, but I dont see a better way right now
    var perfwin = window.open("http://perf.snarkfest.net/compare-talos/index.php?oldRevs=" +
                              revs.slice(1).join(",") + "&newRev=" + revs[0] +
                              "&submit=true");
    perfwin.focus();
  },

  _createTooltipPopup: function UserInterface__createTooltipPopup() {
    // `this` is the li.push for which we create the popups, see _installTooltips below.
    $(this).unbind();
    $(".patches > li > div > .patchTitle", this).each(function createPopupPatch(i) {
      var div = $(this);
      var rightEdgeLi = div.parents("li").get(0).getBoundingClientRect().right;
      var rightEdgeDiv = div.get(0).getBoundingClientRect().right;
      if (rightEdgeLi - rightEdgeDiv > 10)
        return; // There's enough space; no need to show the popup.
      div.clone().addClass("popup").insertBefore(div);
    });
  },

  _installTooltips: function UserInterface__installTooltips(context) {
    // We only know the width of the element and children if we already had a
    // reflow, so we still do the element creation in the mouseenter handler.
    // We also still need the child span to have meaningful children.width numbers.
    context.unbind("mouseenter");
    context.bind("mouseenter", this._createTooltipPopup);
  },

  _clickNowhere: function UserInterface__clickNowhere(e) {
    if (!$(e.target).is("a, #pushes"))
      this._setActiveResult("");
  },

  _resultLinkClick: function UserInterface__resultLinkClick(resultID) {
    this._setActiveResult(resultID, true);
    AddCommentUI.clearAutoStarBugs();
  },

  _markActiveResultLinks: function UserInterface__markActiveResultLinks() {
    if (this._activeResult)
      $('.machineResult[resultID="' + this._activeResult + '"]').attr("active", "true");
  },

  _markSelected: function UserInterface__markSelected() {
    $('.machineResult').removeClass('selected');
    for (var id in this._selectedBuilds) {
      $('.machineResult[resultID="' + id + '"]').addClass('selected');
    }
    $('.revlink').removeClass('selected');
    for (var rev in this._selectedRevs) {
      $('.revlink[data-rev="' + rev + '"]').addClass('selected');
    }
  },

  _setActiveResult: function UserInterface__setActiveResult(resultID, scroll) {
    SummaryLoader._abortOutstandingSummaryLoadings();
    SummaryLoader._abortOutstandingSummaryLoadings = function deactivateActiveResult() {};
    if (this._activeResult) {
      $('.machineResult[resultID="' + this._activeResult + '"]').removeAttr("active");
    }
    this._activeResult = resultID;
    this._markActiveResultLinks();
    this._displayResult();
    if (this._activeResult) {
      var activeA = $('.results .machineResult[resultID="' + this._activeResult + '"]').get(0);
      if (activeA && scroll) {
        this._scrollElemIntoView(activeA, $("#container").get(0), 20);
      }
    }
  },

  _scrollElemIntoView: function UserInterface__scrollElemIntoView(elem, box, margin) {
    var boxBox = box.getBoundingClientRect();
    var elemBox = elem.getBoundingClientRect();
    if (elemBox.top < boxBox.top) {
      // over the scrollport
      this._animateScroll(box, box.scrollTop - (boxBox.top - elemBox.top) - margin, 150);
    } else if (elemBox.bottom > boxBox.bottom) {
      // under the scrollport
      this._animateScroll(box, box.scrollTop + (elemBox.bottom - boxBox.bottom) + margin, 150);
    }
  },

  _animateScroll: function UserInterface__animateScroll(scrollBox, end, duration) {
    var startTime = Date.now();
    var start = scrollBox.scrollTop;
    var timer = setInterval(function animatedScrollTimerIntervalCallback() {
      var now = Date.now();
      var newpos = 0;
      if (now >= startTime + duration) {
        clearInterval(timer);
        newpos = end;
      } else {
        var t = (now - startTime) / duration;
        t = (1 - Math.cos(t * Math.PI)) / 2; // smooth
        newpos = (1 - t) * start + t * end;
      }
      scrollBox.scrollTop = newpos;
    }, 16);
  },

  _durationDisplay: function UserInterface__durationDisplay(result) {
    return 'started ' + this._getDisplayTime(result.startTime) +
      ', ' + (result.state == "running" ? 'still running... ' : 'finished ' +
      this._getDisplayTime(result.endTime) + ', ') + this._timeString(result);
  },

  _makeStatusCallback: function UserInterface__makeStatusCallback(mid, s, type, fn) {
    var self = this;
    return function statusCallback(e) {
      if (e && String(e).match(/^\[object ProgressEvent/)) {
        e = 'network error';
      }
      self.updateMessage(mid, s + (e ? ' (' + e + ')': ''), type);
      if (fn) fn();
    }
  },

  _rebuildButtonClick: function UserInterface__rebuildButtonClick(rebuildButton, runID) {
    var result = this._data.getMachineResult(runID) ||
                 this._data.getUnfinishedMachineResult(runID);
    var desc = result.machine.getShortDescriptionWithOS();

    var mid = this.showMessage('Requesting rebuild of ' + desc + '…', 'loading');
    var onSuccess = this._makeStatusCallback(mid, 'Rebuild of ' + desc + ' requested.');
    var onTimeout = this._makeStatusCallback(mid, 'Rebuild request for ' + desc + ' timed out.', 'error');
    var onFailure = this._makeStatusCallback(mid, 'Rebuild request for ' + desc + ' failed.', 'error');

    // Leave at least 3 seconds between rebuild requests.
    var now = Date.now();
    var delay = Math.max(this._nextBuildRequest - now, 0);
    this._nextBuildRequest = now + delay + 3000;
    setTimeout(function() {
      result.getBuildIDForSimilarBuild(
        function rebuildButtonClick_GotBuildID(buildID) {
          try {
            BuildAPI.rebuild(result.getBuildbotBranch(), buildID, onSuccess, onFailure, onTimeout);
          } catch (e) {
            onFailure(e);
          }
        },
        onFailure, onTimeout);
    }, delay);
  },

  _cancelButtonClick: function UserInterface__cancelButtonClick(cancelButton, requestOrBuildID) {
    function showCancelButton() {
      cancelButton.style.display = 'inline';
    }

    var result = this._data.getUnfinishedMachineResult(requestOrBuildID);
    var desc = result.machine.getShortDescriptionWithOS();

    var mid = this.showMessage('Requesting cancellation of ' + desc + '…', 'loading');
    var onSuccess = this._makeStatusCallback(mid, 'Cancellation of ' + desc + ' requested.');
    var onTimeout = this._makeStatusCallback(mid, 'Cancellation request for ' + desc + ' timed out.', 'error', showCancelButton);
    var onFailure = this._makeStatusCallback(mid, 'Cancellation request for ' + desc + ' failed.', 'error', showCancelButton);

    cancelButton.style.display = 'none';

    var method = result.state == 'pending' ? 'cancelRequest' : 'cancelBuild';
    BuildAPI[method](result.getBuildbotBranch(), requestOrBuildID, onSuccess, onFailure, onTimeout);
  },

  _cancelAllButtonClick: function UserInterface__cancelAllButtonClick(cancelAllButton, rev) {
    function showCancelAllButton() {
      cancelAllButton.style.display = 'inline';
    }

    if (!window.confirm('This will cancel all pending and running builds for revision ' + rev + '!\n\nAre you sure?')) {
      return;
    }

    var mid = this.showMessage('Requesting cancellation of revision ' + rev + '…', 'loading');
    var onSuccess = this._makeStatusCallback(mid, 'Cancellation of revision ' + rev + ' requested.');
    var onTimeout = this._makeStatusCallback(mid, 'Cancellation request for revision ' + rev + ' timed out.', 'error', showCancelAllButton);
    var onFailure = this._makeStatusCallback(mid, 'Cancellation request for revision ' + rev + ' failed.', 'error', showCancelAllButton);

    cancelAllButton.style.display = 'none';

    var treeInfo = Config.treeInfo[this._treeName];
    BuildAPI.cancelRevision(treeInfo.buildbotBranch, rev, onSuccess, onFailure, onTimeout);
  },

  _activeResultObject: function UserInterface__activeResultObject() {
    if (!this._activeResult)
      return null;
    var result = this._data.getMachineResult(this._activeResult);
    if (result)
      return result;
    var run = this._activeResult.replace(/^pending-|running-/, '');
    return this._data.getUnfinishedMachineResult(run);
  },

  _displayResult: function UserInterface__displayResult() {
    var self = this;
    var box = $("#details");
    var body = $("body");
    var result = this._activeResultObject();
    if (!result) {
      body.removeClass("details");
      box.removeAttr("state");
      box.empty();
      return;
    }

    body.addClass("details");
    box.attr("state", result.state);
    box.removeClass("hasStar");
    if (this._machineResultHasNotes(result))
      box.addClass("hasStar");
    box.html((function htmlForResultInBottomBar() {
      var revs = result.revs;
      function makeButton(image, type, arg) {
        return '<img tabindex="0" src="images/' + image + '"' +
               ' title="' + type + '"' +
               ' onclick="UserInterface._' + type.toLowerCase() + 'ButtonClick(this, \'' + arg + '\')">';
      }
      return '<div><h3>' + result.machine.name +
      ' [<span class="state ' + result.state + '">' + result.state + '</span>]</h3>\n' +
      '<div class="buildButtons">' +
      (Config.selfServeAPIBaseURL ? makeButton('tango-list-add.png', 'Rebuild', result.runID.replace(/^(pending|running)-/, '')) : '') +
      (Config.selfServeAPIBaseURL && (result.state == 'pending' || result.state == 'running') ?
        makeButton('tango-process-stop.png', 'Cancel', result.runID.replace(/^(pending|running)-/, '')) :
        '') +
      '</div>' +
      '<span>using revision' + (Object.keys(revs).length != 1 ? 's' : '') + ': ' + (function(){
        var ret = [];
        for(var repo in revs) {
          ret.push('<a href="https://hg.mozilla.org/' + repo + '/rev/' + revs[repo] + '">' + repo + '/' + revs[repo] + '</a>');
        }
        return ret;
      })().join(', ') + '</span>' +
      (function htmlForTryBuilds() {
        if (result.machine.type != 'Build') {
          return '';
        }
        for (var repo in result.revs) {
          if (repo == 'try' || repo == 'try-comm-central') {
            var dir = (repo == 'try') ? "firefox" : "thunderbird";
            return '<a href="https://ftp.mozilla.org/pub/mozilla.org/' +
                   dir + '/try-builds/' + result.push.pusher + '-' +
                   result.revs[repo] + '/">go to build directory</a>';
          }
        }
        return '';
      })() +
      (function htmlForLogs() {
        if (result.state == 'running' || result.state == 'pending') {
          return '';
        }
        return '<a href="' + result.briefLogURL + '">view brief log</a>' +
               '<a href="' + result.fullLogURL + '">view full log</a>';
      })() +
      (function htmlForReftests() {
        if (result.state == 'running' || result.state == 'pending' ||
            !/^Reftest/.test(result.machine.type)) {
          return '';
        }
        var baseURL = Config.baseURL || document.baseURI.replace(/\/[^\/]+$/, '/');
        var html =
          '<!DOCTYPE html>' +
          '<title>Loading reftest analyzer for ' + result.tree + ' ' + result.machine.name + '</title>' +
          '<link rel="stylesheet" href="' + baseURL + 'css/style.css">' +
          '<body><p class="loading">Retrieving reftest log...</p>' +
          '<script src="' + baseURL + 'js/jquery.js"></script>' +
          '<script src="' + baseURL + 'js/NetUtils.js"></script>' +
          '<script>\n' +
          'function encode(s) { return escape(s).replace(/=/g, "%3d") }\n' +
          'NetUtils.loadText(' + self._makeJSString(baseURL + result.reftestLogURL) + ',\n' +
          '                   function(log) { window.location.replace("https://hg.mozilla.org/mozilla-central/raw-file/tip/layout/tools/reftest/reftest-analyzer.xhtml#log=" + encode(encode(log))) },\n' +
          '                   function() { $("p").removeClass("loading").text("Fetching reftest log failed.") },\n' +
          '                   function() { $("p").removeClass("loading").text("Fetching reftest log timed out.") });\n' +
          '</script>';
        return '<a href="data:text/html,' + escape(html) + '">open reftest analyzer</a>';
      })() +
      (function htmlForAddComment() {
        if (result.state == 'running' || result.state == 'pending') {
          return '';
        }
        return '<div id="autoStar"></div>' +
               '<a class="addNote" href="http://tinderbox.mozilla.org/addnote.cgi?log=' + self._treeName + '/' + result.runID + '">add a comment</a>';
      })() +
      (function htmlForDuration() {
        if (result.state == 'pending')
          return '';
        return '<span class="duration">' + self._durationDisplay(result) + '</span>';
      })() +
      '</div>' +
      (function htmlForTestResults() {
        var testResults = result.getTestResults(function testResultsLoaded(result) {
          self._testResultsLoaded(result);
        });
        if (testResults === null)
          return '<div id="results"><p class="loading">Loading results...</p></div>';
        return '<div id="results">' +
          (testResults.length ? 
            '<ul>\n' +
            testResults.map(function htmlForTestResultEntry(r) {
              return '<li>' + r.name +
                (r.result ? ': ' + (r.resultURL ? '<a href="' + r.resultURL.escapeAttribute() +
                                                  '">' + r.result.escapeContent() + '</a>'
                                                : r.result)
                      : '') +
                (r.detailsURL ? ' (<a href="' + r.detailsURL.escapeAttribute() +
                                '">details</a>)'
                              : '') +
                '</li>';
            }).join("") +
            '</ul>' : '') +
          '</div>';
      })() +
       (function htmlForPopup() {
         return '<div class="stars">' +
          (function htmlForNoteInPopup() {
            if (!self._machineResultHasNotes(result))
              return '';
            return '<div class="note">' +
              result.notes.map(function htmlForNote(note) {
                return '[<strong>' + note.who.escapeContent() + '</strong>' +
                  (note.timestamp ? (' - ' + UserInterface._getDisplayDate(new Date(note.timestamp * 1000))) : '') +
                  ']<br/>' + self._linkBugs(note.note, true);
                }).join("<br/><br/>") +
                '</div>';
          })() +
          (result.state == 'running' || result.state == 'pending' ? '' : '<div class="summary"><span id="summaryLoader"></span></div>') +
          '</div>';
      })();
    })());
    AddCommentUI.updateUI();
    SummaryLoader.setupSummaryLoader(result, box.get(0));
  },

  _testResultsLoaded: function UserInterface__testResultsLoaded(result) {
    if (result == this._activeResultObject())
      this._displayResult();
  },

  _makeJSString: function UserInterface_makeJSString(s) {
    return '"' + s.replace(/[\\\/'"]/g, '\\$&') + '"';
  },

};
