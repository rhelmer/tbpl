<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

// Applies changes to the hidden status of builders.
// Input parameters (POST):
//  - who: the name / nick of the person who's making the change
//  - password: the sheriff password, stored in sheriff-password.php
//  - reason: the reason for the change
//  - actions: a JSON string that describes the changes that should
//    be made. It has the following format:
//     { 'name of builder': 'hide / unhide', ... }
//    Unlisted builders stay unchanged.

require_once 'config.php';
if (!defined('SHERIFF_PASSWORD'))
  die('Sheriff password missing.');

require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN, "application/json");

if (requireStringParameter('password', $_POST) != SHERIFF_PASSWORD)
  die('{"error": "password"}');

$ip = $_SERVER['REMOTE_ADDR'];
$actions = json_decode(requireStringParameter('actions', $_POST));
$who = requireStringParameter('who', $_POST);
$reason = requireStringParameter('reason', $_POST);

$db->beginTransaction();

foreach ($actions as $name => $action) {
  $stmt = $db->prepare("
    SELECT id, hidden
    FROM builders
    WHERE name = :name;");
  $stmt->execute(array(":name" => $name));
  $current = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$current)
    continue;
  $currentlyHidden = $current['hidden'] == "1";
  if (($currentlyHidden && $action != 'unhide') ||
      (!$currentlyHidden && $action != 'hide'))
    continue;
  $newHidden = ($action == 'hide');
  $stmt = $db->prepare("
    UPDATE builders
    SET hidden = :hidden
    WHERE id = :id;");
  $stmt->execute(array(":id" => $current["id"], ":hidden" => $newHidden));
  
  $stmt = $db->prepare("
    INSERT INTO builders_history 
    SET builder_id = :builder, action = :action, who = :who, reason = :reason,
      ip = :ip;");
  $stmt->execute(array(
    ':builder' => $current["id"],
    ':action' => $action,
    ':who' => $who,
    ':reason' => $reason,
    ':ip' => $ip));
}

$db->commit();
