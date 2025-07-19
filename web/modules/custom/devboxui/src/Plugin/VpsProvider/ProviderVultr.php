<?php

namespace Drupal\devbox\Plugin\VpsProvider;

use Drupal\devbox\Plugin\VpsProvider\VpsProviderPluginBase;

/**
 * @VpsProvider(
 *   id = "devbox_vultr",
 *   label = @Translation("Vultr")
 * )
 */
class ProviderVultr extends VpsProviderPluginBase {

  public function info() {
    return [
      'name' => 'Vultr',
      'api_url' => 'https://api.vultr.com/v2',
      'server_types' => 'plans',
      'currency' => 'USD',
      'server_types_opts' => [
        'architecture' => 'cpu_vendor',
        'cores' => 'vcpu_count',
        'cpu_type' => 'type',
        'description' => 'id',
        'disk' => 'disk',
        'id' => 'id',
        'memory' => 'ram',
        'prices' => 'montly_cost',
      ],
      'images' => 'os',
      'images_opts' => [
        'id' => 'id',
        'description' => 'name',
        'type' => 'system',
        'status' => 'available',
        'os_flavor' => 'ubuntu',
        'sort' => 'name:desc',
        'architecture' => 'x86',
        'per_page' => '1',
      ],
      'locations' => 'regions',
      'locations_opts' => [
        'id' => 'id',
        'city' => 'city',
        'country' => 'country',
        'network_zone' => 'continent',
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

}
