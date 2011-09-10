/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var Controller = {
  treeName: Config.defaultTreeName,

  _uiCallbacks: null,

  _loadInterval: null,
  _data: null,
  _requestedRange: null,
  _trackingTip: false,
  _params: {},

  _paramOverrides: {
    // stronger: [weaker1, weaker2, ...]
    // A param change to a stronger param will unset all its weaker params.
    "tree": ["rev", "pusher", "onlyunstarred", "jobname"],
    "rev": ["pusher"],
  },
  _paramDefaults: {
    // Unspecified params have the default value false.
    // Parameters with a falsy value are not included in the URL.
    "tree": Config.defaultTreeName,
  },
  _pushStatableParams: ["pusher", "onlyunstarred", "jobname"],

  init: function Controller_init() {
    var self = this;

    $("body").removeClass("noscript");
    var params = this._parseParams();

    window.onpopstate = function(event) {
      self._urlChanged();
    };

    // Allow requests using the buildbot branch name instead of the Tinderbox
    // tree name, but redirect such requests to the tree name form.
    // e.g. redirect ?branch=mozilla-1.9.2 to ?tree=Firefox3.6
    if (!("tree" in params) && ("branch" in params)) {
      document.location = this.getURLForChangedParams({
        tree: this._treeForBranch(params.branch),
        branch: null
      });
      return;
    }

    if (("usetinderbox" in params) && (params.usetinderbox == "1")) {
      // Override for anyone needing the old tinderbox source
      Config.tinderboxDataLoader = TinderboxJSONUser;
    }

    this.treeName = ("tree" in params) && params.tree;
    var noIgnore = ("noignore" in params) && (params.noignore == "1");

    this._data = new Data(this.treeName, noIgnore, Config);
    this._uiCallbacks = UserInterface.init(this);
    this._uiCallbacks.paramsChanged(params);

    if (!(this.treeName in Config.treeInfo))
      return;

    var initialPushRangeParams = this._getInitialPushRangeParams(params);
    var initialPushRange = initialPushRangeParams.range;
    this._trackingTip = initialPushRangeParams.trackTip;
    this._initialDataLoad(initialPushRange);
    var self = this;
    this._loadInterval = setInterval(function startStatusRequestIntervalCallback() {
      self.refreshData();
    }, Config.loadInterval * 1000);

    // Initialize the tree status then update it every 5 minutes.
    self.refreshTreeStatus();
    setInterval(function () { self.refreshTreeStatus(); }, 1000 * 60 * 5);

    if (Config.useGoogleCalendar)
      self.initCalendar();
  },

  _getChangedParams: function Controller__getChangedParams(paramChanges) {
    var params = this.getParams();
    for (var key in paramChanges) {
      if (key in this._paramOverrides) {
        // Unset all overridden params.
        this._paramOverrides[key].forEach(function (overriddenParam) {
          delete params[overriddenParam];
        });
      }
      params[key] = paramChanges[key];
    }
    return params;
  },

  // Returns null if paramChanges don't make a difference.
  // Otherwise, returns an object { url: "...", pushStatable: true / false }.
  effectsOfParamChanges: function Controller__effectsOfParamChanges(paramChanges) {
    var self = this;
    var originalParams = this.getParams();
    var changedParams = this._getChangedParams(paramChanges);
    var unionKeys = Object.keys(originalParams).concat(Object.keys(changedParams));
    function isDifferentAtKey(key) {
      var original = originalParams[key] || false;
      var changed = changedParams[key] || false;
      return original != changed;
    }
    var differentKeys = {};
    unionKeys.forEach(function (key) {
      if (isDifferentAtKey(key))
        differentKeys[key] = true;
    });
    differentKeys = Object.keys(differentKeys);

    if (!differentKeys.length)
      return null; // No differences.

    return {
      url: this.getURLForChangedParams(paramChanges),
      pushStatable: differentKeys.every(function isKeyPushStatable(key) {
        return self._pushStatableParams.indexOf(key) != -1;
      })
    };
  },

  getURLForChangedParams: function Controller_getURLForChangedParams(paramChanges) {
    return this._getURLForParams(this._getChangedParams(paramChanges));
  },

  pushURL: function Controller_pushURL(newURL) {
    if (history && "pushState" in history) {
      history.pushState({}, "", newURL);
      this._urlChanged();
    } else {
      location.href = newURL;
    }
  },

  pushParamsChange: function Controller_pushParamsChange(paramChanges) {
    this.pushURL(this.getURLForChangedParams(paramChanges));
  },

  getData: function Controller_getData() {
    return this._data;
  },

  refreshTreeStatus: function Controller_refreshTreeStatus() {
    var self = this;
    $.ajax({
      url: "http://tinderbox.mozilla.org/" + this.treeName + "/status.html",
      dataType: "text",
      success: function (data) {
        self._uiCallbacks.updateTreeStatus(data, !Config.useGoogleCalendar);
      }
    });
  },

  initCalendar: function Controller_initCalendar() {
    var self = this;
    google.setOnLoadCallback(function() {
      var service = new google.gdata.calendar.CalendarService("mozilla-tinderbox");

      var items = {
        "sheriff": "http://www.google.com/calendar/feeds/j6tkvqkuf9elual8l2tbuk2umk%40group.calendar.google.com/public/full",
        "releng" : "http://www.google.com/calendar/feeds/aelh98g866kuc80d5nbfqo6u54%40group.calendar.google.com/public/full"
      };

      function refreshItem(role, url) {
        // Ignore DST and find Mozilla Standard Time
        var mst = new Date(Date.now() +
                           (new Date()).getTimezoneOffset() * 60 * 1000 +
                           Config.mvtTimezoneOffset * 60 * 60 * 1000);

        var query = new google.gdata.calendar.CalendarEventQuery(url);
        query.setMinimumStartTime(new google.gdata.DateTime(mst, true));
        query.setOrderBy("starttime");
        query.setSortOrder("ascending");
        query.setMaxResults("1");
        query.setSingleEvents(true);

        service.getEventsFeed(query, function(root) {
          self._uiCallbacks.updateCalendar(role, root.feed.getEntries());
        }, function(error) {
          self._uiCallbacks.updateCalendar(role, null, error);
        });
      }

      for (var role in items) {
        var url = items[role];
        refreshItem(role, url);
        setInterval(refreshItem, 1000 * 60 * 60 /* every hour */, role, url);
      }
    });
    google.load("gdata", "1.s");
  },

  /**
   * Extend the displayed push range by num pushes.
   * Positive num extends into the future, negative into the past.
   **/
  extendPushRange: function Controller_extendPushRange(num) {
    var currentRange = this._requestedRange || this._data.getLoadedPushRange();
    if (!currentRange)
      return;

    var requestedRange;
    if (num >= 0) {
      // Extend into the future, i.e. increase endID.
      requestedRange = {
        startID: currentRange.startID,
        endID: currentRange.endID + num,
      };
    } else {
      // Extend into the past, i.e. decrease startID.
      requestedRange = {
        startID: currentRange.startID - Math.abs(num),
        endID: currentRange.endID,
      };
    }
    var loadTracker = new LoadTracker(this._uiCallbacks.status);
    this._data.loadPushRange(requestedRange, false, loadTracker, this._uiCallbacks.handleUpdatedPush, this._uiCallbacks.handleInfraStatsUpdate, this._uiCallbacks.handleInitialPushlogLoad);
    this._requestedRange = requestedRange;
  },

  _getURLForParams: function Controller__getURLForParams(params) {
    var items = [];
    for (var key in params) {
      if (params[key] && params[key] != this._paramDefaults[key])
        items.push(escape(key) + "=" + escape(params[key]));
    }
    return items.length ? "?" + items.join("&") : "./";
  },

  _urlChanged: function Controller__urlChanged() {
    var params = this._parseParams();
    this._uiCallbacks.paramsChanged(params);
  },

  _parseParams: function Controller__parseParams() {
    // Get the parameters specified in the query string of the URL.
    var params = {};
    var search = document.location.search;
    if (search != "") {
      var items = search.substring(1).split("&"); // strip "?" and split on "&"
      for (var index in items) {
        var eqitems = items[index].split("=");
        if (eqitems.length >= 2) {
          params[unescape(eqitems[0])] = unescape(eqitems.slice(1).join("="));
        }
      }
    }
    for (var key in this._paramDefaults) {
      if (!(key in params))
        params[key] = this._paramDefaults[key];
    }
    this._params = params;
    return this.getParams();
  },

  getParams: function Controller_getParams() {
    return Object.clone(this._params);
  },

  _treeForBranch: function Controller__treeForBranch(branch) {
    for (var treeName in Config.treeInfo) {
      var tree = Config.treeInfo[treeName];
      if (("buildbotBranch" in tree) && tree.buildbotBranch == branch)
        return treeName;
    }
    return "";
  },

  _getInitialPushRangeParams: function Controller__getInitialPushRangeParams(params) {
    if ("rev" in params)
      return {
        range: { rev: params.rev },
        trackTip: false,
      };

    if ("fromchange" in params && "tochange" in params)
      return {
        range: { fromchange: params.fromchange, tochange: params.tochange },
        trackTip: false,
      };

    if ("startdate" in params && "enddate" in params)
      return {
        range: { startdate: params.startdate, enddate: params.enddate },
        trackTip: false,
      };

    return {
      range: { maxhours: 24 }, // Don't include pushes that are older than the latest push minus 24 hours.
      trackTip: true,
    };
  },

  _initialDataLoad: function Controller__initialDataLoad(initialPushRange) {
    var loadTracker = new LoadTracker(this._uiCallbacks.status);
    this._data.loadPushRange(initialPushRange, true, loadTracker, this._uiCallbacks.handleUpdatedPush, this._uiCallbacks.handleInfraStatsUpdate, this._uiCallbacks.handleInitialPushlogLoad);
  },

  refreshData: function Controller_refreshData() {
    var loadTracker = new LoadTracker(this._uiCallbacks.status);
    this._data.refresh(loadTracker, this._trackingTip, this._uiCallbacks.handleUpdatedPush, this._uiCallbacks.handleInfraStatsUpdate);
  },
};
