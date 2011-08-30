<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

// Returns the change history of the builder identified by $_GET['name'].
// [ { "date": 1306421449, "action": "insert / hide / unhide", "who": "...", "reason": "..." }, ... ]

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$name = requireStringParameter('name', $_GET);

$mongo = new Mongo();
$mongo->tbpl->builders->ensureIndex(array('name' => true));
$result = $mongo->tbpl->builders->findOne(
            array('name' => $name),
            array('_id' => 0, 'name' => 0, 'history.ip' => 0));
echo json_encode($result['history']) . "\n";
