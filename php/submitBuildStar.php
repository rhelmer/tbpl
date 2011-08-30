<?php

require_once 'config.php';
require_once 'inc/Communication.php';

Headers::send(Headers::ALLOW_CROSS_ORIGIN, "application/json");

$mongo = new Mongo();

$id = requireStringParameter('id', $_POST);

if (is_numeric($id)) {
  // $id is a Buildbot ID.
  $run = $mongo->tbpl->runs->findOne(
    array('_id' => +$id),
    array('_id' => 1));
  if ($run === NULL)
    die("No build with that id in database.");
} else {
  // $id is not a Buildbot ID; it could be a Tinderbox result ID.
  // TBPL with Tinderbox backend doesn't know the Buildbot ID of a run,
  // so it lets us figure it out from the slave name and the start time
  // of the run.
  $slave = requireStringParameter('machinename', $_POST);
  $starttime = +requireStringParameter('starttime', $_POST);

  $run = $mongo->tbpl->runs->findOne(
    array('slave' => $slave,
          'starttime' => $starttime),
    array('_id' => 1));
  if ($run === NULL)
    die("No build with that slave/starttime combination in database.");
}

$who = requireStringParameter('who', $_POST);
$note = requireStringParameter('note', $_POST);

$noteObject = array(
  'who' => $who,
  'note' => $note,
  'timestamp' => time(),
  'ip' => $_SERVER['REMOTE_ADDR']
);
$mongo->tbpl->runs->update($run, array('$push' => array('notes' => $noteObject)));
