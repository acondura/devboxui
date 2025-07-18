<?php

namespace Drupal\pcb\Cache;

use Drupal\Core\Cache\DatabaseBackend;

/**
 * Defines a permanent database cache implementation.
 *
 * {@inheritdoc}
 */
class PermanentDatabaseBackend extends DatabaseBackend implements PermanentBackendInterface {

  use PermanentBackendTrait;

}
