<?php

namespace Drupal\admin_dialogs;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Entity\EntityListBuilder;
use Drupal\Core\Entity\EntityDeleteForm;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityFormInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Url;
use Drupal\Core\Cache\RefinableCacheableDependencyInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\Component\Serialization\Json;
use Drupal\views_ui\ViewUI;
use Drupal\admin_dialogs\Controller\AdminDialogGroupListBuilder;
use Drupal\admin_dialogs\Controller\AdminDialogListBuilder;
use Drupal\admin_dialogs\Entity\Form\AdminDialogEditForm;
use Drupal\admin_dialogs\Entity\Form\AdminDialogGroupEditForm;

/**
 * Admin Dialogs module.
 */
class AdminDialogsModule {

  use StringTranslationTrait;

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The config factory.
   *
   * @var \Drupal\Core\Config\ConfigFactoryInterface
   */
  protected $configFactory;

  /**
   * {@inheritdoc}
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager, ConfigFactoryInterface $config_factory) {
    $this->entityTypeManager = $entity_type_manager;
    $this->configFactory = $config_factory;
  }

  /**
   * Implements hook_theme().
   */
  public function theme() {
    return [
      'admin_dialog_form' => [
        'render element' => 'form',
      ],
      'admin_dialogs_help' => [
        'variables' => []
      ],
    ];
  }

  /**
   * Implements hook_form_alter().
   */
  public function form_alter(&$form, FormStateInterface $form_state, $form_id) {
    if ($form_state->getFormObject() instanceof EntityFormInterface) {
      $entity = $form_state->getFormObject()->getEntity();
    }
    $config = $this->configFactory->get('admin_dialogs.settings');
    if ($config->get('delete_buttons') && !empty($form['actions']['delete'])) {
      $classes = !empty($form['actions']['delete']['#attributes']['class'])
        ? $form['actions']['delete']['#attributes']['class'] : [];
      $form['actions']['delete']['#attributes'] = [
        'class' => array_merge(['use-ajax'], (is_string($classes) ? [$classes] : $classes)),
        'data-dialog-type' => 'modal',
        'data-dialog-options' => Json::encode(['width' => 600]),
      ];
    }
    if (!empty($form['actions']['cancel'])) {
      $classes = !empty($form['actions']['cancel']['#attributes']['class'])
        ? $form['actions']['cancel']['#attributes']['class'] : [];
      $form['actions']['cancel']['#attributes']['class'] = array_merge(['dialog-cancel'], (is_string($classes) ? [$classes] : $classes));
      if (!empty($form['description']['#markup'])) {
        $form['description']['#prefix'] = '<p>';
        $form['description']['#suffix'] = '</p>';
      }
    }
    if ($config->get('other_buttons')) {
      if (!empty($form['actions']['delete_translation'])) {
        $classes = !empty($form['actions']['delete_translation']['#attributes']['class'])
          ? $form['actions']['delete_translation']['#attributes']['class'] : [];
        $form['actions']['delete_translation']['#attributes'] = [
          'class' => array_merge(['use-ajax'], (is_string($classes) ? [$classes] : $classes)),
          'data-dialog-type' => 'modal',
          'data-dialog-options' => Json::encode(['width' => 600]),
        ];
      }
    }
    if ($config->get('submit_spinner') && \Drupal::service('router.admin_context')->isAdminRoute()) {
      $form['#attached']['library'][] = 'admin_dialogs/admin_dialogs.spinner';
      if (!empty($form['actions']['submit'])) {
        $form['actions']['submit']['#prefix'] = '<div class="admin-dialogs-button-wrapper"><span class="admin-dialogs-spinner"></span>';
        $form['actions']['submit']['#suffix'] = '</div>';
      }
    }
  }

