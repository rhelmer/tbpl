<?php

if (!isset($_GET["tree"]) || !isset($_GET["id"]))
  die("tree or id not set");

if (!preg_match('/^[a-zA-Z0-9\.-]+$/', $_GET["tree"]))
  die("invalid tree");

echo analyze($_GET["tree"], $_GET["id"]);

function analyze($tree, $id) {
  $file = "../summaries/LeakAnalysis_" . $tree . "_" . $id;
  if (file_exists($file))
    return file_get_contents($file);

  $usetinderbox = 0;
  if (isset($_GET["usetinderbox"])) {
    $usetinderbox = $_GET["usetinderbox"];
  }

  $fp = NULL;
  $lines = array();
  $fileExistedAfterAll = false;
  $windows = array();
  $lastTestName = '';
  if ($usetinderbox == 1) { 
    if (!preg_match('/^\d+\.\d+\.\d+\.gz$/', $_GET["id"]))
      die("invalid id");

    $host = "tinderbox.mozilla.org";
    $page = "/showlog.cgi?log=" . $tree . "/" . $id; // . 1233853948.1233859186.27458.gz";
    $page .= "&fulltext=1";
    $fp = fsockopen($host, 80, $errno, $errdesc);
    if (!$fp)
      return "Couldn't connect to $host:\nError: $errno\nDesc: $errdesc\n";
    $request = "GET $page HTTP/1.0\r\n";
    $request .= "Host: $host\r\n";
    $request .= "User-Agent: PHP test client\r\n\r\n";
    fputs ($fp, $request);
    stream_set_timeout($fp, 20);
    stream_set_blocking($fp, 0);
  } else {
    if (!preg_match('/^\d+$/', $_GET["id"]))
      die("invalid id");

    $log_filename = "../cache/rawlog/" . $id . ".txt.gz";
    if (file_exists($log_filename)) { 
      $fp = gzopen($log_filename, "r");
    } else {
      return "Could not find log file in cache for id: $id\n";
    }
  }
  while (!feof($fp)) {
    if (file_exists($file)) {
      $fileExistedAfterAll = true;
      break;
    }
    $line = fgets($fp);
    // You would think that PHP would just return you a full line, wouldn't you?
    // Well, you'd be wrong!  Let's make sure of that.
    while (substr($line, -1) != "\n" && !feof($fp)) {
      $line .= fgets($fp);
    }
    $testName = getTestName($line);
    if ($testName) {
      // "Shutdown" isn't a helpful testname, especially to carry over from
      // mochitest-chrome to mochitest-browser-chrome's startup.
      if ($testName != "Shutdown") {
        $lastTestName = $testName;
      } else {
        $lastTestName = '(unknown)';
      }
      continue;
    }
    if (preg_match("/\+\+DOMWINDOW.*\(([0-9a-fx]+)\)\s*\[serial = (\d+)\]/i", $line, $matches)) {
      $windows[$matches[1] . '-' . $matches[2]] = $lastTestName;
    } else if (preg_match("/--DOMWINDOW.*\(([0-9a-fx]+)\)\s*\[serial = (\d+)\]/i", $line, $matches)) {
      unset($windows[$matches[1] . '-' . $matches[2]]);
    }
  }
  fclose($fp);
  if ($fileExistedAfterAll) {
    $result = file_get_contents($file);
  } else {
    // Reverse the array to get a mapping of test name to number of DOMWINDOWS leaked
    $leaks = array();
    foreach ($windows as $id => $testName) {
      if (!isset($leaks[$testName])) {
        $leaks[$testName] = 0;
      }
      ++$leaks[$testName];
    }
    if (count($leaks)) {
      foreach ($leaks as $testName => $num) {
        $result .= "<div style=\"color: red;\">$testName leaked $num DOMWINDOW(s)</div>";
        // Heuristic for bug 538462
        if (preg_match("/test_unknownContentType_dialog_layout\.xul$/", $testName)) {
          $result .= "<p>(This is <a href=\"https://bugzilla.mozilla.org/show_bug.cgi?id=538462\">bug 538462</a>.)</p>";
        }
      }
    } else {
      $result = "<div style=\"color: green;\">No DOMWINDOWs leaked!</div>";
    }
  }
  file_put_contents($file, $result);
  return $result;
}

function getTestName($line) {
  $line = trim($line);
  // reftest, crashtest, jsreftest
  if (preg_match("/^REFTEST TEST-START \| ([^ ]+)$/", $line, $matches)) {
    return $matches[1];
  // mochitest-plain, mochitest-chrome
  } else if (preg_match("/^\d+ INFO TEST-START \| ([^ ]+)$/", $line, $matches)) {
    return $matches[1];
  // mochitest-browser-chrome
  } else if (preg_match("/^TEST-START \| ([^ ]+)$/", $line, $matches)) {
    return $matches[1];
  // xpcshell
  } else if (preg_match("/^TEST-INFO \| ([^ ]+) \| running test ...$/", $line, $matches)) {
    return $matches[1];
  } else {
    return null;
  }
}

?>
