<?php

namespace Drupal\devboxui\Plugin\VpsProvider;

use Drupal\devboxui\Plugin\VpsProvider\VpsProviderPluginBase;
use Drupal\user\Entity\User;

/**
 * @VpsProvider(
 *   id = "hetzner",
 *   label = @Translation("Hetzner")
 * )
 */
class ProviderHetzner extends VpsProviderPluginBase {

  protected $provider = 'hetzner';
  protected $sshKeyName;
  protected $pbkey;
  protected $user;

  public function __construct() {
    $this->user = User::load(\Drupal::currentUser()->id());
    $this->sshKeyName = $this->user->uuid();
    $this->pbkey = $this->user->get('field_ssh_public_key')->getString();
  }

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
   * Get vps locations, cache results.
   *
   * @return void
   */
  public function location() {
    $options = [];
    $results = vpsCall($this->provider, 'locations');
    foreach($results['locations'] as $l) {
      $options[$l['id']] = implode(', ', [
        $l['city'],
        $l['country'],
      ]);
    }
    return $options;
  }

  /**
   * Get vps server types, cache results.
   *
   * @return void
   */
  public function server_type() {
    $locations = vpsCall($this->provider, 'locations');
    $response = vpsCall($this->provider, 'server_types');
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
   * Get vps os images, cache results.
   *
   * @return void
   */
  public function os_image() {
    $options = [];
    $results = vpsCall($this->provider, 'images', [
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

  /**
   * $sshKeyName is always the user's uuid.
   */
  public function ssh_key() {
    # Connect to VPN provider and check that SSH public key is uploaded.
    $server_keys = vpsCall($this->provider, 'ssh_keys');
    $key_exists = 0;

    $key_resp = $this->user->get('field_ssh_response')->getString();
    if (empty($key_resp)) {
      $keyToCheck = $this->pbkey;
    }
    else {
      $keyToCheck = $key_resp['ssh_keys'][0]['public_key'];
    }
    foreach ($server_keys['ssh_keys'] as $key) {
      if ($key['public_key'] === $keyToCheck) {
        $key_exists++;
        break; // Stop searching after finding the key.
      }
    }

    # Does not exist.
    if ($key_exists == 0) {
      # Upload the SSH public key to the VPS provider.
      $ret = vpsCall($this->provider, 'ssh_keys', [
        'name' => $this->sshKeyName,
        'public_key' => $this->pbkey,
      ], 'POST');
      $this->saveKeys($ret);
    } # Key id exists, update it.
    else {
      # First, remove it.
      $key_resp = json_decode($this->user->get('field_ssh_response')->getString(), TRUE);
      $key_id = $key_resp['ssh_keys'][0]['id'];
      $ret = vpsCall($this->provider, 'ssh_keys/'.$key_id, [], 'DELETE');

      # Then, upload it.
      $ret = vpsCall($this->provider, 'ssh_keys', [
        'name' => $this->sshKeyName,
        'public_key' => $this->pbkey,
      ], 'POST');
      $this->saveKeys($ret);
    }
  }

  public function saveKeys($ret) {
    if (isset($ret['ssh_keys']) && is_array($ret['ssh_keys'])) {
      $this->user->set('field_ssh_response', json_encode($ret));
      $this->user->save();
      \Drupal::logger('vps')->notice('Saved field_ssh_response: @val', ['@val' => json_encode($ret)]);
      $user = User::load($this->user->id());
      \Drupal::logger('vps')->notice('Reloaded field_ssh_response: @val', ['@val' => $user->get('field_ssh_response')->getString()]);
    }
  }

  public function create_vps($paragraph) {
    $vpsName = $paragraph->uuid();
    [$server_type, $location] = explode('_', $paragraph->get('field_server_type')->getValue()[0]['value'], 2);

    # Create the server.
    $ret = vpsCall($this->provider, 'servers', [
      'name' => $vpsName,
      'location' => $location,
      'server_type' => $server_type,
      'image' => $paragraph->get('field_os_image')->getString(),
      'ssh_keys' => [$this->sshKeyName],
    ], 'POST');

    # Save the server ID to the paragraph field.
    if (isset($ret['server'])) {
      $paragraph->set('field_response', $ret['server']);
      $paragraph->save();
    }
  }

}
