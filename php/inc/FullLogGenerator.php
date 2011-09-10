<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

/**
 * This class generates "parsed full logs", i.e. html files containing the
 * unabridged log, with a summary at the top that has links to lines with
 * errors.
 */

require_once 'inc/ParsedLogGenerator.php';
require_once 'inc/LogParser.php';

class FullLogGenerator extends ParsedLogGenerator {

  protected function getType() {
    return "full";
  }

  private function encodeLines($lines) {
    $numLines = count($lines);
    $encodedLines = array($numLines);
    for ($i = 0; $i < $numLines; $i++) {
      $encodedLines[$i] = htmlspecialchars($lines[$i]);
    }
    return $encodedLines;
  }

  private function linkLinesWithErrors(&$lines, $linesWithErrors) {
    foreach ($linesWithErrors as $errorNumber => $lineWithError) {
      $lines[$lineWithError] = '<strong id="error'.$errorNumber.'">'.$lines[$lineWithError].'</strong>';
    }
  }
  
  private function mergeToPRE($lines) {
    return '<pre>'.implode("", $lines).'</pre>';
  }

  protected function getLog() {
    $lines = $this->logParser->getLines();
    $numLines = count($lines);
    $linesWithErrors = $this->logParser->getFilteredLines();
    $transformedLines = $this->encodeLines($lines);
    $this->linkLinesWithErrors($transformedLines, $linesWithErrors);
    return $this->mergeToPRE($transformedLines);
  }

  protected function generateHTML($summary, $fullLog) {
    $lines = $this->logParser->getLines();
    $linesWithErrors = $this->logParser->getFilteredLines();
    date_default_timezone_set('America/Los_Angeles');
    $logDescription = $this->machineType.' on '.date("Y-m-d H:i:s T", $this->startTime);
    $revLink = '<a href="../?branch='.$this->branch.'&rev='.$this->revision.'">push '.$this->revision.'</a>';
    return "<!DOCTYPE html>\n".
      "<html lang=\"en\">\n".
      "<title>Full Log - ".$logDescription."</title>\n".
      "<h1>Full Log</h1>\n".
      '<p class="subtitle">'.$logDescription." for ".$revLink."</p>\n".
      '<p class="downloadRawLog"><a href="'.$this->logURL.'">Download Raw Log</a></p>'.
      (count($linesWithErrors) > 0 ? 
          "<h2>Summary</h2>\n<pre>".$summary."</pre>\n" :
          "<p>No errors or warnings found.</p>\n").
      "<h2>Full Log</h2>\n".
      "<pre>".$fullLog."</pre>";
  }
}
