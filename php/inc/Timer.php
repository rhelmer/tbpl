<?php
/* -*- Mode: PHP; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=2 et tw=80 : */

class Timer {
  static $enabled = false;
  private $start;
  public function __construct() {
    $this->start = microtime(true);
  }
  public function log($str = '(empty log)') {
    if (!self::$enabled)
      return;
    $time = microtime(true) - $this->start;
    if (!empty($_GET['id']))
      $str.= ' ('.$_GET['id'].')';
    $str.= ': '.round($time * 1000)."ms\n";
    echo $str;
  }
}
