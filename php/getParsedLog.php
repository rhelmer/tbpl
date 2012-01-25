<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/LogParser.php';
require_once 'inc/GeneralErrorFilter.php';
require_once 'inc/ShortLogGenerator.php';
require_once 'inc/FullLogGenerator.php';
require_once 'inc/GzipUtils.php';
require_once 'inc/RunForLog.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN);

$run = getRequestedRun();
$logParser = new LogParser($run, new GeneralErrorFilter());
try {
  // Create the plain text summary too, since we need to parse the
  // log for errors anyway.
  $logParser->ensureExcerptExists();

  $viewFullLog = isset($_GET['full']) && $_GET['full'] == 1;
  $logGenerator = $viewFullLog ?
                         new FullLogGenerator($logParser, $run) :
                         new ShortLogGenerator($logParser, $run);
  $parsedLog = $logGenerator->ensureLogExists();
  GzipUtils::passThru($parsedLog, "text/html");
} catch (Exception $e) {
  die($e->getMessage());
}
