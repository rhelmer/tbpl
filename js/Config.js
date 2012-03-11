/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var Config = {
  tinderboxDataLoader: BuildbotDBUser,
  pushlogDataLoader: PushlogJSONParser,
  defaultTreeName: "Firefox",
  mvtTimezoneOffset: -7,
  mvtTimezoneName: "PDT",
  loadInterval: 120, // seconds
  goBackPushes: 10,
  baseURL: "",
  absoluteBaseURL: "https://tbpl.mozilla.org/", // used for log links in tbplbot bugzilla comments
  useGoogleCalendar: true,
  jsonPendingOrRunningBaseURL: "http://builddata.pub.build.mozilla.org/buildjson/",
  htmlPendingOrRunningBaseURL: "http://build.mozilla.org/buildapi/",
  selfServeAPIBaseURL: "https://build.mozilla.org/buildapi/self-serve",
  alternateTinderboxPushlogURL: "http://build.mozillamessaging.com/tinderboxpushlog/?tree=",
  alternateTinderboxPushlogName: "Mozilla Messaging",
  wooBugURL: "https://tbpl.mozilla.org/php/starcomment.php", // war-on-orange database
  // treeInfo gives details about the trees and repositories. There are various
  // items that can be specified:
  //
  // - primaryRepo:    [required] The primary hg repository for the tree.
  // - otherRepo:      [optional] An additional hg repository that the tree
  //                              works with.
  // - hasGroups:      [optional] If the builders should be grouped, specify
  //                              this option. If not, leave it out.
  // - orangeFactor:   [optional] If the tree is linked to the orange factor
  //                              specify this option. If not, leave it out.
  treeInfo: {
    "Firefox": {
      primaryRepo: "mozilla-central",
      hasGroups: true,
      orangeFactor: true,
      buildbotBranch: "mozilla-central",
    },
    "Mozilla-Inbound": {
      primaryRepo: "integration/mozilla-inbound",
      hasGroups: true,
      buildbotBranch: "mozilla-inbound",
    },
    "Try": {
      primaryRepo: "try",
      hasGroups: true,
      buildbotBranch: "try",
    },
    "Mozilla-Aurora": {
      primaryRepo: "releases/mozilla-aurora",
      hasGroups: true,
      orangeFactor: true,
      buildbotBranch: "mozilla-aurora",
    },
    "Mozilla-Beta": {
      primaryRepo: "releases/mozilla-beta",
      hasGroups: true,
      orangeFactor: true,
      buildbotBranch: "mozilla-beta",
    },
    "Mozilla-Release": {
      primaryRepo: "releases/mozilla-release",
      hasGroups: true,
      buildbotBranch: "mozilla-release",
    },
    "Mozilla-Esr10": {
      primaryRepo: "releases/mozilla-esr10",
      hasGroups: true,
      buildbotBranch: "mozilla-esr10",
    },
    "Firefox3.6": {
      primaryRepo: "releases/mozilla-1.9.2",
      buildbotBranch: "mozilla-1.9.2",
    },
    // project/integration branches
    "Jetpack": {
      primaryRepo: "projects/addon-sdk",
      hasGroups: true,
      buildbotBranch: "addon-sdk",
      prettierName: "Addon-SDK",
    },
    "Build-System": {
      primaryRepo: "projects/build-system",
      hasGroups: true,
      buildbotBranch: "build-system",
    },
    "Fx-Team": {
      primaryRepo: "integration/fx-team",
      hasGroups: true,
      buildbotBranch: "fx-team",
    },
    "Graphics": {
      primaryRepo: "projects/graphics",
      hasGroups: true,
      buildbotBranch: "graphics",
    },
    "Ionmonkey": {
      primaryRepo: "projects/ionmonkey",
      hasGroups: true,
      buildbotBranch: "ionmonkey",
    },
    "Jaegermonkey": {
      primaryRepo: "projects/jaegermonkey",
      hasGroups: true,
      buildbotBranch: "jaegermonkey",
      prettierName: "JägerMonkey",
    },
    "Profiling": {
      primaryRepo: "projects/profiling",
      hasGroups: true,
      buildbotBranch: "profiling",
    },
    "Services-Central": {
      primaryRepo: "services/services-central",
      hasGroups: true,
      buildbotBranch: "services-central",
    },
    "UX": {
      primaryRepo: "projects/ux",
      hasGroups: true,
      buildbotBranch: "ux",
    },
    // rental twigs
    "Alder": {
      primaryRepo: "projects/alder",
      hasGroups: true,
      buildbotBranch: "alder",
    },
    "Ash": {
      primaryRepo: "projects/ash",
      hasGroups: true,
      buildbotBranch: "ash",
    },
    "Birch": {
      primaryRepo: "projects/birch",
      hasGroups: true,
      buildbotBranch: "birch",
    },
    "Cedar": {
      primaryRepo: "projects/cedar",
      hasGroups: true,
      buildbotBranch: "cedar",
    },
    "Elm": {
      primaryRepo: "projects/elm",
      hasGroups: true,
      buildbotBranch: "elm",
    },
    "Holly": {
      primaryRepo: "projects/holly",
      hasGroups: true,
      buildbotBranch: "holly",
    },
    "Larch": {
      primaryRepo: "projects/larch",
      hasGroups: true,
      buildbotBranch: "larch",
    },
    "Maple": {
      primaryRepo: "projects/maple",
      hasGroups: true,
      buildbotBranch: "maple",
    },
    "Oak": {
      primaryRepo: "projects/oak",
      hasGroups: true,
      buildbotBranch: "oak",
    },
    "Pine": {
      primaryRepo: "projects/pine",
      hasGroups: true,
      buildbotBranch: "pine",
    },
    // deathwatch
    "Accessibility": {
      primaryRepo: "projects/accessibility",
      hasGroups: true,
      buildbotBranch: "accessibility",
    },
    "Devtools": {
      primaryRepo: "projects/devtools",
      hasGroups: true,
      buildbotBranch: "devtools",
    },
    "Electrolysis": {
      primaryRepo: "projects/electrolysis",
      hasGroups: true,
      buildbotBranch: "electrolysis",
    },
    "Places": {
      primaryRepo: "projects/places",
      hasGroups: true,
      orangeFactor: true,
      buildbotBranch: "places",
    },
  },
  groupedMachineTypes: {
    "Mochitest" : ["Mochitest"],
    "Reftest" : ["Crashtest", "Crashtest-IPC",
      "Reftest-OpenGL",
      "Reftest", "Reftest Unaccelerated", "Reftest-IPC", "JSReftest"],
    "SpiderMonkey" : ["SpiderMonkey DTrace", "SpiderMonkey --disable-methodjit",
      "SpiderMonkey --disable-tracejit", "SpiderMonkey Shark",
      "SpiderMonkey --enable-sm-fail-on-warnings"],
    "Talos Performance" : ["Talos sspider", "Talos winopen", "Talos pan",
      "Talos dhtml", "Talos ts", "Talos zoom", "Talos dromaeo", "Talos svg",
      "Talos tp nochrome", "Talos tp", "Talos tp4", "Talos nochrome",
      "Talos dirty", "Talos chrome", "Talos paint", "Talos xperf", "Talos v8",
      "Talos Performance"]
  },
  OSNames: {
    "linux": "Linux",
    "linux64": "Linux64",
    "osx":"OS X",
    "osx64": "OS X64",
    "osxlion" : "OS X 10.7",
    "windows": "Win",
    "windows7-64": "Win64",
    "windowsxp": "WinXP",
    "android-xul": "Android XUL",
    "android": "Android",
    "maemo4": "Maemo 4",
    "maemo5": "Maemo 5"
  },
  buildNames: {
    "Build" : "B",
    "Qt Build" : "Bq",
    "Qt XULRunner" : "Xrq",
    "XULRunner" : "Xr",
    "Mobile Desktop Build" : "Bm",
    "SpiderMonkey" : "SM",
    "SpiderMonkey DTrace" : "d",
    "SpiderMonkey --disable-methodjit" : "¬m",
    "SpiderMonkey --disable-tracejit" : "¬t",
    "SpiderMonkey Shark" : "s",
    "SpiderMonkey --enable-sm-fail-on-warnings" : "e",
    "Nightly" : "N",
    "Shark Nightly" : "Ns",
    "Mobile Desktop Nightly" : "Nm",
    "Maemo Qt Nightly" : "Nq",
    "RPM Nightly" : "Nr"
  },
  testNames: {
    "Mochitest" : "M",
    "Crashtest-IPC" : "Cipc",
    "Crashtest" : "C",
    "Reftest-OpenGL" : "RGL",
    "Reftest Unaccelerated" : "Ru",
    "Reftest-IPC" : "Ripc",
    "Reftest" : "R",
    "JSReftest" : "J",
    "XPCShellTest" : "X",
    "Talos Performance" : "T",
    "Talos v8" : "v",
    "Talos dromaeo" : "dr",
    "Talos svg" : "s",
    "Talos nochrome" : "n",
    "Talos tp" : "tp",
    "Talos tp4" : "tp4",
    "Talos dirty" : "di",
    "Talos chrome" : "c",
    "Talos paint" : "p",
    "Talos sspider" : "sp",
    "Talos winopen" : "w",
    "Talos pan" : "pn",
    "Talos dhtml" : "dh",
    "Talos ts" : "ts",
    "Talos zoom" : "z",
    "Talos xperf" : "x",
    "Talos tp nochrome" : "tpn",
    "Jetpack mozilla-central" : "m-c",
    "Jetpack mozilla-aurora" : "m-a",
    "Jetpack mozilla-beta" : "m-b",
    "Jetpack mozilla-release" : "m-r",
    "Jetpack SDK Test" : "JP",
    "Mozmill" : "Z",
    "Valgrind": "V",
    "Unit Test" : "U"
  },
};

Config.resultNames = {};
(function() {
  for (var b in Config.buildNames) {
    Config.resultNames[b] = Config.buildNames[b];
  }
  for (var t in Config.testNames) {
    Config.resultNames[t] = Config.testNames[t];
  }
})();
