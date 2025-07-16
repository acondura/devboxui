<?php

namespace Drupal\quicktabs\Plugin\TabType;

use Drupal\Core\Entity\EntityDisplayRepositoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\quicktabs\TabTypeBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a 'node content' tab type.
 *
 * @TabType(
 *   id = "node_content",
 *   name = @Translation("node"),
 * )
 */
class NodeContent extends TabTypeBase implements ContainerFactoryPluginInterface {

  use StringTranslationTrait;

  /**
   * {@inheritDoc}
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected EntityDisplayRepositoryInterface $entityDisplayRepository,
    protected AccountProxyInterface $currentUser,
  ) {
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
      $container->get('entity_type.manager'),
      $container->get('entity_display.repository'),
      $container->get('current_user')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function optionsForm(array $tab): array {
    $plugin_id = $this->getPluginDefinition()['id'];

    $form = [];
    $form['nid'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Node'),
      '#description' => $this->t('The node ID of the node.'),
      '#maxlength' => 10,
      '#size' => 20,
      '#default_value' => $tab['content'][$plugin_id]['options']['nid'] ?? '',
    ];
    $view_modes = $this->entityDisplayRepository->getViewModes('node');
    $options = [];
    foreach ($view_modes as $view_mode_name => $view_mode) {
      $options[$view_mode_name] = $view_mode['label'];
    }
    $form['view_mode'] = [
      '#type' => 'select',
      '#title' => $this->t('View mode'),
      '#options' => $options,
      '#default_value' => $tab['content'][$plugin_id]['options']['view_mode'] ?? 'full',
    ];
    $form['hide_title'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Hide the title of this node'),
      '#default_value' => $tab['content'][$plugin_id]['options']['hide_title'] ?? 1,
    ];
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function render(array $tab): array|string {
    $options = $tab['content'][$tab['type']]['options'];
    $node = $this->entityTypeManager->getStorage('node')->load($options['nid']);

    if ($node !== NULL) {

      $access_result = $node->access('view', $this->currentUser, TRUE);
      // Return empty render array if user doesn't have access.
      if ($access_result->isForbidden()) {
        return [];
      }

      $build = $this->entityTypeManager->getViewBuilder('node')->view($node, $options['view_mode']);

      if ($options['hide_title']) {
        $build['#node']->setTitle(NULL);
      }

      return $build;
    }

    return [];
  }

}
