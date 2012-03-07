<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/ParallelLogGenerating.php';
require_once 'inc/GzipUtils.php';

/**
 * AnnotatedSummaryGenerator
 *
 * Transforms a plain text error summary into a html one where every failure
 * is annotated with orange bug suggestions.
 */

class AnnotatedSummaryGenerator implements LogGenerator {
  protected $bugsCache = array();

  public function __construct($rawSummary, $logDescription) {
    $this->rawSummary = $rawSummary;
    $this->logDescription = $logDescription;
    $this->hasLeak = false;
  }

  public function generate($log) {
    $file = GzipUtils::getLines($this->rawSummary);
    $lines = array();
    foreach ($file as $line) {
      $this->processLine($lines, $line);
    }
    if ($this->hasLeak) {
      $lines[] = "<a href=\"php/getLeakAnalysis.php?id=" . $_GET["id"] .
        "\" target=\"_blank\">Analyze the leak.</a>";
    }
    GzipUtils::writeToDb($log, implode("", $lines));
  }

  public function ensureAnnotatedSummaryExists() {
    $log = array("_id" => $this->rawSummary['_id'], "type" => "annotatedsummary");
    ParallelLogGenerating::ensureLogExists($log, $this);
    return $log;
  }

  protected function generateSuggestion($bug, $line) {
    $bug->summary = htmlspecialchars($bug->summary);
    $line = htmlspecialchars($line);
    return "<span data-bugid=\"$bug->id\" " .
                 "data-summary=\"$bug->summary\" " .
                 "data-signature=\"$this->logDescription\" " .
                 "data-logline=\"$line\" " .
                 "data-status=\"$bug->status $bug->resolution\"" .
           "></span>\n";
  }

  protected function processLine(&$lines, $line) {
    $lines[] = htmlspecialchars($line);

    $tokens = preg_split("/\s\\|\s/", $line);
    if (count($tokens) < 3)
      return;
  
    // The middle path has the test file path.
    $testPath = $tokens[1];
    $parts = preg_split("/[\\/\\\\]/", $testPath);
    if (count($parts) < 2 &&
        preg_match('/^leaked/i', $tokens[2])) {
      $this->hasLeak = true;
      return;
    }
  
    // Get the file name.
    $fileName = end($parts);
    $bugs = $this->getBugsForTestFailure($fileName);
    foreach ($bugs as $bug) {
      $lines[] = $this->generateSuggestion($bug, $line);
    }
  }

  protected function parseJSON($json) {
    require_once "inc/JSON.php";
    $engine = new Services_JSON();
    return $engine->decode($json);
  }

  protected function getBugsForTestFailure($fileName) {
    if ($fileName == '')
      return array();
    if (isset($this->bugsCache[$fileName]))
      return array();
    if ($fileName == 'automation.py') {
      // This won't generate any useful suggestions, see bug 570174
      return array();
    }
    $bugs_json = @file_get_contents("https://api-dev.bugzilla.mozilla.org/latest/bug?whiteboard=orange&summary=" . urlencode($fileName));
    if ($bugs_json !== false) {
      $bugs = $this->parseJSON($bugs_json);
      if (isset($bugs->bugs)) {
        $this->bugsCache[$fileName] = $bugs->bugs;
        return $bugs->bugs;
      }
    }
    return array();
  }
}
