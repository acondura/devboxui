<?php

namespace Drupal\quicktabs\Plugin\Derivative;

use Drupal\Component\Plugin\Derivative\DeriverBase;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Plugin\Discovery\ContainerDeriverInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides block plugin definitions for quicktabs blocks.
 *
 * @see \Drupal\quicktabs\Plugin\Block\QuickTabsBlock
 */
class QuickTabsBlock extends DeriverBase implements ContainerDeriverInterface {

  /**
   * Constructs a new QuickTabsBlock.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entityTypeManager
   *   Entity Type Manager.
   */
  public function __construct(protected EntityTypeManagerInterface $entityTypeManager) {
  }

  /**
   * {@inheritDoc}
   */
  public static function create(ContainerInterface $container, $base_plugin_id): static {
    return new static(
      $container->get('entity_type.manager')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function getDerivativeDefinitions($base_plugin_definition): array {
    foreach ($this->entityTypeManager->getStorage('quicktabs_instance')->loadMultiple() as $machine_name => $entity) {
      $this->derivatives[$machine_name] = $base_plugin_definition;
      $this->derivatives[$machine_name]['admin_label'] = 'QuickTabs - ' . $entity->label();
    }

    return parent::getDerivativeDefinitions($base_plugin_definition);
  }

}
