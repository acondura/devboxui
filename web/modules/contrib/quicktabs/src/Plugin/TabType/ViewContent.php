<?php

namespace Drupal\quicktabs\Plugin\TabType;

use Drupal\Core\Ajax\AjaxResponse;
use Drupal\Core\Ajax\ReplaceCommand;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Language\LanguageManagerInterface;
use Drupal\Core\Path\CurrentPathStack;
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountProxyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\path_alias\AliasManagerInterface;
use Drupal\quicktabs\TabTypeBase;
use Drupal\views\Views;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Provides a 'view content' tab type.
 *
 * @TabType(
 *   id = "view_content",
 *   name = @Translation("view"),
 * )
 */
class ViewContent extends TabTypeBase implements ContainerFactoryPluginInterface {

  use StringTranslationTrait;

  /**
   * {@inheritdoc}
   */
  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    protected CurrentPathStack $currentPath,
    protected RequestStack $requestStack,
    protected LanguageManagerInterface $languageManager,
    protected AliasManagerInterface $aliasManager,
    protected AccountProxyInterface $currentUser,
    protected EntityTypeManagerInterface $entityTypeManager,
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
      $container->get('path.current'),
      $container->get('request_stack'),
      $container->get('language_manager'),
      $container->get('path_alias.manager'),
      $container->get('current_user'),
      $container->get('entity_type.manager')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function optionsForm(array $tab): array {
    $plugin_id = $this->getPluginDefinition()['id'];
    $views = $this->getViews();
    $views_keys = array_keys($views);
    $selected_view = ($tab['content'][$plugin_id]['options']['vid'] ?? ($views_keys[0] ?? ''));

    $form = [];
    $form['vid'] = [
      '#type' => 'select',
      '#options' => $views,
      '#default_value' => $selected_view,
      '#title' => $this->t('Select a view'),
      '#ajax' => [
        'callback' => [static::class, 'viewsDisplaysAjaxCallback'],
        'event' => 'change',
        'progress' => [
          'type' => 'throbber',
          'message' => 'Please wait...',
        ],
        'effect' => 'fade',
      ],
    ];
    $form['display'] = [
      '#type' => 'select',
      '#title' => 'display',
      '#options' => ViewContent::getViewDisplays($selected_view),
      '#default_value' => $tab['content'][$plugin_id]['options']['display'] ?? '',
      '#prefix' => '<div id="view-display-dropdown-' . $tab['delta'] . '">',
      '#suffix' => '</div>',
    ];
    $form['args'] = [
      '#type' => 'textfield',
      '#title' => 'arguments',
      '#size' => '40',
      '#required' => FALSE,
      '#default_value' => $tab['content'][$plugin_id]['options']['args'] ?? '',
      '#description' => $this->t('Additional arguments to send to the view as if they were part of the URL in the form of arg1/arg2/arg3. You may use %1, %2, ..., %N to grab arguments from the URL.'),
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function render(array $tab) {
    $options = $tab['content'][$tab['type']]['options'];
    $args = empty($options['args']) ? [] : array_map('trim', explode('/', $options['args']));

    $current_path = $this->currentPath->getPath();

    // If the request is an ajax callback we need to use
    // $_SERVER['HTTP_REFERER'] to get current path.
    if (str_contains($current_path, '/quicktabs/ajax/')) {
      $request = $this->requestStack->getCurrentRequest();
      if ($request->server->get('HTTP_REFERER')) {
        $referer = parse_url($request->server->get('HTTP_REFERER'), PHP_URL_PATH);

        // Stripping the language path prefix.
        $current_language = $this->languageManager->getCurrentLanguage()->getId();
        $path = str_replace("/$current_language/", '/', $referer);

        $current_path = $this->aliasManager->getPathByAlias($path);
      }

    }
    $url_args = explode('/', $current_path);
    foreach ($url_args as $id => $arg) {
      $args = str_replace("%$id", $arg, $args);
    }
    $args = preg_replace(',/?(%\d),', '', $args);

    $view = Views::getView($options['vid']);

    // Return empty render array if user doesn't have access.
    if (!$view->access($options['display'], $this->currentUser)) {
      return [];
    }

    // Return empty if the view is empty.
    $view_results = views_get_view_result($options['vid'], $options['display']);
    if (!$view_results && !empty($options['vid']) && !empty($options['display'])) {
      // If the initial view is empty, check the attachments.
      $view = Views::getView($options['vid']);
      $view->setDisplay($options['display']);
      $display = $view->getDisplay();
      $attachments = $display->getAttachedDisplays();

      // If there are attachments, check if they are empty.
      if (!empty($attachments)) {
        foreach ($attachments as $attachment) {
          if (!empty(views_get_view_result($options['vid'], $attachment))) {
            $view_results = TRUE;
          }
        }
      }

      if (!$display->outputIsEmpty()) {
        $view_results = TRUE;
      }
    }

    if (empty($view_results)) {
      return [];
    }
    else {
      $render = $view->buildRenderable($options['display'], $args);
    }

    return $render;
  }

  /**
   * Ajax callback to change views displays when view is selected.
   */
  public static function viewsDisplaysAjaxCallback(array &$form, FormStateInterface $form_state): AjaxResponse {
    $tab_index = $form_state->getTriggeringElement()['#array_parents'][2];
    $element_id = '#view-display-dropdown-' . $tab_index;
    $ajax_response = new AjaxResponse();
    $ajax_response->addCommand(new ReplaceCommand($element_id, $form['configuration_data_wrapper']['configuration_data'][$tab_index]['content']['view_content']['options']['display']));

    return $ajax_response;
  }

  /**
   * Get list of enabled views.
   */
  private function getViews(): array {
    $views = [];
    foreach (Views::getEnabledViews() as $view_name => $view) {
      $views[$view_name] = $view->label() . ' (' . $view_name . ')';
    }

    ksort($views);
    return $views;
  }

  /**
   * Get displays for a given view.
   */
  public function getViewDisplays($view_name): array {
    $displays = [];
    if (empty($view_name)) {
      return $displays;
    }

    $view = $this->entityTypeManager->getStorage('view')->load($view_name);
    if (!$view) {
      return $displays;
    }
    foreach ($view->get('display') as $id => $display) {
      $enabled = !empty($display['display_options']['enabled']) || !array_key_exists('enabled', $display['display_options']);
      if ($enabled) {
        $displays[$id] = $id . ': ' . $display['display_title'];
      }
    }

    return $displays;
  }

}
