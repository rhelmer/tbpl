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

$mongo = new Mongo();
$mongo->tbpl->builders->ensureIndex(array('branch' => true));
$result = $mongo->tbpl->builders->find(
            array('branch' => $branch),
            array('_id' => 0, 'branch' => 0, 'history' => 0));
echo json_encode(iterator_to_array($result->sort(array('name'=>1)), false)) . "\n";
