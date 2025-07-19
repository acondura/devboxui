<?php

namespace Drupal\devbox\Plugin\VpsProvider;

/**
 * Interface VpsProviderInterface.
 *
 * @package Drupal\devbox\Plugin\VpsProvider
 */
interface VpsProviderInterface {
  public function info();
  public function provision(array $data);
}
