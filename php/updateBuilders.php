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

$mongo = new Mongo();
foreach ($actions as $name => $action) {
  $current = $mongo->tbpl->builders->findOne(
    array('name' => $name), array('hidden' => 1));
  if ($current === NULL)
    continue;
  $currentlyHidden = !empty($current['hidden']);
  if (($currentlyHidden && $action != 'unhide') ||
      (!$currentlyHidden && $action != 'hide'))
    continue;
  $newHidden = ($action == 'hide');
  $historyEntry = array(
    'date' => time(),
    'action' => $action,
    'who' => $who,
    'reason' => $reason,
    'ip' => $ip);
  $mongo->tbpl->builders->update(
    array('name' => $name),
    array('$set' => array('hidden' => $newHidden),
          '$push' => array('history' => $historyEntry)));
}
