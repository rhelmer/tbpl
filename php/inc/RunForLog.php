<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';

function getRequestedRun() {
  if (!isset($_GET["id"]))
    die("No id set.");
  $mongo = new Mongo();
  $run = $mongo->tbpl->runs->findOne(array('_id' => +$_GET["id"]));
  if (!$run)
    die("Unknown run ID.");
  if (empty($run['log']))
    die("No log available.");
  return $run;
}
