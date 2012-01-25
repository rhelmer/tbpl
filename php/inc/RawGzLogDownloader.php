<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

/**
 * This class downloads gzipped log files from ftp.mozilla.org.
 */

require_once 'inc/ParallelLogGenerating.php';
require_once 'inc/GzipUtils.php';

class RawGzLogDownloader implements LogGenerator {

  public function __construct($logURL) {
    $this->logURL = $logURL;
  }

  public function generate($log) {
    global $db;
    $host = "ftp.mozilla.org";
    $hostpos = strpos($this->logURL, $host);
    if ($hostpos === false)
      throw new Exception("Log file {$this->logURL} not hosted on {$host}!");
    $path = substr($this->logURL, $hostpos + strlen($host) + strlen("/"));
    $ftpstream = @ftp_connect($host);
    if (!@ftp_login($ftpstream, "anonymous", ""))
      throw new Exception("Couldn't connect to Mozilla FTP server.");
    $fp = tmpfile();
    if (!@ftp_fget($ftpstream, $fp, $path, FTP_BINARY))
      throw new Exception("Log not available at URL {$this->logURL}.");
    ftp_close($ftpstream);
    rewind($fp);
    $db->beginTransaction();
    $stmt = $db->prepare("
      UPDATE runs_logs
      SET content = :content
      WHERE buildbot_id = :id AND type = :type;");
    $stmt->bindParam(":content", $fp, PDO::PARAM_LOB);
    $stmt->bindParam(":id", $log['_id']);
    $stmt->bindParam(":type", $log['type']);
    $stmt->execute();
    $db->commit();
    fclose($fp);
  }

  public static function getLines($run) {
    $log = array("_id" => $run['_id'], "type" => "raw");
    ParallelLogGenerating::ensureLogExists($log, new self($run['log']));
    return GzipUtils::getLines($log);
  }
}
