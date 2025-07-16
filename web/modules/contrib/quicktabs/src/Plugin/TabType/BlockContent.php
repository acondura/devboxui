<?php

namespace Drupal\quicktabs\Plugin\TabType;

use Drupal\Core\Block\BlockManagerInterface;
use Drupal\Core\Entity\EntityRepositoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Ajax\AjaxResponse;
use Drupal\Core\Ajax\ReplaceCommand;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Plugin\Context\ContextRepositoryInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\quicktabs\TabTypeBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Provides a 'block content' tab type.
 *
 * @TabType(
 *   id = "block_content",
 *   name = @Translation("block"),
 * )
 */
class BlockContent extends TabTypeBase implements ContainerFactoryPluginInterface {

  /**
   * {@inheritDoc}
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    protected EntityTypeManagerInterface $entityTypeManager,
    protected EntityRepositoryInterface $entityRepository,
    protected BlockManagerInterface $blockManager,
    protected ContextRepositoryInterface $contextRepository,
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
      $container->get('entity.repository'),
      $container->get('plugin.manager.block'),
      $container->get('context.repository'),
      $container->get('current_user')
    );
  }

  use StringTranslationTrait;

  /**
   * {@inheritdoc}
   */
  public function optionsForm(array $tab): array {
    $plugin_id = $this->getPluginDefinition()['id'];
    $form = [];
    $form['bid'] = [
      '#type' => 'select',
      '#options' => $this->getBlockOptions(),
      '#default_value' => $tab['content'][$plugin_id]['options']['bid'] ?? '',
      '#title' => $this->t('Select a block'),
      '#ajax' => [
        'callback' => [$this, 'blockTitleAjaxCallback'],
        'event' => 'change',
        'progress' => [
          'type' => 'throbber',
          'message' => 'Please wait...',
        ],
        'effect' => 'fade',
      ],
    ];
    $form['block_title'] = [
      '#type' => 'textfield',
      '#default_value' => $tab['content'][$plugin_id]['options']['block_title'] ?? '',
      '#title' => $this->t('Block Title'),
      '#prefix' => '<div id="block-title-textfield-' . $tab['delta'] . '">',
      '#suffix' => '</div>',
    ];
    $form['display_title'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Display block title'),
      '#default_value' => $tab['content'][$plugin_id]['options']['display_title'] ?? 0,
    ];
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function render(array $tab) {
    $options = $tab['content'][$tab['type']]['options'];

    if (str_contains($options['bid'], 'block_content')) {
      $parts = explode(':', $options['bid']);
      $block = $this->entityRepository->loadEntityByUuid($parts[0], $parts[1]);
      $block_content = $this->entityTypeManager->getStorage('block_content')->load($block->id());
      $render = $this->entityTypeManager->getViewBuilder('block_content')->view($block_content);

    }
    else {
      // You can hard code configuration, or you load from settings.
      $config = [];
      $plugin_block = $this->blockManager->createInstance($options['bid'], $config);

      // Some blocks might implement access check.
      $access_result = $plugin_block->access($this->currentUser, TRUE);
      // Return empty render array if user doesn't have access.
      if ($access_result->isForbidden()) {
        return [];
      }

      $render = $plugin_block->build();
    }

    return $render;
  }

  /**
   * Get options for the block.
   */
  private function getBlockOptions(): array {

    // Only add blocks which work without any available context.
    $definitions = $this->blockManager->getDefinitionsForContexts($this->contextRepository->getAvailableContexts());
    // Order by category, and then by admin label.
    $definitions = $this->blockManager->getSortedDefinitions($definitions);

    $blocks = [];
    foreach ($definitions as $block_id => $definition) {
      $blocks[$block_id] = $definition['admin_label'] . ' (' . $definition['provider'] . ')';
    }

    return $blocks;
  }

  /**
   * Ajax callback to change block title when block is selected.
   */
  public function blockTitleAjaxCallback(array &$form, FormStateInterface $form_state): AjaxResponse {
    $tab_index = $form_state->getTriggeringElement()['#array_parents'][2];
    $element_id = '#block-title-textfield-' . $tab_index;
    $selected_block = $form_state->getValue('configuration_data')[$tab_index]['content']['block_content']['options']['bid'];

    $definitions = $this->blockManager->getDefinitionsForContexts($this->contextRepository->getAvailableContexts());

    $form['block_title'] = [
      '#type' => 'textfield',
      '#value' => $definitions[$selected_block]['admin_label'],
      '#title' => $this->t('Block Title'),
      '#prefix' => '<div id="block-title-textfield-' . $tab_index . '">',
      '#suffix' => '</div>',
    ];

    $form_state->setRebuild();
    $ajax_response = new AjaxResponse();
    $ajax_response->addCommand(new ReplaceCommand($element_id, $form['block_title']));

    return $ajax_response;
  }

}
