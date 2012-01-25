<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

require_once 'inc/gzdecode.php';

// See http://php.net/manual/en/pdo.lobs.php for how to handle blobs
// also see https://bugs.php.net/bug.php?id=40913 for a bug when fetching BLOBs
class GzipUtils {

  public static function writeToDb($log, $content) {
    global $db;
    $fp = tmpfile();
    fwrite($fp, gzencode($content, 9));
    rewind($fp);
    $stmt = $db->prepare("
      UPDATE runs_logs
      SET content = :content
      WHERE buildbot_id = :id AND type = :type;");
    $stmt->bindParam(":content", $fp, PDO::PARAM_LOB);
    $stmt->bindParam(":id", $log['_id']);
    $stmt->bindParam(":type", $log['type']);
    $db->beginTransaction();
    $stmt->execute();
    $db->commit();
    fclose($fp);
  }

  public static function passThru($log, $mimeType) {
    global $db;
    header("Content-Type: {$mimeType}; charset=utf-8");
    header("Content-Encoding: gzip");
    $stmt = $db->prepare("
      SELECT content
      FROM runs_logs
      WHERE buildbot_id = :id AND type = :type;");
    $stmt->bindParam(":id", $log['_id']);
    $stmt->bindParam(":type", $log['type']);
    $stmt->execute();
    $stmt->bindColumn(1, $blob, PDO::PARAM_LOB);
    $stmt->fetch(PDO::FETCH_BOUND);
    if (gettype($blob) == 'string') {
      echo $blob;
    } else {
      fpassthru($blob);
      fclose($blob);
    }
  }

  /**
   * Return contents of the gz file at $filename as an array
   * of lines, where every line is terminated by "\n".
   */
  public static function getLines($log) {
    global $db;
    $stmt = $db->prepare("
      SELECT content
      FROM runs_logs
      WHERE buildbot_id = :id AND type = :type;");
    $stmt->bindParam(":id", $log['_id']);
    $stmt->bindParam(":type", $log['type']);
    $stmt->execute();
    $stmt->bindColumn(1, $blob, PDO::PARAM_LOB);
    $stmt->fetch(PDO::FETCH_BOUND);
    if (gettype($blob) == 'string') {
      $content = gzdecode($blob);
    } else {
      $content = gzdecode(stream_get_contents($blob));
      fclose($blob);
    }

    // we want to have lines that are terminated by \n.
    $lines = preg_split("/([^\n]*\n)/", $content, -1,
      PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);
    return $lines;
  }
}
