<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$branch = requireStringParameter('branch', $_GET);
$rev = requireStringParameter('rev', $_GET);
$noIgnore = isset($_GET['noignore']) && $_GET['noignore'] == '1';

$result = array();

$stmt = $db->prepare("
  SELECT id, buildbot_id AS _id, buildername, slave, result,
    unix_timestamp(starttime) AS starttime,
    unix_timestamp(endtime) AS endtime
  FROM runs
  WHERE branch = :branch AND revision = :revision
  " . ($noIgnore ? "" : "AND buildername NOT IN (
    SELECT buildername
    FROM builders
    WHERE branch = :branch AND hidden = TRUE)") . ";");
$stmt->execute(array(":branch" => $branch, ":revision" => $rev));

while ($run = $stmt->fetch(PDO::FETCH_ASSOC)) {
  $notes = $db->prepare("
    SELECT who, note,
      unix_timestamp(timestamp) AS timestamp
    FROM runs_notes
    WHERE run_id = :runid
    ORDER BY timestamp ASC;");
  $notes->execute(array(":runid" => $run['id']));
  $run["notes"] = $notes->fetchAll(PDO::FETCH_ASSOC);
  unset($run["id"]); // don’t need the sql internal id
  $result[] = $run;
}

echo json_encode($result) . "\n";
