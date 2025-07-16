<?php

declare(strict_types = 1);

namespace Drupal\admin_dialogs\Controller;

use Drupal\Core\Config\Entity\ConfigEntityListBuilder;
use Drupal\Core\Entity\EntityHandlerInterface;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Entity\EntityStorageInterface;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Routing\CurrentRouteMatch;
use Drupal\Core\Url;
use Drupal\Core\Render\Markup;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Drupal\admin_dialogs\Entity\AdminDialogGroupEntity;

/**
 * Provides a listing of admin dialog entities in a given group.
 *
 * @ingroup admin_dialogs
 */
class AdminDialogListBuilder extends ConfigEntityListBuilder implements EntityHandlerInterface {

  protected CurrentRouteMatch $currentRouteMatch;

  /**
   * Constructs a new AdminDialogListBuilder object.
   */
  public function __construct(EntityTypeInterface $entity_type, EntityStorageInterface $storage, CurrentRouteMatch $current_route_match) {
    parent::__construct($entity_type, $storage);
    $this->currentRouteMatch = $current_route_match;
  }

  /**
   * {@inheritdoc}
   */
  public static function createInstance(ContainerInterface $container, EntityTypeInterface $entity_type): self {
    return new static(
      $entity_type,
      $container->get('entity_type.manager')->getStorage($entity_type->id()),
      $container->get('current_route_match')
    );
  }

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    $header = [];
    $header['label'] = $this->t('Label');
    $header['type'] = $this->t('Type');
    $header['dialog_type'] = $this->t('Dialog');
    $header['dialog_width'] = $this->t('Width');
    $header['status'] = $this->t('Status');
    return $header + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    $row = [];
    $row['label'] = $entity->label()
      . ($entity->getType() == 'ops' && !$entity->entityTypeExists() ? '*' : '');
    $row['type'] = $entity->getType(FALSE);
    $row['dialog_type'] = $entity->getDialogType(FALSE);
    $row['dialog_width'] = $entity->getDialogWidth();
    $row['status'] = Markup::create('<span class="views-field">' . ($entity->get('status')
        ? '<span class="marker marker--published">' . $this->t('Active') . '</span>'
        : '<span class="marker">' . $this->t('Disabled') . '</span>') . '</span>');
    return $row + parent::buildRow($entity);
  }

  /**
   * {@inheritdoc}
   */
  public function getDefaultOperations(EntityInterface $entity): array {
    $operations = parent::getDefaultOperations($entity);
    $operations['edit'] = [
      'title' => $this->t('Edit'),
      'weight' => 0,
      'url' => $this->ensureDestination(Url::fromRoute('entity.admin_dialog.edit_form', [
        'admin_dialog' => $entity->id(),
      ])),
    ];
    $operations['delete'] = [
      'title' => $this->t('Delete'),
      'weight' => 10,
      'url' => $this->ensureDestination(Url::fromRoute('entity.admin_dialog.delete_form', [
        'admin_dialog' => $entity->id(),
      ])),
    ];
    if ($entity->getType() == 'ops' && !$entity->entityTypeExists()) {
      unset($operations['edit']);
    }
    return $operations;
  }

  /**
   * {@inheritdoc}
   */
  public function render() {
    $build = parent::render();
    $build['#attached']['library'][] = 'admin_dialogs/admin_dialogs.admin';
    if (!empty($build['table']['#rows'])) {
      $build['table']['#suffix'] = '<br/><div class="block-help-block"><p>* - missing module or deleted entity type.</p></div>';
    }
    return $build;
  }

  /**
   * Retrieve the dialogs belonging to the appropriate group.
   */
  protected function getEntityIds(): array {
    $dialog_group = $this->currentRouteMatch->getParameter('admin_dialog_group');

    $query = $this->getStorage()->getQuery()
      ->accessCheck(TRUE)
      ->sort($this->entityType->getKey('id'));

    $dialog_groups = AdminDialogGroupEntity::loadMultiple();

    if (array_key_exists($dialog_group, $dialog_groups)) {
      $query->condition('dialog_group', $dialog_group);
    }
    else {
      $query->notExists('dialog_group');
    }
    if ($this->limit) {
      $query->pager($this->limit);
    }
    return $query->execute();
  }

  /**
   * Add group route parameter.
   */
  protected function addGroupParameter(Url $url, $dialog_group): void {
    if (!$dialog_group) {
      $dialog_group = 'administrative';
    }
    $route_parameters = $url->getRouteParameters() + ['admin_dialog_group' => $dialog_group];
    $url->setRouteParameters($route_parameters);
  }

}
