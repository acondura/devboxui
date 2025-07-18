<?php

namespace Drupal\pcb\Cache;

use Drupal\Core\Cache\CacheBackendInterface;

/**
 * Defines a permanent database cache implementation.
 *
 * This cache implementation can be used for data like
 * stock which don't really need to be cleared during normal
 * cache rebuilds.
 *
 * @ingroup cache
 */
interface PermanentBackendInterface extends CacheBackendInterface {

  /**
   * Deletes all cache items in a bin when explicitly called.
   */
  public function deleteAllPermanent();

}
