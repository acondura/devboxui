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
 *   id = "devboxui_delete",
 *   label = @Translation("DevBox Delete"),
 *   type = "node",
 *   category = @Translation("DevBoxUI"),
 *   context = {
 *     "entity" = @ContextDefinition("entity:node", label = @Translation("Node"))
 *   }
 * )
 */
final class DevBoxDelete extends ActionBase {

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
      $vps_nodes = $node->get('field_vps_provider')->getValue();
      $total = count($vps_nodes);
      $i = 1;
      foreach ($vps_nodes as $vps_node) {
        $title = "Deleting VPS $i";
        $commands = [
          'Step 1 completed' => [self::class, 'run_batch_actions'],
          'Step 2 completed' => [self::class, 'run_batch_actions'],
          'Step 3 completed' => [self::class, 'run_batch_actions'],
        ];
        $this->batch_wrapper($commands, $node, $title);
        $i++;
      }
    }
  }

  public function batch_wrapper($commands = [], $node, $title): void {
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
      'title' => $title,
      'operations' => $operations,
      'finished' => [self::class, 'finished'],
    ];
    batch_set($batch);
  }

  public static function run_batch_actions($node, $cmdKey, &$context): void {
    $context['message'] = t('Running: @step', ['@step' => $cmdKey]);
    sleep(1);
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
