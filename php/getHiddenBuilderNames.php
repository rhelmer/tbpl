<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

// Returns the buildernames of all hidden builders belonging to the
// branch $_GET['branch'] as a JSON encoded array.

require_once 'config.php';
require_once 'inc/HiddenBuilders.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$branch = requireStringParameter('branch', $_GET);

echo json_encode(getHiddenBuilderNames($branch)) . "\n";
