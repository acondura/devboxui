<?php

namespace Drupal\devboxui\Plugin\VpsProvider;

use Drupal\devboxui\Plugin\VpsProvider\VpsProviderPluginBase;
use Drupal\user\Entity\User;
use Drupal\user\UserDataInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * @VpsProvider(
 *   id = "hetzner",
 *   label = @Translation("Hetzner")
 * )
 */
class ProviderHetzner extends VpsProviderPluginBase implements ContainerFactoryPluginInterface {

  protected $provider;
  protected $sshKeyName;
  protected $pbkey;
  protected $user;
  protected $sshRespField;
  protected $userData;

  /**
   * ProviderHetzner constructor.
   *
   * @param \Drupal\user\UserDataInterface $user_data
   *   The user.data service.
   */
  public function __construct(array $configuration, $plugin_id, $plugin_definition, UserDataInterface $user_data) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);

    $this->provider = 'hetzner';
    $this->userData = $user_data;
    $this->sshRespField = 'field_ssh_response_'.$this->provider;
    $this->user = User::load(\Drupal::currentUser()->id());
    $this->sshKeyName = $this->user->uuid();
    $this->pbkey = $this->user->get('field_ssh_public_key')->getString();
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('user.data')
    );
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

    $key_resp = $this->user->get($this->sshRespField)->getString();
    if (empty($key_resp)) {
      $keyToCheck = $this->pbkey;
    }
    else {
      $key_resp = json_decode($key_resp, TRUE);
      $keyToCheck = $key_resp['ssh_key']['public_key'];
    }
    if (!empty($keyToCheck)) {
      foreach ($server_keys['ssh_keys'] as $key) {
        if ($key['public_key'] === $keyToCheck) {
          $key_exists++;
          break; // Stop searching after finding the key.
        }
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
      $key_id = $key_resp['ssh_key']['id'];
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
    if (isset($ret['ssh_key']) && is_array($ret['ssh_key'])) {
      $this->user->set($this->sshRespField, json_encode($ret));
      $this->user->save();
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
