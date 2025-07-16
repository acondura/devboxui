<?php

namespace Drupal\Tests\eca\Kernel\Model;

use Drupal\eca_base\Hook\BaseHooks;
use Drupal\user\Entity\User;

/**
 * Model test for entity loops.
 *
 * @group eca
 * @group eca_model
 */
class EntityLoopTest extends Base {

  /**
   * {@inheritdoc}
   */
  protected static $modules = [
    'views',
    'eca_base',
    'eca_content',
    'eca_user',
    'eca_views',
    'eca_test_model_entity_loop',
  ];

  /**
   * Tests entity loop with the user list view.
   */
  public function testUserList(): void {
    // Create another user.
    $name = $this->randomMachineName();
    User::create([
      'uid' => 2,
      'name' => $name,
      'mail' => $name . '@localhost',
      'status' => TRUE,
    ])->save();

    foreach (\Drupal::service('event_dispatcher')->getListeners('drupal_hook.cron') as $listener) {
      if ($listener[0] instanceof BaseHooks) {
        call_user_func($listener);
      }
    }
    $this->assertStatusMessages([
      'User ' . self::USER_1_NAME,
      "User $name",
    ]);
  }

}
