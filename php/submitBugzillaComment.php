<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'config.php';
require_once 'inc/JSON.php';

if (!defined('TBPLBOT_EMAIL') || !defined('TBPLBOT_PASSWORD'))
  die('Invalid configuration!');

if (!isset($_POST['id']) || !isset($_POST['comment']))
  die('Invalid params!');

if (!function_exists('curl_init'))
  die('Needs CURL!');

$bugid = (int) $_POST['id'];
if ($bugid <=0)
  die('Invalid Bug ID specified');

header("Content-Type: text/plain");
header("Access-Control-Allow-Origin: *");

$url = "https://api-dev.bugzilla.mozilla.org/latest/bug/$bugid/comment?username=" . urlencode(TBPLBOT_EMAIL) . "&password=" . urlencode(TBPLBOT_PASSWORD);
$json = new Services_JSON();
$data = array(
  "text" => sanitize($_POST["comment"])
);
$data = $json->encode($data);

// check to make sure that the bug has not already been commented on
$bug_comments = file_get_contents("https://api-dev.bugzilla.mozilla.org/latest/bug/$bugid/comment");
if ($bug_comments !== false) {
  if (preg_match("/([\d]+\.[\d]+\.[\d]+)\.gz$/", $_POST['comment'], $matches)) {
    $logid = $matches[1];
    if (strpos($bug_comments, $logid) !== false)
      exit;
  }
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, array("Accept: application/json", "Content-Type: application/json"));
$result = curl_exec($ch);

if ($result === false) {
  $error = array(
    "error" => curl_errno($ch)
  );
  echo $json->encode($error);
} else {
  echo $result;
}

curl_close($ch);

function sanitize($str) {
  // Remove UTF-8 non-breaking space character sequences (0xc2a0), and
  // replace them with normal spaces.
  return str_replace(chr(0xc2) . chr(0xa0), ' ', $str);
}

?>
