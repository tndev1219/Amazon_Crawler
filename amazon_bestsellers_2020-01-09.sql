# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: laravel.ciwrdpuezei5.us-west-2.rds.amazonaws.com (MySQL 5.5.5-10.1.34-MariaDB)
# Database: amazon_bestsellers
# Generation Time: 2020-01-09 16:58:28 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table amazon_bestsellers
# ------------------------------------------------------------

DROP TABLE IF EXISTS `amazon_bestsellers`;

CREATE TABLE `amazon_bestsellers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `source_code` varchar(20) DEFAULT NULL,
  `asin` varchar(30) NOT NULL DEFAULT '',
  `product_url` varchar(500) NOT NULL,
  `product_rank` int(11) NOT NULL,
  `browse_node` varchar(20) NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE (source_code, asin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Dump of table amazon_category
# ------------------------------------------------------------

DROP TABLE IF EXISTS `amazon_category`;

CREATE TABLE `amazon_category` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `source_code` varchar(20) NOT NULL,
  `category_name` varchar(500) NOT NULL UNIQUE,
  `category_url` varchar(500) NOT NULL,
  `category_level` int(11) NOT NULL,
  `category_status` int(11) NOT NULL,
  `browse_node` varchar(30) DEFAULT NULL,
  `status` enum('READY','RESERVED','FINISHED','FAILED') DEFAULT 'READY',
  `reserved_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



# Dump of table amazon_product
# ------------------------------------------------------------

DROP TABLE IF EXISTS `amazon_product`;

CREATE TABLE `amazon_product` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `source_code` varchar(50) DEFAULT NULL,
  `browse_node` varchar(30) DEFAULT NULL,
  `asin` varchar(20) NOT NULL DEFAULT '',
  `ean` varchar(20) DEFAULT NULL,
  `upc` varchar(350) DEFAULT NULL,
  `title` varchar(500) DEFAULT NULL,
  `brand` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `picture_url` varchar(255) DEFAULT NULL,
  `score` decimal(10,2) DEFAULT NULL,
  `reviews_count` int(11) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `rank` int(11) DEFAULT NULL,
  `status` enum('READY','RESERVED','FINISHED','FAILED') DEFAULT 'READY',
  `reserved_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  `failed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE (source_code, asin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;




/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