  /**
   * Implements hook_entity_operation_alter().
   */
  public function entity_operation_alter(array &$operations, EntityInterface $entity) {
    if (in_array($entity->getEntityTypeId(), ['admin_dialog', 'admin_dialog_group'])) {
      $attributes = [
        'class' => ['use-ajax'],
        'data-dialog-type' => 'modal',
        'data-dialog-options' => Json::encode(['width' => 600]),
      ];
      if (!empty($operations['delete'])) {
        $classes = !empty($operations['delete']['attributes']['class'])
          ? $operations['delete']['attributes']['class'] : [];
        $attributes['class'] = array_merge($attributes['class'], (is_string($classes) ? [$classes] : $classes));
        $operations['delete']['attributes'] = $attributes;
      }
      if (!empty($operations['edit'])) {
        $classes = !empty($operations['edit']['attributes']['class'])
          ? $operations['edit']['attributes']['class'] : [];
        $attributes['class'] = array_merge($attributes['class'], (is_string($classes) ? [$classes] : $classes));
        $operations['edit']['attributes'] = $attributes;
      }
    }
    $config = $this->configFactory->get('admin_dialogs.settings');
    if ($config->get('delete_ops') && !empty($operations['delete'])) {
      $classes = !empty($operations['delete']['attributes']['class'])
        ? $operations['delete']['attributes']['class'] : [];
      $operations['delete']['attributes'] = [
        'class' => array_merge(['use-ajax'], (is_string($classes) ? [$classes] : $classes)),
        'data-dialog-type' => 'modal',
        'data-dialog-options' => Json::encode(['width' => 600]),
      ];
    }
    $dialogs = $this->entityTypeManager->getStorage('admin_dialog')->loadByProperties(['type' => 'ops', 'status' => 1]);
    foreach ($dialogs as $dialog) {
      $criteria = $dialog->getSelectionCriteria();
      if (!empty($criteria['key']) && !empty($operations[$criteria['key']])) {
        if ($this->checkEntityTypeMatch($entity, $criteria)) {
          $attributes = $this->getAttributes($dialog);
          $classes = !empty($operations[$criteria['key']]['attributes']['class'])
            ? $operations[$criteria['key']]['attributes']['class'] : [];
          $attributes['class'] = array_merge($attributes['class'], (is_string($classes) ? [$classes] : $classes));
          $operations[$criteria['key']]['attributes'] = $attributes;
        }
      }
    }
  }

