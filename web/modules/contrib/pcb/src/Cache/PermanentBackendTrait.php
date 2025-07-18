<?php

namespace Drupal\pcb\Cache;

/**
 * Common implementation for classes implementing PermanentBackendInterface.
 */
trait PermanentBackendTrait {

  /**
   * {@inheritdoc}
   *
   * This cache doesn't need to be deleted when doing cache rebuild.
   * We do nothing here.
   */
  public function deleteAll() {
  }

  /**
   * Deletes all cache items in a bin when explicitly called.
   *
   * @see \Drupal\Core\Cache\DatabaseBackend::deleteAll()
   */
  public function deleteAllPermanent() {
    parent::deleteAll();
  }

}
