<?php

namespace Drupal\devboxui\Plugin\VpsProvider;

use Drupal\devboxui\Plugin\VpsProvider\VpsProviderPluginBase;

/**
 * @VpsProvider(
 *   id = "hetzner",
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
    $options = [];
    $results = vpsCall('hetzner', 'locations');
    foreach($results['locations'] as $l) {
      $options[$l['id']] = implode(', ', [
        $l['city'],
        $l['country'],
      ]);
    }
    return $options;
  }

  /**
   * Get Hetzner vps server types, cache results.
   *
   * @return void
   */
  public function server_type() {
    $options = [];
    $results = vpsCall('hetzner', 'server_types');
    foreach($results['server_types'] as $s) {
      $options[$s['id']] = implode(', ', [
        $s['description'],
        $s['architecture'],
        $s['cpu_type'] . ' CPU',
        $s['cores'] . ' cores',
        $s['disk'] . ' GB storage',
        $s['memory'] . ' GB memory',
      ]);
    }
    return $options;
  }

  /**
   * Get Hetzner vps os images, cache results.
   *
   * @return void
   */
  public function os_image() {
    $options = [];
    $results = vpsCall('hetzner', 'images', [
      'type' => 'system',
      'status' => 'available',
      'os_flavor' => 'ubuntu',
      'sort' => 'name:desc',
      'architecture' => 'x86',
      'per_page' => '1',
    ]);
    foreach($results['images'] as $i) {
      $options[$i['id']] = implode(', ', [$i['description']]);
    }
    return $options;
  }

}
