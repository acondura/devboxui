<?php

namespace Drupal\devboxui\Service;

use Drupal\node\NodeInterface;
use Drupal\devboxui\VpsProviderManager;

/**
 * Service for handling DevBox batch operations.
 */
class DevBoxBatchService {

  /**
   * The VPS provider plugin manager.
   *
   * @var \Drupal\devboxui\VpsProviderManager
   */
  protected VpsProviderManager $vpsProviderManager;

  /**
   * Constructs a DevBoxBatchService object.
   *
   * @param \Drupal\devboxui\VpsProviderManager $vpsProviderManager
   *   The VPS provider plugin manager service.
   */
  public function __construct(VpsProviderManager $vpsProviderManager) {
    $this->vpsProviderManager = $vpsProviderManager;
  }

  /**
   * Starts a Drupal batch operation for VPS provisioning steps.
   *
   * @param \Drupal\node\NodeInterface $node
   *   The node entity.
   * @param string $op
   *   The operation type (e.g. 'create', 'update').
   * @param array $commands
   *   The batch commands to execute.
   * @param string $title
   *   The batch title.
   */
  public function startBatch(NodeInterface $node, $op, array $commands, string $title = ''): void {
    $operations = [];
    foreach ($commands as $step => $command) {
      if (is_array($command)) {
        $paragraph_id = key($command);
        $callback = current($command); // The batch callback, e.g. [self::class, 'provision_vps']
        $operations[] = [
          $callback,
          [$node, $op, $step, $paragraph_id],
        ];
      }
    }
    $batch = [
      'title' => $title,
      'operations' => $operations,
      'finished' => [get_class($this), 'finished'],
    ];
    batch_set($batch);
  }

  /**
   * Batch finished callback.
   */
  public static function finished($success, $results, $operations): void {
    // Add messages or handle results after batch
  }

  /**
   * Batch callback for provisioning a VPS.
   *
   * @param \Drupal\node\NodeInterface $node
   *   The node entity.
   * @param string $op
   *   The operation type.
   * @param string $step
   *   The step label.
   * @param int $paragraph_id
   *   The paragraph entity ID.
   * @param array $context
   *   The batch context array.
   */
  public static function provision_vps($node, $op, $step, $paragraph_id, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);

    // Load the paragraph entity and get the response field.
    $paragraph = entityManage('paragraph', $paragraph_id);
    \Drupal::service('plugin.manager.vps_provider')->createInstance($paragraph->getType())->create_vps($paragraph);
  }

  /**
   * Batch callback for running SSH commands.
   */
  public static function ssh($node, $op, $step, $paragraph_id, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);
    // Run SSH action logic here.
    sleep(1); // Simulate time-consuming work.
  }

  /**
   * Batch callback for provisioning a VPS.
   *
   * @param \Drupal\node\NodeInterface $node
   *   The node entity.
   * @param string $op
   *   The operation type.
   * @param string $step
   *   The step label.
   * @param int $paragraph_id
   *   The paragraph entity ID.
   * @param array $context
   *   The batch context array.
   */
  public static function delete_vps($node, $op, $step, $paragraph_id, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);

    // Load the paragraph entity and get the response field.
    $paragraph = entityManage('paragraph', $paragraph_id);
    \Drupal::service('plugin.manager.vps_provider')->createInstance($paragraph->getType())->delete_vps($paragraph);
  }
}
