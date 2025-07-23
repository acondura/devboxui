<?php

namespace Drupal\devboxui\Plugin\Action;

use Drupal\Core\Access\AccessResultInterface;
use Drupal\Core\Action\ActionBase;
use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountInterface;
use Drupal\devboxui\Service\DevBoxBatchService;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a custom action.
 *
 * @Action(
 *   id = "devboxui_save_update",
 *   label = @Translation("DevBox Save/Update"),
 *   type = "node",
 *   category = @Translation("DevBoxUI"),
 *   context = {
 *     "entity" = @ContextDefinition("entity:node", label = @Translation("Node"))
 *   }
 * )
 */
final class DevBoxSaveUpdate extends ActionBase implements ContainerFactoryPluginInterface {

  protected DevBoxBatchService $batchService;

  public function __construct(array $configuration, $plugin_id, $plugin_definition, DevBoxBatchService $batchService) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
    $this->batchService = $batchService;
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('devboxui.batch')
    );
  }

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
      if ($node->isNew()) {
        $operation = 'create';
      } else {
        $operation = 'update';
      }

      $vps_nodes = $node->get('field_vps_provider')->getValue();
      $total = count($vps_nodes);
      $title = "Provisioning VPS request";

      $commands = [];
      for ($j = 0; $j < $total; $j++) {
        $i = $j + 1;
        $commands["($i/$total) VPS created"] = [DevBoxBatchService::class, 'run_batch_actions'];
        $commands["($i/$total) Ubuntu package updates"] = [DevBoxBatchService::class, 'run_batch_actions'];
        $commands["($i/$total) Ubuntu package upgrades"] = [DevBoxBatchService::class, 'run_batch_actions'];
      }

      $this->batchService->startBatch($node, $operation, $commands, $title);
    }
  }

}
