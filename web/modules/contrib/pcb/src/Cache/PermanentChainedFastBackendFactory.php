<?php

namespace Drupal\pcb\Cache;

use Drupal\Core\Cache\ChainedFastBackendFactory;

/**
 * Defines the chained fast cache backend factory.
 *
 * @see \Drupal\Core\Cache\ChainedFastBackend
 */
class PermanentChainedFastBackendFactory extends ChainedFastBackendFactory {

  /**
   * {@inheritdoc}
   */
  public function get($bin) {
    // Use the chained backend only if there is a fast backend available;
    // otherwise, just return the consistent backend directly.
    if (isset($this->fastServiceName)) {
      return new PermanentChainedFastBackend(
        $this->container->get($this->consistentServiceName)->get($bin),
        $this->container->get($this->fastServiceName)->get($bin),
        $bin
      );
    }
    else {
      return $this->container->get($this->consistentServiceName)->get($bin);
    }
  }

}
