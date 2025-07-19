<?php

namespace Drupal\devboxui\Plugin\VpsProvider;

/**
 * Interface VpsProviderInterface.
 *
 * @package Drupal\devboxui\Plugin\VpsProvider
 */
interface VpsProviderInterface {
  public function info();
  public function provision(array $data);
}
