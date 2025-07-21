<?php

namespace Drupal\devboxui\Plugin\Action;

use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Action\ActionBase;
use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\Core\Session\AccountInterface;

/**
 * Provides a custom action.
 *
 * @Action(
 *   id = "devboxui_provision_vps",
 *   label = @Translation("Provision VPS"),
 *   type = "node",
 *   category = @Translation("DevBoxUI"),
 *   context = {
 *     "entity" = @ContextDefinition("entity:node", label = @Translation("Node"))
 *   }
 * )
 */
final class ProvisionVps extends ActionBase {

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
  public function execute(ContentEntityInterface $node = NULL): void {
    if ($node) {
      $commands = [
        'Connect to VPS provider' => [self::class, 'run_batch_verifications'],
        'Step 2' => [self::class, 'run_batch_verifications'],
        'Step 3' => [self::class, 'run_batch_verifications'],
      ];
      $this->batch_wrapper($commands, $node);
    }
  }

  public function batch_wrapper($commands = [], $node): void {
    // Build batch operations: one per command.
    $operations = [];
    foreach ($commands as $cmdKey => $command) {
      if (is_array($command)) {
        $operations[] = [
          $command,
          [$node, $cmdKey],
        ];
      }
    }
    $batch = [
      'title' => t('Running batch verifications'),
      'operations' => $operations,
      'finished' => [self::class, 'finished'],
    ];
    batch_set($batch);
  }

  public static function run_batch_verifications($node, $cmdKey, &$context): void {
    $context['message'] = t('Running: @step', ['@step' => $cmdKey]);
    sleep(3);
  }

  public static function finished($success, $results, $operations): void {
    if ($success) {
      \Drupal::messenger()->addMessage(t('Batch verifications completed.'));
    }
    else {
      \Drupal::messenger()->addMessage(t('Batch verifications failed.'));
    }
  }

}
