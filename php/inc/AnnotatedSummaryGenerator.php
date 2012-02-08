<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/ParallelLogGenerating.php';
require_once 'inc/GzipUtils.php';
require_once 'inc/Timer.php';
require_once 'inc/JSON.php';

/**
 * AnnotatedSummaryGenerator
 *
 * Transforms a plain text error summary into a html one where every failure
 * is annotated with orange bug suggestions.
 */

class AnnotatedSummaryGenerator implements LogGenerator {
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

  static $ignore = array('',
    'automation.py', // This won't generate any useful suggestions, see bug 570174
    'Main app process exited normally',
    'automationutils.processLeakLog()'
  );

  protected function getBugsForTestFailure($fileName) {
    if (in_array($fileName, self::$ignore))
      return array();

    global $db;
    $engine = new Services_JSON();
    $stmt = $db->prepare("
      SELECT json
      FROM bugscache
      WHERE filename=:filename");
    $stmt->execute(array(":filename" => $fileName));
    $result = $stmt->fetchColumn();
    if ($result)
      return $engine->decode($result);
    // else: fetch it from bugzilla
    $t = new Timer();
    $bugs_json = @file_get_contents("https://api-dev.bugzilla.mozilla.org/latest/bug?whiteboard=orange&summary=" . urlencode($fileName));
    $t->log('fetching bugs for "'.$fileName.'"');
    if ($bugs_json === false)
      return array();
    $bugs = $engine->decode($bugs_json);
    $bugs = isset($bugs->bugs) ? $bugs->bugs : array();
    $bugs = array_map(function ($bug) {
      $obj = new StdClass();
      $obj->id = $bug->id;
      $obj->summary = $bug->summary;
      $obj->status = $bug->status;
      $obj->resolution = $bug->resolution;
      return $obj;
    }, $bugs);
    
    // and save it in the database
    $stmt = $db->prepare("
      INSERT INTO bugscache (filename, json)
      VALUES (:filename, :json);");
    try {
      $stmt->execute(array(":filename" => $fileName, ":json" => $engine->encode($bugs)));
    } catch (Exception $e) {
      // another process was faster, nevermind
    }

    return $bugs;
  }
}
