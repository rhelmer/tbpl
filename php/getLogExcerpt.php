<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

$enable_output = true;

// this file can also be called from the command line, in case we want to
// prefetch summaries; in that case, $argv[1] is the querystring-encoded $_GET
// we also need to patch up the include path, because the working directory
// may be different from this scripts directory
if (PHP_SAPI === 'cli') {
  ini_set('include_path', ini_get('include_path').':'.dirname(__FILE__));
  parse_str($argv[1], $_GET);
  // execution time is unlimited for CLI scripts, however we don’t want to
  // hold up the parent process for that long in case something goes wrong
  ini_set('max_execution_time', 30);
  // we don’t want to output the log itself, we rather want instrumentation
  // messages
  $enable_output = false;
  require_once 'inc/Timer.php';
  Timer::$enabled = true;
}

require_once 'inc/LogParser.php';
require_once 'inc/GeneralErrorFilter.php';
require_once 'inc/ReftestFailureFilter.php';
require_once 'inc/TinderboxPrintFilter.php';
require_once 'inc/AnnotatedSummaryGenerator.php';
require_once 'inc/GzipUtils.php';
require_once 'inc/RunForLog.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN);

$type = isset($_GET["type"]) ? $_GET["type"] : "plaintext";

$run = getRequestedRun();

try {
  if ($type == "reftest") {
    $logParser = new LogParser($run, new ReftestFailureFilter());
    $reftestExcerpt = $logParser->ensureExcerptExists();
    if ($enable_output)
      GzipUtils::passThru($reftestExcerpt, 'text/plain');
  } else if ($type == "tinderbox_print") {
    $logParser = new LogParser($run, new TinderboxPrintFilter());
    $tinderboxPrintExcerpt = $logParser->ensureExcerptExists();
    if ($enable_output)
      GzipUtils::passThru($tinderboxPrintExcerpt, 'text/plain');
  } else {
    $logParser = new LogParser($run, new GeneralErrorFilter());
    $rawErrorSummary = $logParser->ensureExcerptExists();
    if ($type != "annotated") {
      if ($enable_output)
        GzipUtils::passThru($rawErrorSummary, 'text/plain');
    } else {
      date_default_timezone_set('America/Los_Angeles');
      $logDescription = $run['buildername'].' on '.date("Y-m-d H:i:s", $run['starttime']);
      $annotatedSummaryGenerator = new AnnotatedSummaryGenerator($rawErrorSummary, $logDescription);
      $annotatedSummary = $annotatedSummaryGenerator->ensureAnnotatedSummaryExists();
      if ($enable_output)
        GzipUtils::passThru($annotatedSummary, 'text/plain');
    }
  }
} catch (Exception $e) {
  die("Log not available.");
}
