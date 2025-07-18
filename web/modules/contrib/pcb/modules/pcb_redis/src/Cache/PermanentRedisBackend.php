<?php

namespace Drupal\pcb_redis\Cache;

use Drupal\redis\Cache\PhpRedis;
use Drupal\pcb\Cache\PermanentBackendInterface;
use Drupal\pcb\Cache\PermanentBackendTrait;

/**
 * Defines a permanent Redis cache implementation.
 *
 * {@inheritdoc}
 */
class PermanentRedisBackend extends PhpRedis implements PermanentBackendInterface {

  use PermanentBackendTrait;

  /**
   * {@inheritdoc}
   */
  public function removeBin() {
    parent::deleteAll();
  }

}
