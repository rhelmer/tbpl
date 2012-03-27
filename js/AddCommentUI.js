/* -*- Mode: JS; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

"use strict";

var AddCommentUI = {

  addToBugs: {},
  numSendingComments: 0,
  numSendingCommentChangedCallback: function empty() {},
  numSendingBugs: 0,
  numSendingBugChangedCallback: function empty() {},

  init: function AddCommentUI_init(submitURL) {
    var self = this;
    $("a.addNote").live("click", function addNoteLinkClick() {
      self.openCommentBox();
      return false;
    });
    $("#autoStar").live("click", function autoStarClick() {
      self.commentWithoutUI();
    });
    this.updateAutoStarState();
    $("#logNoteEmail").bind("change", function logNoteEmailChange() {
      self._setEmail(this.value);
    });
    $("#logNoteEmail").val(self._getEmail());
    $("#addNotePopup").get(0).afterCloseCallback = function resetAfterClosed() {
      self.reset();
    };

    $.event.props.push("dataTransfer");
    $("#addNotePopup").bind("dragover", function (e) { e.preventDefault(); });
    $("#addNotePopup").bind("drop", function addNoteDropHandler(e) {
      var id = e.dataTransfer.getData("text/x-tbpl-resultid");
      if (id) {
        UserInterface._selectedBuilds[id] = true;
        self.updateUI();
      } else {
        var rev = e.dataTransfer.getData("text/x-tbpl-revision");
        if (rev)
          UserInterface._toggleSelectedRev(rev, true);
      }
      return false;
    });

    $("#addNoteForm").bind("submit", function addNoteFormSubmit() {
      self.submit();
      $("#addNotePopup").fadeOut('fast', function afterAddNotePopupFadeOutAfterSubmit() {
        self.reset();
        UserInterface._markSelected();
      });
      return false;
    });

    $("#logNoteText").bind("keyup", function logNoteTextKeypress(e) {
      // Control+Enter submits the form
      if (e.which == 13 && (e.ctrlKey || e.metaKey)) {
        $("#addNoteForm").submit();
        return false;
      }
    });

    // Defeat the keep-text-on-reload feature, because it results in
    // comments containing changesets that are no longer selected.
    $("#logNoteText").val('');
  },

  updateUI: function AddCommentUI_updateUI() {
    this._updateBuildList();
    this._updateLogLinkText();
    this._updateSubmitButton();
    this._updateSuggestions();
  },

  reset: function AddCommentUI_reset() {
    $("#logNoteText").val('');
    UserInterface._selectedBuilds = {};
    UserInterface._selectedRevs = {};
    this.addToBugs = {};
    this.updateUI();
  },

  submit: function AddCommentUI_submit() {
    var self = this;
    var data = Controller.getData();
    var email = $("#logNoteEmail").val();
    var comment = $("#logNoteText").val();
    var builds = Object.keys(UserInterface._selectedBuilds);
    builds.forEach(function(id) {
      var result = data.getMachineResult(id);
      self._postOneComment(email, comment, result, function oneLessCommentPending() {
        self.pendingCommentsChanged(-1, result);
      });
      self.pendingCommentsChanged(1);
    });
    var bugsSubmitData = {};
    builds.forEach(function (i) {
      var machineResult = data.getMachineResult(i);
      if (!machineResult.suggestions)
        return;
      for (var j = 0; j < machineResult.suggestions.length; ++j) {
        var suggestion = machineResult.suggestions[j];
        if (!(suggestion.id in self.addToBugs))
          continue;
        bugsSubmitData[suggestion.id] = {
          header: suggestion.signature,
          log: suggestion.log,
          email: email.replace("@", "%"),
          slave: machineResult.slave,
          logLink: machineResult.absoluteBriefLogURL
        };
      }
    });
    for (var id in bugsSubmitData) {
      this._postOneBug(id, bugsSubmitData[id], function oneLessBugPending() {
        self.pendingBugsChanged(-1);
      });
      this.pendingBugsChanged(1);
    }
    this.clearAutoStarBugs();
    this.reset();
  },

  openCommentBox: function AddCommentUI_openCommentBox() {
    $("#addNotePopup").fadeIn('fast');
    if (UserInterface._activeResult)
      UserInterface._toggleSelectedBuild(UserInterface._activeResult);
    var focusTextfield = ($("#logNoteEmail").val() ? $("#logNoteText") : $("#logNoteEmail")).get(0);
    focusTextfield.focus();
    focusTextfield.select();
    this.updateUI();
  },

  commentWithoutUI: function AddCommentUI_commentWithoutUI() {
    if (this._popupIsOpen() || !$("#autoStar").hasClass("active"))
      return;
    UserInterface._selectedBuilds[UserInterface._activeResult] = true;
    this.updateUI();
    var submit = $("#addNoteForm input[type=submit]");
    if (!submit.get(0).disabled) {
      this.submit();
      $("#autoStar").removeClass("active");
    }
  },

  clearAutoStarBugs: function AddCommentUI_clearAutoStarBugs() {
    for (var bugid in this.addToBugs) {
      this.removeFromBug(bugid);
    }
  },

  shouldAutoStarBug: function AddCommentUI_shouldAutoStarBug(bugid) {
    return bugid in this.addToBugs;
  },

  updateAutoStarState: function AddCommentUI_updateAutoStarState() {
    var autoStar = $("#autoStar");
    if (Object.keys(this.addToBugs).length) {
      autoStar.addClass("active");
      autoStar.attr("title", "Click to star this orange using the suggestions selected");
    } else {
      autoStar.removeClass("active");
      autoStar.attr("title", "Select an orange, click on the star icons next to " +
                             "suggestions, and click this icon to star the orange " +
                             "using those suggestions in one step");
    }
  },

  pendingCommentsChanged: function AddCommentUI_pendingCommentsChanged(changedBy, result) {
    this.numSendingComments += changedBy;
    this.numSendingCommentChangedCallback(result);
  },

  registerNumSendingCommentChangedCallback: function AddCommentUI_registerNumSendingCommentChangedCallback(callback) {
    this.numSendingCommentChangedCallback = callback;
  },

  pendingBugsChanged: function AddCommentUI_pendingBugsChanged(changedBy) {
    this.numSendingBugs += changedBy;
    this.numSendingBugChangedCallback();
  },

  registerNumSendingBugChangedCallback: function AddCommentUI_registerNumSendingBugChangedCallback(callback) {
    this.numSendingBugChangedCallback = callback;
  },

  markSuggestedBug: function AddCommentUI_markSuggestedBug(bugid) {
    var commentSuggestion = $('#logNoteSuggestions a[data-id=' + bugid + ']');
    var resultSuggestion = $(".stars .summary [data-bugid=" + bugid + "] .starSuggestion");
    if (bugid in this.addToBugs) {
      commentSuggestion.addClass('added');
      resultSuggestion.addClass('active');
    } else {
      commentSuggestion.removeClass('added');
      resultSuggestion.removeClass('active');
    }
    this.updateAutoStarState();
  },

  addToBug: function AddCommentUI_addToBug(bugid) {
    this.addToBugs[bugid] = true;

    var box = $("#logNoteText");
    var comment = box.val();
    if (comment == '')
      box.val("Bug " + bugid);
    else
      box.val(comment + ", bug " + bugid);

    this.markSuggestedBug(bugid);
  },

  removeFromBug: function AddCommentUI_removeFromBug(bugid) {
    delete this.addToBugs[bugid];

    var box = $("#logNoteText");
    var comment = box.val();
    box.val(comment.replace(new RegExp("(, )?[bB]ug " + bugid), ""));

    this.markSuggestedBug(bugid);
  },

  toggleSuggestion: function AddCommentUI_toggleSuggestion(id) {
    if (id in this.addToBugs)
      this.removeFromBug(id);
    else
      this.addToBug(id);
  },

  _getEmail: function AddCommentUI__getEmail() {
    return storage.email || "";
  },

  _setEmail: function AddCommentUI__setEmail(email) {
    storage.email = email;
  },

  _updateSubmitButton: function AddCommentUI__updateSubmitButton() {
    $("#addNoteForm input[type=submit]").get(0).disabled = this._buildListIsEmpty();
  },

  _updateBuildList: function AddCommentUI__updateBuildList() {
    var html = "";
    for (var i in UserInterface._selectedBuilds) {
      // Ignore jobs that have not finished
      var result = Controller.getData().getMachineResult(i);
      if (result)
        html += UserInterface._machineResultLink(result);
    }
    html = html ? html + "&nbsp;(drag additional builds here)"
                : "(none selected - drag builds here)";
    $("#logNoteRuns").html(html);
    UserInterface._markActiveResultLinks();
    UserInterface._markSelected();
  },

  _updateSuggestions: function AddCommentUI__updateSuggestions() {
    $("#logNoteSuggestions").empty();
    var added = false;
    for (var i in UserInterface._selectedBuilds) {
      added = true;
      UserInterface._addSuggestionLink(Controller.getData().getMachineResult(i),
                                       $("#logNoteSuggestions"));
    }
    if (added)
      $("#suggestions").show();
    else
      $("#suggestions").hide();
  },

  _updateLogLinkText: function AddCommentUI__updateLogLinkText() {
    $("a.addNote").text(
      !this._popupIsOpen() ? "add a comment" :
        (UserInterface._selectedBuilds[UserInterface._activeResult] ? "don't add the comment to this build" :
                                          "add the comment to this build, too"));
  },

  _buildListIsEmpty: function AddCommentUI__buildListIsEmpty() {
    for (var i in UserInterface._selectedBuilds)
      return false;
    return true;
  },

  addRevToComment: function AddCommentUI_addRevToComment(rev) {
    // Add the revision hash to the comment on a line by itself, but only if it
    // does not appear in the comment already
    var box = $("#logNoteText");
    var text = box.val();
    if (text.indexOf(rev) == -1) {
      if (text.match(/[^\n]$/))
        box.val(text + "\n" + rev + "\n");
      else
        box.val(text + rev + "\n");
    }
  },

  removeRevFromComment: function AddCommentUI_removeRevFromComment(rev) {
    // Remove whole line containing the given rev, if it exists
    var box = $("#logNoteText");
    // Note that /./ never matches a newline in JS
    box.val(box.val().replace(new RegExp(".*" + rev + ".*\n?", ""), ""));
  },

  _popupIsOpen: function AddCommentUI__popupIsOpen() {
    return $("#addNotePopup").is(":visible");
  },

  _postOneComment: function AddCommentUI__postOneComment(email, comment, machineResult, callback) {
    var d = machineResult.startTime;
    $.ajax({
      url: Config.wooBugURL,
      type: "POST",
      data: {
        buildname: machineResult.machine.name,
        machinename: machineResult.slave,
        os: machineResult.machine.os,
        date: d.getUTCFullYear() + "-" +
              (d.getUTCMonth() < 9 ? "0" : "") + (d.getUTCMonth() + 1) + "-" +
              (d.getUTCDate() < 10 ? "0" : "") + d.getUTCDate(),
        type: machineResult.machine.type,
        buildtype: machineResult.machine.flavor,
        starttime: machineResult.startTime.getTime() / 1000,
        logfile: machineResult.runID,
        tree: Config.treeInfo[machineResult.tree].primaryRepo,
        rev: machineResult.revs[Config.treeInfo[machineResult.tree].primaryRepo],
        who: email,
        comment: comment,
        timestamp: Math.ceil((new Date()).getTime()/1000),
      },
    });

    if ("errorParser" in machineResult) {
      // "errorParser" is a give-away of Tinderbox mode.
      // Also post the star to Tinderbox.
      $.ajax({
        url: "http://tinderbox.mozilla.org/addnote.cgi",
        type: "POST",
        data: {
          buildname: machineResult.machine.name,
          buildtime: machineResult.startTime.getTime() / 1000,
          errorparser: machineResult.errorParser,
          logfile: machineResult.runID,
          tree: machineResult.tree,
          who: email,
          note: comment,
        },
      });
    }

    $.ajax({
      url: Config.baseURL + "php/submitBuildStar.php",
      type: "POST",
      data: {
        id: machineResult.runID,
        who: email,
        note: comment,
        machinename: machineResult.slave,
        starttime: machineResult.startTime.getTime() / 1000,
      },
      complete: callback,
    });

    machineResult.notes.push({
      who: email,
      note: comment,
      timestamp: new Date().getTime() / 1000,
    });
  },

  _postOneBug: function AddCommentUI__postOneBug(id, data, callback) {
    $.ajax({
      url: Config.baseURL + "php/submitBugzillaComment.php",
      type: "POST",
      data: {
        id: id,
        comment:
          data.email + "\n" +
          data.logLink + "\n" +
          data.header + "\n" +
          "slave: " + data.slave + "\n\n" +
          data.log,
      },
      complete: callback,
    });
  },

};
