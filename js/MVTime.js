/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MVTime = {
  daylightTZ: { offset: -7, name: "PDT" },
  standardTZ: { offset: -8, name: "PST" },

  get timezone() {
    return this.isDST(Date.now()) ? this.daylightTZ : this.standardTZ;
  },

  // Returns true if the given date is in Daylight Saving Time in
  // Mountain View.  This is valid for dates from 2007 to the present (2012).
  // It will need to be adjusted if US Daylight Saving Time changes again.
  isDST: function MVTime_isDST(value) {
    var date = new Date(value);
    var year = date.getUTCFullYear();

    // DST starts on the second Sunday in March at 10:00 UTC.
    var startDate = new Date(year+"-03-14T10:00Z");
    startDate.setUTCDate(14 - startDate.getUTCDay());

    // DST ends on the first Sunday in November at 09:00 UTC.
    var endDate = new Date(year+"-11-07T09:00Z");
    endDate.setUTCDate(7 - endDate.getUTCDay());

    return date >= startDate && date < endDate;
  },

  test: function MVTime_test() {
    var tests = [
      ["2012-01-01T00:00Z", false],
      ["2012-02-29T12:30Z", false],
      ["2012-03-04T09:59Z", false],
      ["2012-03-04T10:00Z", false],
      ["2012-03-11T09:59Z", false],

      ["2012-03-11T10:00Z", true],
      ["2012-03-11T10:59Z", true],
      ["2012-03-11T11:00Z", true],
      ["2012-03-12T00:00Z", true],
      ["2012-03-12T10:00Z", true],
      ["2012-03-18T00:00Z", true],
      ["2012-04-01T00:00Z", true],
      ["2012-06-15T08:00Z", true],
      ["2012-11-03T20:20Z", true],
      ["2012-11-04T08:59Z", true],

      ["2012-11-04T09:00Z", false],
      ["2012-11-05T01:00Z", false],
      ["2012-11-11T01:00Z", false],
      ["2012-11-11T12:00Z", false],

      ["2013-12-09T23:00Z", false],
      ["2008-09-09T11:00Z", true]
    ];
    var failures = [];
    var self = this;
    tests.forEach(function(test) {
      var date = test[0];
      var expected = test[1];
      if (self.isDST(date) != expected)
        failures.push(date);
    });
    return failures;
  }
};
