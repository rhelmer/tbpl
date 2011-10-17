<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/ParallelFileGenerating.php';
require_once 'inc/GzipUtils.php';

/**
 * AnnotatedSummaryGenerator
 *
 * Transforms a plain text error summary into a html one where every failure
 * is annotated with orange bug suggestions.
 */

class AnnotatedSummaryGenerator implements FileGenerator {
  protected $bugsCache = array();

  public function __construct($rawSummaryFilename, $logDescription) {
    $this->rawSummaryFilename = $rawSummaryFilename;
    $this->logDescription = $logDescription;
  }

  public function generate($filename) {
    $file = GzipUtils::getLines($this->rawSummaryFilename);
    $lines = array();
    foreach ($file as $line) {
      $this->processLine($lines, $line);
    }
    GzipUtils::writeToFile($filename, implode("", $lines));
  }

  public function ensureAnnotatedSummaryExists() {
    $annotatedSummaryFilename = str_replace("/excerpt/", "/annotatedsummary/", $this->rawSummaryFilename);
    ParallelFileGenerating::ensureFileExists($annotatedSummaryFilename, $this);
    return $annotatedSummaryFilename;
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
      $lines[] = "<a href=\"leak-analysis/?id=" . $_GET["id"] .
        "&tree=" . $_GET["tree"] . "\" target=\"_blank\">Analyze the leak.</a>";
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
