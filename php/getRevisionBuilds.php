<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';
require_once 'inc/HiddenBuilders.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN | Headers::NO_CACHE, "application/json");

$branch = requireStringParameter('branch', $_GET);
$rev = requireStringParameter('rev', $_GET);
$noIgnore = isset($_GET['noignore']) && $_GET['noignore'] == '1';

$mongo = new Mongo();
$hiddenBuilderNames = $noIgnore ? array() : getHiddenBuilderNames($_GET['branch']);
$mongo->tbpl->runs->ensureIndex(array('branch' => true, 'revision' => true));
$result = $mongo->tbpl->runs->find(
            array('branch' => $branch, 'revision' => $rev,
                  'buildername' => array('$nin' => $hiddenBuilderNames)),
            array('branch' => 0, 'revision' => 0, 'log' => 0, 'notes.ip' => 0));
echo json_encode(iterator_to_array($result, false)) . "\n";
