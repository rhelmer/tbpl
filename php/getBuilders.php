<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

// Returns all builders belonging to a branch with the following format:
// [ { "name": "...", "buildername": "...", "hidden": 0/1 }, ... ]
// hidden:0 may be ommitted.

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$branch = requireStringParameter('branch', $_GET);

$stmt = $db->prepare("
  SELECT name, buildername, hidden
  FROM builders
  WHERE branch = :branch
  ORDER BY buildername ASC;");
$stmt->execute(array(":branch" => $branch));

// mysql returns everything as string, so we need to manually cast to bool :-(
$result = array();
while ($builder = $stmt->fetch(PDO::FETCH_ASSOC)) {
  $builder['hidden'] = $builder['hidden'] != "0";
  $result[] = $builder;
}

echo json_encode($result) . "\n";
