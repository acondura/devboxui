<?php

namespace Drupal\pcb\Cache;

use Drupal\Core\Cache\ChainedFastBackend;

/**
 * Defines a permanent chained fast cache implementation.
 *
 * {@inheritdoc}
 */
class PermanentChainedFastBackend extends ChainedFastBackend implements PermanentBackendInterface {

  use PermanentBackendTrait;

}
