<?php

namespace Drupal\pcb_memcache\Cache;

use Drupal\memcache\MemcacheBackend;
use Drupal\pcb\Cache\PermanentBackendInterface;
use Drupal\pcb\Cache\PermanentBackendTrait;

/**
 * Defines a permanent memcache cache implementation.
 *
 * {@inheritdoc}
 */
class PermanentMemcacheBackend extends MemcacheBackend implements PermanentBackendInterface {

  use PermanentBackendTrait;

}
