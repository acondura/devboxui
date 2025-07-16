<?php

namespace Drupal\quicktabs\Plugin\TabType;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\quicktabs\TabTypeBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a 'qtabs content' tab type.
 *
 * @TabType(
 *   id = "qtabs_content",
 *   name = @Translation("qtabs"),
 * )
 */
class QtabsContent extends TabTypeBase implements ContainerFactoryPluginInterface {

  use StringTranslationTrait;

  /**
   * {@inheritDoc}
   */
  public function __construct(array $configuration, $plugin_id, $plugin_definition, protected EntityTypeManagerInterface $entityTypeManager) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  /**
   * {@inheritDoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): static {
    return new static(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('entity_type.manager')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function optionsForm(array $tab): array {
    $plugin_id = $this->getPluginDefinition()['id'];
    $form = [];
    $tab_options = [];
    foreach ($this->entityTypeManager->getStorage('quicktabs_instance')->loadMultiple() as $machine_name => $entity) {
      // Do not offer the option to put a tab inside itself.
      if (!isset($tab['entity_id']) || $machine_name != $tab['entity_id']) {
        $tab_options[$machine_name] = $entity->label();
      }
    }
    $form['machine_name'] = [
      '#type' => 'select',
      '#title' => $this->t('QuickTabs instance'),
      '#description' => $this->t('The QuickTabs instance to put inside this tab.'),
      '#options' => $tab_options,
      '#default_value' => $tab['content'][$plugin_id]['options']['machine_name'] ?? '',
    ];
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function render(array $tab) {
    $options = $tab['content'][$tab['type']]['options'];
    $qt = $this->entityTypeManager->getStorage('quicktabs_instance')->load($options['machine_name']);

    return $qt->getRenderArray();
  }

}
