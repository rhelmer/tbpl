<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

/**
 * This class generates "parsed short logs", i.e. html files containing only
 * parts of the original log. The generated html file has a summary part at
 * the top listing only lines with errors, and a log part below that which
 * shows 40 lines of context for every error.
 */

require_once 'inc/ParsedLogGenerator.php';
require_once 'inc/LogParser.php';

class ShortLogGenerator extends ParsedLogGenerator {

  protected function getType() {
    return "short";
  }

  // Returns an array of ranges ("chunks") where each chunk has a start line
  // number and an end line number. Chunks are at least $context * 2 lines long
  // ($context lines before the error line, the error line itself, and
  // $context - 1 lines after the error line), except if the error line is
  // close to the start or end of the log. Chunks for different error lines
  // are merged if they overlap or are not separated by more than $snap lines.
  protected function getShortLogChunks($context = 40, $snap = 3) {
    $lines = $this->logParser->getLines();
    $linesWithErrors = $this->logParser->getFilteredLines();
    $numLines = count($lines);
    $shortLogChunks = array();
    foreach ($linesWithErrors as $errorIndex => $lineNumber) {
      $chunkStart = max(0, $lineNumber - $context);
      $chunkEnd = min($numLines, $lineNumber + $context);
      if (!count($shortLogChunks)) {
        $shortLogChunks[] = array("start" => $chunkStart, "end" => $chunkEnd);
      } else {
        $lastChunkIndex = count($shortLogChunks) - 1;
        if ($shortLogChunks[$lastChunkIndex]["end"] + $snap >= $chunkStart) {
          $shortLogChunks[$lastChunkIndex]["end"] = $chunkEnd;
        } else {
          $shortLogChunks[] = array("start" => $chunkStart, "end" => $chunkEnd);
        }
      }
    }
    return $shortLogChunks;
  }
  
  protected function skipFragment($numLines) {
    return '<p class="skip">Skipping '.$numLines." lines...</p>\n";
  }
  
  protected function getLog() {
    $shortLogChunks = $this->getShortLogChunks();
    $shortLines = array();
    if (!count($shortLogChunks))
      return array();
  
    $firstChunkStart = $shortLogChunks[0]["start"];
    if ($firstChunkStart > 0) {
      $shortLines[] = $this->skipFragment($firstChunkStart - 1);
    }
    $lines = $this->logParser->getLines();
    $numLines = count($lines);
    $linesWithErrors = $this->logParser->getFilteredLines();
    $errorCount = count($linesWithErrors);
    $upcomingErrorNumber = 0;
    $upcomingErrorLine = $upcomingErrorNumber < $errorCount ? $linesWithErrors[$upcomingErrorNumber] : -1;
    foreach ($shortLogChunks as $chunkIndex => $chunk) {
      $shortLines[] = '<pre>';
      for ($i = $chunk['start']; $i < $chunk['end']; $i++) {
        if ($i == $upcomingErrorLine) {
          $shortLines[] = '<strong id="error'.$upcomingErrorNumber.'">'.htmlspecialchars($lines[$i]).'</strong>';
          $upcomingErrorNumber++;
          $upcomingErrorLine = $upcomingErrorNumber < $errorCount ? $linesWithErrors[$upcomingErrorNumber] : -1;
        } else {
          $shortLines[] = htmlspecialchars($lines[$i]);
        }
      }
      $shortLines[] = '</pre>';
      $nextChunkStart = ($chunkIndex < count($shortLogChunks) - 1) ? $shortLogChunks[$chunkIndex+1]['start'] : $numLines;
      $skippingLines = $nextChunkStart - $chunk['end'];
      if ($skippingLines > 0) {
        $shortLines[] = $this->skipFragment($skippingLines);
      }
    }
    return implode("", $shortLines);
  }

  protected function generateHTML($summary, $shortLog) {
    $lines = $this->logParser->getLines();
    $linesWithErrors = $this->logParser->getFilteredLines();
    date_default_timezone_set('America/Los_Angeles');
    $logDescription = $this->machineType.' on '.date("Y-m-d H:i:s T", $this->startTime);
    $revLink = '<a href="../?branch='.$this->branch.'&rev='.$this->revision.'">push '.$this->revision.'</a>';
    $header = "<!DOCTYPE html>\n".
      "<html lang=\"en\">\n".
      "<title>Log - ".$logDescription."</title>\n".
      "<h1>Log</h1>\n".
      '<p class="subtitle">'.$logDescription." for ".$revLink."</p>\n".
      '<p class="viewFullLog"><a href="?id='.$this->runID.
      '&amp;full=1&amp;branch='.$this->branch.'">View Full Log</a></p>'.
      '<p class="downloadFullLog"><a href="'.$this->logURL.'">Download Full Log</a></p>';
    if (count($linesWithErrors) > 0)
      return $header.
        "<h2>Summary</h2>\n".
        "<pre>".$summary."</pre>\n".
        "<h2>Relevant Parts of the Log</h2>\n".
        $shortLog;
    return $header.
      "<p>No errors or warnings found. See below for the full log.</p>\n".
      "<h2>Full Log</h2>\n".
      "<pre>".htmlspecialchars(implode("", $lines))."</pre>";
  }
}
