<?php

namespace Drupal\devboxui\Service;

use Drupal\node\NodeInterface;

class DevBoxBatchService {

  public function startBatch(NodeInterface $node, $op, array $commands, string $title = ''): void {
    $operations = [];
    foreach ($commands as $step => $command) {
    if (is_array($command)) {
        $paragraph_id = key($command);
        $cmd = current($command);
        $operations[] = [
          $cmd,
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

  public static function provision_vps($node, $op, $step, $paragraph_id, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);
    $paragraph = entityManage('paragraph', $paragraph_id);
    $response = $paragraph->get('field_response')->getString();
    if (emtpy($response)) {
      // create vps
    }
    sleep(1);
  }

  public static function ssh($node, $op, $step, $paragraph_id, &$context): void {
    $context['message'] = t('@step', ['@step' => $step]);
    // Run action
    sleep(1);
  }

  public static function finished($success, $results, $operations): void {
    // messages
  }

}
