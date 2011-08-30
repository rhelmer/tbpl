-- phpMyAdmin SQL Dump
-- version 3.4.2
-- http://www.phpmyadmin.net
--
-- Host: localhost
-- Generation Time: Aug 25, 2011 at 10:22 PM
-- Server version: 5.1.41
-- PHP Version: 5.3.2-1ubuntu4.9

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `tbpl`
--

-- --------------------------------------------------------

--
-- Table structure for table `builders`
--

CREATE TABLE IF NOT EXISTS `builders` (
  `id` integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` varchar(128) COLLATE utf8_unicode_ci NOT NULL,
  `branch` varchar(256) COLLATE utf8_unicode_ci NOT NULL,
  `buildername` varchar(256) COLLATE utf8_unicode_ci,
  `hidden` boolean NOT NULL DEFAULT FALSE,
  UNIQUE INDEX builders_name_idx (name),
  INDEX builders_hidden_idx (hidden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `builders_history`
--

CREATE TABLE IF NOT EXISTS `builders_history` (
  `id` integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `builder_id` integer NOT NULL,
  `date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `action` varchar(20) COLLATE utf8_unicode_ci NOT NULL,
  `who` varchar(256) COLLATE utf8_unicode_ci,
  `reason` varchar(256) COLLATE utf8_unicode_ci,
  `ip` varchar(20) COLLATE utf8_unicode_ci,
  INDEX builders_history_date_idx (builder_id),
  FOREIGN KEY (builder_id) REFERENCES builders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;


-- --------------------------------------------------------

--
-- Table structure for table `runs`
--

CREATE TABLE IF NOT EXISTS `runs` (
  `id` integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `buildbot_id` integer NOT NULL,
  `buildername` varchar(256) COLLATE utf8_unicode_ci NOT NULL,
  `slave` varchar(256) COLLATE utf8_unicode_ci NOT NULL,
  `revision` varchar(40) COLLATE utf8_unicode_ci NOT NULL,
  `starttime` timestamp NOT NULL,
  `endtime` timestamp NOT NULL,
  `result` varchar(20) COLLATE utf8_unicode_ci NOT NULL,
  `branch` varchar(256) COLLATE utf8_unicode_ci NOT NULL,
  `log` varchar(256) COLLATE utf8_unicode_ci,
  INDEX runs_buildbot_id_idx (buildbot_id),
  INDEX runs_revision_branch_idx (revision,branch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `runs_notes`
--

CREATE TABLE IF NOT EXISTS `runs_notes` (
  `id` integer AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `run_id` integer NOT NULL,
  `who` varchar(256) COLLATE utf8_unicode_ci NOT NULL,
  `note` text COLLATE utf8_unicode_ci NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip` varchar(20) COLLATE utf8_unicode_ci NOT NULL,
  INDEX runs_notes_run_id_idx (run_id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;


/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
