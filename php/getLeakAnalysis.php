<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/LeakAnalyzer.php';
require_once 'inc/GzipUtils.php';
require_once 'inc/RunForLog.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN);

$run = getRequestedRun();
try {
  $analyzer = new LeakAnalyzer($run);
  $log = $analyzer->ensureLogExists();
  GzipUtils::passThru($log, "text/html");
} catch (Exception $e) {
  die($e->getMessage());
}
