<?php

namespace Drupal\devboxui;

use Drupal\Core\Plugin\DefaultPluginManager;

/**
 * VpsProvider plugin manager.
 */
class VpsProviderManager extends DefaultPluginManager {
  public function __construct(\Traversable $namespaces, \Drupal\Core\Cache\CacheBackendInterface $cache_backend, \Drupal\Core\Extension\ModuleHandlerInterface $module_handler) {
    parent::__construct(
      'Plugin/VpsProvider',
      $namespaces,
      $module_handler,
      'Drupal\devboxui\Plugin\VpsProvider\VpsProviderInterface',
      'Drupal\devboxui\Annotation\VpsProvider'
    );

    $this->alterInfo('vps_provider_info');
    $this->setCacheBackend($cache_backend, 'vps_provider_plugins');
  }
}
