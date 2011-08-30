<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';

function getRequestedRun() {
  global $db;
  if (!isset($_GET["id"]))
    die("No id set.");
  $stmt = $db->prepare("
    SELECT id AS _id, buildername, slave, revision, result, branch, log,
      unix_timestamp(starttime) AS starttime,
      unix_timestamp(endtime) AS endtime
    FROM runs
    WHERE buildbot_id = :id;");
  $stmt->execute(array(":id" => $_GET["id"]));
  $run = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$run)
    die("Unknown run ID.");
  if (empty($run['log']))
    die("No log available.");
  return $run;
}
