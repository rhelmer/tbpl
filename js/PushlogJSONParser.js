/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var PushlogJSONParser = {

  load: function PushlogJSONParser_load(repoName, params, loadTracker, loadCallback) {
    var self = this;
    loadTracker.addTrackedLoad();
    $.ajax({
      url: this._getLogUrl(repoName, params),
      dataType: 'json',
      success: function (data) {
        var pushes = {};
        for (var pushID in data) {
          var push = data[pushID];

          var patches = [];
          var defaultTip;
          for (var i in push.changesets) {
            var patch = push.changesets[i];
            patch.rev = patch.node.substr(0, 12);

            // dont show the default branch and tag
            var tags = patch.tags.map(function (tag) {
              return tag != 'tip' ? {type: 'tagtag', name: tag} : null;
            }).filter(function (tag) { return tag; });
            if (patch.branch != 'default')
              tags.push({type: 'inbranchtag', name: patch.branch});
            else
              defaultTip = patch.rev;

            // The new json output includes the email adress in <brackets>
            var author = $.trim(/([^<]+)/.exec(patch.author)[1]);

            // Revert the order because we want most recent pushes / patches to
            // come first.
            patches.unshift({
              rev: patch.rev,
              author: author,
              desc: patch.desc,
              tags: tags
            });
          }

          var toprev = patches[0].rev;
          pushes[toprev] = {
            id: +pushID,
            pusher: push.user,
            date: new Date(push.date * 1000),
            toprev: toprev,
            defaultTip: defaultTip,
            patches: patches,
          };
        }
        loadCallback(pushes);
        loadTracker.loadCompleted();
      },
      error: function (request, textStatus, error) {
        loadTracker.loadFailed(textStatus);
      }
    });
  },

  _getLogUrl: function PushlogJSONParser__getLogUrl(repoName, params) {
    var url = "https://hg.mozilla.org/" + repoName + "/json-pushes?full=1";
    for (var paramName in params) {
      url += "&" + escape(paramName) + "=" + escape(params[paramName]);
    }
    return url;
  },
};