  /**
   * Implements hook_menu_local_tasks_alter().
   */
  public function menu_local_tasks_alter(&$data, $route_name, RefinableCacheableDependencyInterface &$cacheability) {
    $dialogs = $this->entityTypeManager->getStorage('admin_dialog')->loadByProperties(['type' => 'tasks', 'status' => 1]);
    foreach ($dialogs as $dialog) {
      $criteria = $dialog->getSelectionCriteria();
      if (!empty($criteria['routes'])) {
        foreach ($criteria['routes'] as $route) {
          foreach ($data as $key => $items) {
            if (!empty($items)) {
              foreach ($items as $index => $link) {
                if (!empty($link[$route])) {
                  $attributes = $this->getAttributes($dialog);
                  $link_attributes = $data[$key][$index][$route]['#link']['url']->getOption('attributes');
                  $classes = !empty($link_attributes['class']) ? $link_attributes['class'] : [];
                  $attributes['class'] = array_merge($attributes['class'], $classes);
                  $data[$key][$index][$route]['#link']['url']->setOption('attributes', $attributes);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Implements hook_menu_local_actions_alter().
   */
  public function menu_local_actions_alter(&$local_actions) {
    $dialogs = $this->entityTypeManager->getStorage('admin_dialog')->loadByProperties(['type' => 'actions', 'status' => 1]);
    foreach ($dialogs as $dialog) {
      $criteria = $dialog->getSelectionCriteria();
      if (!empty($criteria['routes'])) {
        foreach ($criteria['routes'] as $route) {
          foreach ($local_actions as $action_route => $params) {
            $attributes = $this->getAttributes($dialog);
            $classes = !empty($local_actions[$action_route]['options']['attributes']['class'])
              ? $local_actions[$action_route]['options']['attributes']['class'] : [];
            $attributes['class'] = array_merge($classes, $attributes['class']);
            if (strstr($route, '*')) {
              $needle = str_replace('*', '', $route);
              if (strstr($action_route, $needle)) {
                $local_actions[$action_route]['options']['attributes'] = $attributes;
              }
            }
            else {
              if ($action_route === $route) {
                $local_actions[$route]['options']['attributes'] = $attributes;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Implements hook_entity_type_build().
   */
  public function entity_type_build(array &$entity_types) {
    if (array_key_exists('admin_dialog', $entity_types)) {
      $entity_types['admin_dialog']
        ->set('admin_permission', 'administer dialogs')
        ->setHandlerClass('list_builder', AdminDialogListBuilder::class)
        ->setFormClass('add', AdminDialogEditForm::class)
        ->setFormClass('edit', AdminDialogEditForm::class)
        ->setFormClass('delete', EntityDeleteForm::class)
        ->setLinkTemplate('list-form', '/admin/config/user-interface/dialogs/manage/{admin_dialog_group}/dialogs')
        ->setLinkTemplate('edit-form', '/admin/config/user-interface/dialogs/edit/{admin_dialog}')
        ->setLinkTemplate('delete-form', '/admin/config/user-interface/dialogs/delete/{admin_dialog}');
    }

    if (array_key_exists('admin_dialog_group', $entity_types)) {
      $entity_types['admin_dialog_group']
        ->set('admin_permission', 'administer dialogs')
        ->setHandlerClass('list_builder', AdminDialogGroupListBuilder::class)
        ->setFormClass('add', AdminDialogGroupEditForm::class)
        ->setFormClass('edit', AdminDialogGroupEditForm::class)
        ->setFormClass('delete', EntityDeleteForm::class)
        ->setLinkTemplate('edit-form', '/admin/config/user-interface/dialogs/manage/{admin_dialog_group}')
        ->setLinkTemplate('delete-form', '/admin/config/user-interface/dialogs/manage/{admin_dialog_group}/delete');
    }
  }

  /**
   * Implements hook_entity_type_build().
   */
  public function views_ui_display_top_links(&$links, ViewUI $view, $display_id) {
    $config = $this->configFactory->get('admin_dialogs.settings');
    if ($config->get('other_buttons')) {
      $attributes = [
        'class' => ['use-ajax'],
        'data-dialog-type' => 'modal',
        'data-dialog-options' => Json::encode(['width' => 600]),
      ];
      if (!empty($links['delete'])) {
        $links['delete']['url']->setOption('attributes', $attributes);
      }
      if (!empty($links['duplicate'])) {
        $links['duplicate']['url']->setOption('attributes', $attributes);
      }
    }
  }

  /**
   * Implements hook_page_attachments().
   */
  public function page_attachments(array &$attachments) {
    $paths = [];
    $selectors = [];
    $admin_dialog_storage = $this->entityTypeManager->getStorage('admin_dialog');
    $query = $admin_dialog_storage->getQuery();
    $query->condition('type', ['paths', 'selectors'], 'IN')
      ->condition('status', 1);
    $entity_ids = $query->execute();
    $dialogs = $admin_dialog_storage->loadMultiple($entity_ids);
    foreach ($dialogs as $dialog) {
      $type = $dialog->get('type');
      $criteria = $dialog->getSelectionCriteria();
      if ($type == 'paths' && !empty($criteria['paths'])) {
        foreach ($criteria['paths'] as $path) {
          $paths[$path] = $this->getAttributes($dialog);
        }
      }
      if ($type == 'selectors' && !empty($criteria['selectors'])) {
        foreach ($criteria['selectors'] as $selector) {
          $selectors[$selector] = $this->getAttributes($dialog);
        }
      }
    }
    $attachments['#attached']['drupalSettings']['admin_dialogs']['paths'] = $paths;
    $attachments['#attached']['drupalSettings']['admin_dialogs']['selectors'] = $selectors;
    $attachments['#attached']['library'][] = 'admin_dialogs/admin_dialogs.selector';
  }

  /**
   * Implements hook_help().
   */
  public function help($route_name, RouteMatchInterface $route_match) {
    switch ($route_name) {
      case 'help.page.admin_dialogs':
        $output = '';
        $output .= '<p>' . $this->t('The <strong><em>Admin Dialogs</em></strong> module intends to improve UI by reducing number of page loads. Instead of opening delete confirmation page the module will show the form in a dialog (modal) form. This module is a great companion to the <a href="https://www.drupal.org/project/admin_toolbar">Admin Toolbar</a> module.') . '</p>';
        $output .= '<h3>' . $this->t('Key Features') . '</h3>';
        $output .= '<p>' . $this->t('The module comes with ability to add <strong>modal</strong> or <strong>off-canvas</strong> dialogs to different links in Drupal.') . '</p>';
        $output .= '<p>' . $this->t('<ul>
            <li>Easy to use. Most features available after installing the module.</li>
            <li>Adds controls dialog type for operation links like Edit, Delete etc.</li>
            <li>Adds and controls dialog type for local tasks.</li>
            <li>Adds and controls dialog types for local actions.</li>
            <li>Adds option to control delete button dialog.</li>
            <li>You can add support for you modules by adding configs created in the module.</li>
          </ul>') . '</p>';
        return $output;
      case 'entity.admin_dialog.list':
        return '<p>' . $this->t('Make various Drupal UI elements open in modal or off-canvas dialogs.
          <strong>Please clear Drupal cache when you make changes to the dialog configurations</strong>.') . '</p>';
    }
  }

  /**
   * Check if entity type and a bundle match criteria.
   */
  protected function checkEntityTypeMatch($entity, $criteria) {
    $matched = FALSE;
    if (!empty($criteria['entity_type'])) {
      if ($entity->getEntityTypeId() == $criteria['entity_type']) {
        $matched = TRUE;
        if (!empty($criteria['bundles'])) {
          $matched = in_array($entity->bundle(), $criteria['bundles']);
        }
      }
    }
    return $matched;
  }

  /**
   * Get dialog attributes.
   */
  protected function getAttributes($dialog) {
    $options = ['width' => $dialog->getDialogWidth()];
    if ($title_override = $dialog->getDialogTitleOverride()) {
      $options['title'] = $title_override;
    }
    $attributes = [
      'class' => ['use-ajax'],
      'data-dialog-type' => 'modal',
      'data-dialog-options' => Json::encode($options),
    ];
    if ($dialog->getDialogType() == 'off_canvas') {
      $attributes['data-dialog-type'] = 'dialog';
      $attributes['data-dialog-renderer'] = 'off_canvas';
    }
    return $attributes;
  }

}
