<?php

/**
 * @file
 * Provides drush commands for pcb.
 */

use Drupal\Core\Cache\Cache;

/**
 * Implements hook_drush_command().
 */
function pcb_drush_command() {
  $commands = [];

  $commands['permanent-cache-bin-flush'] = [
    'description' => 'Flush permanent cache bin.',
    'aliases'     => ['pcbf'],
    'arguments'     => [
      'bin' => 'Bin to flush cache of.',
    ],
    'required-arguments' => TRUE,
    'examples'    => [
      'drush pcbf stock' => 'Flush stock bin cache.',
    ],
  ];

  $commands['permanent-cache-bin-flush-all'] = [
    'description' => 'Flush cache for all bins using permanent cache backend.',
    'aliases' => ['pcb-flush-all'],
  ];

  return ($commands);
}

/**
 * Implements drush permanent cache bin flush command.
 */
function drush_pcb_permanent_cache_bin_flush($bin) {
  try {
    \Drupal::service('cache.' . $bin)->deleteAllPermanent();
    drush_print(dt('Deleted all cache for @bin.', ['@bin' => $bin]));
  }
  catch (\Exception $e) {
    drush_set_error($e->getMessage());
  }
}

/**
 * Implements drush permanent cache bin flush command.
 */
function drush_pcb_permanent_cache_bin_list() {
  $bins = Cache::getBins();

  foreach ($bins as $bin => $object) {
    if (method_exists($object, 'deleteAllPermanent')) {
      drush_print($bin);
    }
  }
}

/**
 * Implements drush permanent cache bin flush all command.
 */
function drush_pcb_permanent_cache_bin_flush_all() {
  foreach (Cache::getBins() as $bin => $backend) {
    if (method_exists($backend, 'deleteAllPermanent')) {
      $backend->deleteAllPermanent();
      drush_print(dt('Flushed all cache for @bin.', ['@bin' => $bin]));
    }
  }
}
