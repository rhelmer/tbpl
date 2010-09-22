/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

var Config = {
  tinderboxDataLoader: TinderboxJSONUser,
  pushlogDataLoader: PushlogJSONParser,
  defaultTreeName: "Firefox",
  mvtTimezoneOffset: -7,
  mvtTimezoneName: "PDT",
  loadInterval: 120, // seconds
  baseURL: "",
  repoNames: {
    "Firefox": "mozilla-central",
    "Firefox3.6": "releases/mozilla-1.9.2",
    "Firefox3.5": "releases/mozilla-1.9.1",
    "Firefox-Lorentz": "projects/firefox-lorentz",
    "TraceMonkey": "tracemonkey",
    "Jaegermonkey": "projects/jaegermonkey",
    "Electrolysis": "projects/electrolysis",
    "Places": "projects/places",
    "Mobile": "mozilla-central",
    "MozillaTry": "try",
    "AddonsMgr": "projects/addonsmgr",
    "Birch": "projects/birch",
    "Cedar": "projects/cedar",
    "Maple": "projects/maple",
  },
  // Trees that have split mochitests like M(12345).
  treesWithGroups: [
    "Firefox",
    "TraceMonkey",
    "Jaegermonkey",
    "Electrolysis",
    "Places",
    "AddonsMgr",
    "MozillaTry",
    "Birch",
    "Cedar",
    "Maple",
  ],
  groupedMachineTypes: {
    "Mochitest" : ["Mochitest"],
    "Reftest" : ["Crashtest", "Reftest-Direct2D", "Reftest-Direct3D",
      "Reftest-OpenGL", "Reftest", "JSReftest"]
  },
  OSNames: {
    "linux": "Linux",
    "linux64": "Linux64",
    "osx":"OS X",
    "osx64": "OS X64",
    "windows": "Win",
    "windows7-64": "Win64",
    "windowsxp": "WinXP",
    "android": "Android",
    "maemo4": "Maemo 4",
    "maemo5": "Maemo 5"
  },
  testNames: {
    "Build" : "B",
    "Nightly" : "N",
    "Mochitest" : "M",
    "Crashtest" : "C",
    "Reftest-Direct2D" : "R2D",
    "Reftest-Direct3D" : "R3D",
    "Reftest-OpenGL" : "RGL",
    "Reftest" : "R",
    "JSReftest" : "J",
    "XPCShellTest" : "X",
    "Talos Performance" : "T",
    "Unit Test" : "U"
  },
  talosTestNames: [
   " a11y",
    "tdhtml",
    "tdhtml_nochrome",
    "tp4",
    "tp4_memset",
    "tp4_pbytes",
    "tp4_rss",
    "tp4_shutdown",
    "tp4_xres",
    "dromaeo_basics",
    "dromaeo_css",
    "dromaeo_dom",
    "dromaeo_jslib",
    "dromaeo_sunspider",
    "dromaeo_v8",
    "tsspider",
    "tsspider_nochrome",
    "tgfx",
    "tgfx_nochrome",
    "tscroll",
    "tsvg",
    "tsvg_opacity",
    "ts",
    "ts_cold",
    "ts_cold_generated_max",
    "ts_cold_generated_max_shutdown",
    "ts_cold_generated_med",
    "ts_cold_generated_med_shutdown",
    "ts_cold_generated_min",
    "ts_cold_generated_min_shutdown",
    "ts_cold_shutdown",
    "ts_places_generated_max",
    "ts_places_generated_max_shutdown",
    "ts_places_generated_med",
    "ts_places_generated_med_shutdown",
    "ts_places_generated_min",
    "ts_places_generated_min_shutdown",
    "ts_shutdown",
    "twinopen"
  ]
};
