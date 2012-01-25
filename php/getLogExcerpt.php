<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

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
    GzipUtils::passThru($reftestExcerpt, 'text/plain');
  } else if ($type == "tinderbox_print") {
    $logParser = new LogParser($run, new TinderboxPrintFilter());
    $tinderboxPrintExcerpt = $logParser->ensureExcerptExists();
    GzipUtils::passThru($tinderboxPrintExcerpt, 'text/plain');
  } else {
    $logParser = new LogParser($run, new GeneralErrorFilter());
    $rawErrorSummary = $logParser->ensureExcerptExists();
    if ($type != "annotated") {
      GzipUtils::passThru($rawErrorSummary, 'text/plain');
    } else {
      date_default_timezone_set('America/Los_Angeles');
      $logDescription = $run['buildername'].' on '.date("Y-m-d H:i:s", $run['starttime']);
      $annotatedSummaryGenerator = new AnnotatedSummaryGenerator($rawErrorSummary, $logDescription);
      $annotatedSummary = $annotatedSummaryGenerator->ensureAnnotatedSummaryExists();
      GzipUtils::passThru($annotatedSummary, 'text/plain');
    }
  }
} catch (Exception $e) {
  die("Log not available.");
}
