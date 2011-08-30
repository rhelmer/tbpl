<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

// Returns the change history of the builder identified by $_GET['name'].
// [ { "date": 1306421449, "action": "insert / hide / unhide", "who": "...", "reason": "..." }, ... ]

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$name = requireStringParameter('name', $_GET);

$stmt = $db->prepare("
  SELECT unix_timestamp(date) AS date, action, who, reason
  FROM builders_history
  JOIN builders ON (builders.id = builder_id)
  WHERE name = :name;");
$stmt->execute(array(":name" => $name));
$result = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($result) . "\n";
