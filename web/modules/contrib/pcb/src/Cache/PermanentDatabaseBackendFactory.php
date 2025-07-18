<?php

namespace Drupal\pcb\Cache;

use Drupal\Core\Cache\DatabaseBackendFactory;

/**
 * Class PermanentDatabaseBackendFactory.
 */
class PermanentDatabaseBackendFactory extends DatabaseBackendFactory {

  /**
   * {@inheritdoc}
   */
  public function get($bin) {
    $max_rows = $this->getMaxRowsForBin($bin);
    return new PermanentDatabaseBackend($this->connection, $this->checksumProvider, $bin, $this->serializer, $this->time, $max_rows);
  }

}
