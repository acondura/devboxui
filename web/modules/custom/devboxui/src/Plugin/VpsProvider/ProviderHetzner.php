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
    $locations = vpsCall('hetzner', 'locations');
    $response = vpsCall('hetzner', 'server_types');
    $server_types = array_column($response['server_types'], 'description', 'id');
    $processed_server_types = [];
    foreach ($locations['locations'] as $lk => $lv) {
      foreach ($server_types as $key => $value) {
        $arch = array_column($response['server_types'], 'architecture', 'id');
        $processed_value = $value . ' - ' . $arch[$key];

        $prices = array_column($response['server_types'], 'prices', 'id');
        if (!isset($prices[$key][$lk])) {
          continue; // Skip if no price is available for current location.
        }
        $price = $prices[$key][$lk]['price_monthly']['gross'];
        if (empty($price)) {
          continue; // Skip if no price is available.
        }
        $processed_value .= ' - ' . number_format($price, 4) . ' EUR/month';

        $cores = array_column($response['server_types'], 'cores', 'id');
        $processed_value .= ', ' . $cores[$key] . ' cores';

        $memory = array_column($response['server_types'], 'memory', 'id');
        $processed_value .= ', ' . $memory[$key] . ' GB RAM';

        $disk = array_column($response['server_types'], 'disk', 'id');
        $processed_value .= ', ' . $disk[$key] . ' GB SSD';

        $cpu_type = array_column($response['server_types'], 'cpu_type', 'id');
        $processed_value .= ', ' . $cpu_type[$key] . ' CPU';

        # Key format: 'server type ID'_'location ID'
        $location_key = $lv['city'] . ', ' . $lv['country'] . ' (' . $lv['network_zone'] . ')';
        $processed_key = implode('_', [$key, $lv['id']]);

        $processed_server_types[$location_key][$processed_key] = $processed_value;
      }
    }
    return $processed_server_types;
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
