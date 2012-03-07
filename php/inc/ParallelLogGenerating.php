<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

interface LogGenerator {
  public function generate($log);
}

class ParallelLogGenerating {

  /**
   * Ensures that a log exists. If the log doesn't exist yet,
   * $generator->generate($log) is called so that it will
   * exist afterwards.
   * If the same log is requested simultaneously by multiple
   * PHP scripts executing in parallel, the generator will only
   * be executed once, and all waiting scripts will use the same
   * generated log afterwards.
   * Synchronization happens with the help of a query/sleep loop.
   */
  static public function ensureLogExists($log, LogGenerator $generator) {
    global $db;
    $slept = 0;
    while (true) {
      if ($slept >= 60) {
        // it should really not take this long, maybe something is broken
        die('Timeout generating log.');
      }
      $exists = self::queryLog($log);
      if (!$exists) {
        // the log does not exist yet, write a NULL into the database to signal
        // that processing is in progress
        try {
          $stmt = $db->prepare("
            INSERT INTO runs_logs
            SET buildbot_id = :id, type = :type;");
          $stmt->execute(array(
            ':id' => $log['_id'],
            ':type' => $log['type']
          ));
        } catch (Exception $e) {
          // we have a unique key constraint violation, another process was faster
          sleep(1);
          $slept++;
          continue;
        }
        try {
          $generator->generate($log);
          return;
        } catch(Exception $e) {
          // in case we were not able to generate the log successfully, clear
          // the NULL value from the database so another process can retry
          $stmt = $db->prepare("
            DELETE FROM runs_logs
            WHERE buildbot_id = :id AND type = :type;");
          $stmt->execute(array(
            ':id' => $log['_id'],
            ':type' => $log['type']
          ));
          sleep(1);
          $slept++;
          continue;
        }
      } else if (!$exists['inprogress']) {
        // another process has finished the processing
        return;
      }
      // else: busy-wait until the processing is finished
      sleep(1);
      $slept++;
    }
  }

  static protected function queryLog($log) {
    global $db;
    $stmt = $db->prepare("
      SELECT content IS NULL as `inprogress`
      FROM runs_logs
      WHERE buildbot_id = :id AND type = :type;");
    $stmt->execute(array(":id" => $log["_id"], ":type" => $log["type"]));
    return $stmt->fetch(PDO::FETCH_ASSOC);
  }
}
