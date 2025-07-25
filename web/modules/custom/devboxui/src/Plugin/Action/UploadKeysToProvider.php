<?php

namespace Drupal\devboxui\Plugin\Action;

use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Action\ActionBase;
use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\user\Entity\User;

/**
 * Provides a custom action.
 *
 * @Action(
 *   id = "devboxui_upload_keys_to_provider",
 *   label = @Translation("Upload keys to provider"),
 *   type = "user",
 *   category = @Translation("DevBoxUI"),
 *   context = {
 *     "entity" = @ContextDefinition("entity:user", label = @Translation("User")),
 *   }
 * )
 */
final class UploadKeysToProvider extends ActionBase {

  /**
   * {@inheritdoc}
   */
  public function access($entity, AccountInterface $account = NULL, $return_as_object = FALSE): AccessResultInterface|bool {
    $access = $entity->access('update', $account, TRUE);
    return $return_as_object ? $access : $access->isAllowed();
  }

  /**
   * {@inheritdoc}
   */
  public function execute(ContentEntityInterface $user = NULL): void {
    if ($user) {
      $f = $user->getFields();
      $sshKeyName = User::load(\Drupal::currentUser()->id())->uuid();
      foreach($user->getFields() as $fieldk => $field) {
        if (str_starts_with($fieldk, 'field_vps_')) {
          if ($token = $user->get($fieldk)->getString()) {
            $pbkey = $user->get('field_ssh_public_key');
            $provider = explode('field_vps_', $fieldk)[1];

            $vps_plugin = \Drupal::service('plugin.manager.vps_provider')->createInstance($provider);
            # Upload SSH key if it does not exist.
            $vps_plugin->ssh_key($pbkey);
          }
        }
      }
    }
  }

}
