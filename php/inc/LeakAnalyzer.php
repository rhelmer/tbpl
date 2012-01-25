<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/ParallelLogGenerating.php';
require_once 'inc/GzipUtils.php';
require_once 'inc/RawGzLogDownloader.php';

class LeakAnalyzer implements LogGenerator {
  private $lines = null;

  public function __construct($run) {
    $this->run = $run;
  }

  public function ensureLogExists() {
    $log = array("_id" => $this->run['_id'], "type" => 'leakanalysis');
    ParallelLogGenerating::ensureLogExists($log, $this);
    return $log;
  }

  public function generate($log) {
    GzipUtils::writeToDb($log, $this->getLog());
  }

  public function getLog() {
    $windows = array();
    $lastTestName = '';
    $result = '';
    $lines = $this->getLines();
    
    foreach ($lines as $line) {
      $testName = $this->getTestName($line);
      if ($testName) {
        // "Shutdown" isn't a helpful testname, especially to carry over from
        // mochitest-chrome to mochitest-browser-chrome's startup.
        if ($testName != "Shutdown") {
          $lastTestName = $testName;
        } else {
          $lastTestName = '(unknown)';
        }
        continue;
      }
      if (preg_match("/\+\+DOMWINDOW.*\(([0-9a-fx]+)\)\s*\[serial = (\d+)\]/i", $line, $matches)) {
        $windows[$matches[1] . '-' . $matches[2]] = $lastTestName;
      } else if (preg_match("/--DOMWINDOW.*\(([0-9a-fx]+)\)\s*\[serial = (\d+)\]/i", $line, $matches)) {
        unset($windows[$matches[1] . '-' . $matches[2]]);
      }
    }
    
    // Reverse the array to get a mapping of test name to number of DOMWINDOWS leaked
    $leaks = array();
    foreach ($windows as $id => $testName) {
      if (!isset($leaks[$testName])) {
        $leaks[$testName] = 0;
      }
      ++$leaks[$testName];
    }
    if (count($leaks)) {
      foreach ($leaks as $testName => $num) {
        $result .= "<div style=\"color: red;\">$testName leaked $num DOMWINDOW(s)</div>";
        // Heuristic for bug 538462
        if (preg_match("/test_unknownContentType_dialog_layout\.xul$/", $testName)) {
          $result .= "<p>(This is <a href=\"https://bugzilla.mozilla.org/show_bug.cgi?id=538462\">bug 538462</a>.)</p>";
        }
      }
    } else {
      $result = "<div style=\"color: green;\">No DOMWINDOWs leaked!</div>";
    }
    return $result;
  }

  public function getLines() {
    if ($this->lines === null) {
      $this->lines = RawGzLogDownloader::getLines($this->run);
    }
    return $this->lines;
  }

  private function getTestName($line) {
    $line = trim($line);
    // reftest, crashtest, jsreftest
    if (preg_match("/^REFTEST TEST-START \| ([^ ]+)$/", $line, $matches)) {
      return $matches[1];
    // mochitest-plain, mochitest-chrome
    } else if (preg_match("/^\d+ INFO TEST-START \| ([^ ]+)$/", $line, $matches)) {
      return $matches[1];
    // mochitest-browser-chrome
    } else if (preg_match("/^TEST-START \| ([^ ]+)$/", $line, $matches)) {
      return $matches[1];
    // xpcshell
    } else if (preg_match("/^TEST-INFO \| ([^ ]+) \| running test ...$/", $line, $matches)) {
      return $matches[1];
    } else {
      return null;
    }
  }
}
