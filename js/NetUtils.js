/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var NetUtils = {
  loadText: function NetUtils_loadText(url, loadCallback, failCallback, timeoutCallback, timeout) {
    return this._loadText(url, 'GET', null, null, false, loadCallback, failCallback, timeoutCallback, timeout);
  },

  loadTextWithCredentials: function NetUtils_loadText(url, loadCallback, failCallback, timeoutCallback, timeout) {
    return this._loadText(url, 'GET', null, null, true, loadCallback, failCallback, timeoutCallback, timeout);
  },

  _loadText: function NetUtils__loadText(url, method, requestHeaders, requestBody, withCredentials, loadCallback, failCallback, timeoutCallback, timeout) {
    if (!timeout) {
      timeout = 600; // seconds
    }

    var errorTimer;
    var req = new XMLHttpRequest();
    req.onerror = function requestFailed(e) {
      clearTimeout(errorTimer);
      failCallback(e);
    };
    req.onload = function requestLoaded() {
      clearTimeout(errorTimer);
      loadCallback(req.responseText);
    };
    try {
      req.open(method, url, true); 
      req.withCredentials = withCredentials;
      if (requestHeaders) {
        for (var k in requestHeaders) {
          req.setRequestHeader(k, requestHeaders[k]);
        }
      }
      if (requestBody) {
        req.send(requestBody);
      } else {
        req.send();
      }
    } catch (e) {
      window.tinderboxException = e;
      failCallback(e);
      return;
    }
    errorTimer = setTimeout(function requestTimedOut() {
      window.tinderboxException = "timed out";
      req.abort();
      timeoutCallback();
    }, timeout * 1000);
    return req;
  },

  crossDomainPostWithCredentials: function NetUtils_crossDomainPostWithCredentials(url, requestHeaders, values, loadCallback, failCallback, timeoutCallback, timeout) {
    function hex(i) {
      return (i < 16 ? '0' : '') + i.toString(16);
    }

    function enc(s) {
      // Encodes s as a US-ASCII application/x-www-form-urlencoded string.
      return String(s).replace(/[^\0-\x7f]/g, function(c) { return '&#' + c.charCodeAt(0) + ';' })
                      .replace(/[^ 0-9A-Za-z$_.!*'()-]/g, function(c) { return '%' + hex(c) })
                      .replace(/ /g, '+');
    }

    var body;
    if (values) {
      var pairs = Object.keyValuePairs(values);
      body = pairs.map(function(p) { return enc(p[0]) + '=' + enc(p[1]) })
                  .join('&');
    }

    var headers = requestHeaders ? Object.clone(requestHeaders) : { };
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if ('_charset_' in headers) {
      headers._charset_ = 'US-ASCII';
    }

    return this._loadText(url, 'POST', headers, body, true, loadCallback, failCallback, timeoutCallback, timeout);
  },

};
