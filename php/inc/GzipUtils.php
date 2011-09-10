<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

class GzipUtils {

  public static function writeToFile($filename, $content) {
    $fp = gzopen($filename, "w9");
    gzwrite($fp, $content);
    gzclose($fp);
  }

  public static function passThru($filename, $mimeType) {
    header("Content-Type: {$mimeType}; charset=utf-8");
    header("Content-Encoding: gzip");
    $file = fopen($filename, "r");
    fpassthru($file);
    fclose($file);
  }

  /**
   * Return contents of the gz file at $filename as an array
   * of lines, where every line is terminated by "\n".
   */
  public static function getLines($filename) {
    // gzfile breaks up very long lines, so we need to mend them.
    return self::mendBrokenLines(gzfile($filename));
  }

  public static function mendBrokenLines(&$lineArray) {
    $numLines = count($lineArray);
    for ($i = 0; $i < $numLines - 1; $i = $j) {
      for ($j = $i + 1; $j < $numLines && substr($lineArray[$i], -1) != "\n"; $j++) {
        $lineArray[$i] .= $lineArray[$j];
        unset($lineArray[$j]);
      }
    }
    $lineArray = array_values($lineArray);
    return $lineArray;
  }
}
