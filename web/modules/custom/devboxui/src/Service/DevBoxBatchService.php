<?php

namespace Drupal\devboxui\Service;

use Drupal\node\NodeInterface;

class DevBoxBatchService {

  public function startBatch(NodeInterface $node, $op, array $commands, string $title = ''): void {
    $operations = [];
    foreach ($commands as $step => $command) {
      if (is_array($command)) {
        $operations[] = [
          $command,
          [$node, $op, $step],
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

  public static function run_batch_actions($node, $op, $step, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);
    // Run action
    sleep(2);
  }

  public static function finished($success, $results, $operations): void {
    if ($success) {
      \Drupal::messenger()->addMessage(t('Batch actions completed.'));
    }
    else {
      \Drupal::messenger()->addMessage(t('Batch actions failed.'));
    }
  }

}
