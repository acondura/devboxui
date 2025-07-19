<?php

namespace Drupal\devbox\Plugin\VpsProvider;

use Drupal\devbox\Plugin\VpsProvider\VpsProviderPluginBase;

/**
 * @VpsProvider(
 *   id = "devbox_hetzner",
 *   label = @Translation("Hetzner")
 * )
 */
class ProviderHetzner extends VpsProviderPluginBase {

  public function info() {
    return [
      'name' => 'Hetzner',
      'api_url' => 'https://api.hetzner.cloud/v1',
      'currency' => 'EUR',
      'server_types' => 'server_types',
      'server_types_opts' => [
        'architecture' => 'architecture',
        'cores' => 'cores',
        'cpu_type' => 'cpu_type',
        'description' => 'description',
        'disk' => 'disk',
        'id' => 'id',
        'memory' => 'memory',
        'prices' => 'prices',
      ],
      'images' => 'images',
      'images_opts' => [
        'id' => 'id',
        'description' => 'description',
        'type' => 'system',
        'status' => 'available',
        'os_flavor' => 'ubuntu',
        'sort' => 'name:desc',
        'architecture' => 'x86',
        'per_page' => '1',
      ],
      'locations' => 'locations',
      'locations_opts' => [
        'id' => 'id',
        'city' => 'city',
        'country' => 'country',
        'network_zone' => 'network_zone',
      ],
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function provision(array $data) {
    \Drupal::logger('vps')->notice('Provisioning VPS via Hetzner for node @nid', [
      '@nid' => $data['node']->id(),
    ]);
  }

  /**
   * Get Hetzner vps locations, cache results.
   *
   * @return void
   */
  public function location() {

  }

}
