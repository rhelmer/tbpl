<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN, "application/json");

$id = requireStringParameter('id', $_POST);

if (is_numeric($id)) {
  // $id is a Buildbot ID.
  $stmt = $db->prepare("
    SELECT id
    FROM runs
    WHERE buildbot_id = :id;");
  $stmt->execute(array(":id" => $id));
  $run = $stmt->fetchColumn();
  if (!$run)
    die("No build with that id in database.");
} else {
  // $id is not a Buildbot ID; it could be a Tinderbox result ID.
  // TBPL with Tinderbox backend doesn't know the Buildbot ID of a run,
  // so it lets us figure it out from the slave name and the start time
  // of the run.

  $slave = requireStringParameter('machinename', $_POST);
  $starttime = +requireStringParameter('starttime', $_POST);

  $stmt = $db->prepare("
    SELECT id
    FROM runs
    WHERE slave = :slave AND starttime = FROM_UNIXTIME(:starttime);");
  $stmt->execute(array(":slave" => $slave, ":starttime" => $starttime));
  $run = $stmt->fetchColumn();
  if (!$run)
    die("No build with that slave/starttime combination in database.");
}

$who = requireStringParameter('who', $_POST);
$note = requireStringParameter('note', $_POST);

$stmt = $db->prepare("
  INSERT INTO runs_notes
  SET run_id = :run, who = :who, note = :note, ip = :ip;");
$stmt->execute(array(
  ':run' => $run,
  ':who' => $who,
  ':note' => $note,
  ':ip' => $_SERVER['REMOTE_ADDR']
));
