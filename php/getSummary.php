<?php
/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

if (!isset($_GET["tree"]) || !isset($_GET["id"]))
  die("tree or id not set");

if (!preg_match('/^[a-zA-Z0-9\.-]+$/', $_GET["tree"]))
  die("invalid tree");

if (!preg_match('/^\d+\.\d+\.\d+\.gz$/', $_GET["id"]))
  die("invalid id");

if (!isset($_GET["starred"]) || $_GET["starred"] != "true")
  $_GET["starred"] = false;
else
  $_GET["starred"] = true;

header("Content-Type: text/plain,charset=utf-8");
header("Access-Control-Allow-Origin: *");
echo getSummary($_GET["tree"], $_GET["id"], $_GET["starred"]);

function getSummary($tree, $id, $starred) {
  $file = "../summaries/" . $tree . "_" . $id . "_" . ($starred ? "" : "not") . "starred";
  if (file_exists($file))
    return file_get_contents($file);

  $host = "tinderbox.mozilla.org";
  $page = "/showlog.cgi?log=" . $tree . "/" . $id; // . 1233853948.1233859186.27458.gz";
  $fp = fsockopen($host, 80, $errno, $errdesc);
  if (!$fp)
    return "Couldn't connect to $host:\nError: $errno\nDesc: $errdesc\n";
  $request = "GET $page HTTP/1.0\r\n";
  $request .= "Host: $host\r\n";
  $request .= "User-Agent: PHP test client\r\n\r\n";
  $lines = array();
  fputs ($fp, $request);
  stream_set_timeout($fp, 20);
  stream_set_blocking($fp, 0);
  $foundSummaryStart = false;
  $fileExistedAfterAll = false;
  $isStillRunning = false;
  global $signature;
  $signature = "";
  while (!feof($fp)) {
    if (file_exists($file)) {
      $fileExistedAfterAll = true;
      break;
    }
    $line = fgets($fp, 1024);
    if ($line != "") {
      if (!$foundSummaryStart) {
        if (preg_match("/Build Error Summary.*Build Error Log.*No More Errors/i", $line)) {
          $isStillRunning = true;
          break;
        }
        if (preg_match("/Build Error Summary.*Build Error Log/i", $line)) {
          // Summary is empty.
          break;
        }
        if (preg_match_all("/Build Error Summary.*<PRE>(.*)$/i", $line, $m)) {
          $foundSummaryStart = true;
          $line = $m[1][0] . "\n";
          $line = strip_tags($line);
          $lines[] = $line;
          if (!$starred)
            processLine($lines, $line);
        }
        if (strlen($signature) == 0 &&
            preg_match("#<b>(.*\d{4}/\d{2}/\d{2}&nbsp;\d{2}:\d{2}:\d{2})</b>#i", $line, $matches)) {
          $signature = $matches[1];
        }
      } else {
        if (preg_match("/Build Error Log/i", $line))
          break;
        $line = strip_tags($line);
        $lines[] = $line;
        if (!$starred)
          processLine($lines, $line);
      }
    } else {
      usleep(80 * 1000);
    }
  }
  fclose($fp);
  $summary = $fileExistedAfterAll ? file_get_contents($file) : implode($lines);
  if (!file_exists($file) && !$isStillRunning)
    file_put_contents($file, $summary);
  return $summary;
}

function generateSuggestion($bug, $line) {
  global $signature;
  $bug->summary = htmlspecialchars($bug->summary);
  $line = htmlspecialchars(strip_tags($line));
  return "<span data-bugid=\"$bug->id\" " .
               "data-summary=\"$bug->summary\" " .
               "data-signature=\"$signature\" " .
               "data-logline=\"$line\" " .
               "data-status=\"$bug->status $bug->resolution\"" .
         "></span>\n";
}

function processLine(&$lines, $line) {
  $tokens = preg_split("/\s\\|\s/", $line);
  if (count($tokens) < 3)
    return;

  // The middle path has the test file path.
  $testPath = $tokens[1];
  $parts = preg_split("/[\\/\\\\]/", $testPath);
  if (count($parts) < 2 &&
      preg_match('/^leaked/i', $tokens[2])) {
    $lines[] = "<a href=\"leak-analysis/?id=" . $_GET["id"] .
      "&tree=" . $_GET["tree"] . "\" target=\"_blank\">Analyze the leak.</a>";
    return;
  }

  // Get the file name.
  $fileName = end($parts);
  $bugs = getBugsForTestFailure($fileName);
  foreach ($bugs as $bug) {
    $lines[] = generateSuggestion($bug, $line);
  }
}

function parseJSON($json) {
  require_once "./JSON.php";
  $engine = new Services_JSON();
  return $engine->decode($json);
}

$bugsCache = array();
function getBugsForTestFailure($fileName) {
  global $bugsCache;
  if (isset($bugsCache[$fileName]))
    return array();
  if ($fileName == 'automation.py') {
    // This won't generate any useful suggestions, see bug 570174
    return array();
  }
  $bugs_json = file_get_contents("https://api-dev.bugzilla.mozilla.org/latest/bug?whiteboard=orange&summary=" . urlencode($fileName));
  if ($bugs_json !== false) {
    $bugs = parseJSON($bugs_json);
    if (isset($bugs->bugs)) {
      $bugsCache[$fileName] = $bugs->bugs;
      return $bugs->bugs;
    }
  }
  return array();
}
