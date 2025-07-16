<?php

declare(strict_types = 1);

namespace Drupal\admin_dialogs\Controller;

use Drupal\Core\Config\Entity\ConfigEntityListBuilder;
use Drupal\Core\Entity\EntityInterface;
use Drupal\Core\Url;

/**
 * Provides a listing of admin dialog group entities.
 *
 * @ingroup admin_dialogs
 */
class AdminDialogGroupListBuilder extends ConfigEntityListBuilder {

  /**
   * {@inheritdoc}
   */
  public function buildHeader(): array {
    $header = [];
    $header['label'] = $this->t('Dialog Group');
    $header['machine_name'] = $this->t('Machine Name');
    $header['description'] = $this->t('Description');
    return $header + parent::buildHeader();
  }

  /**
   * {@inheritdoc}
   */
  public function buildRow(EntityInterface $entity): array {
    $row = [];
    $row['label'] = $entity->label();
    $row['machine_name'] = $entity->id();
    $row['description'] = $entity->getDescription();
    return $row + parent::buildRow($entity);
  }

  /**
   * {@inheritdoc}
   */
  public function getDefaultOperations(EntityInterface $entity): array {
    $operations = parent::getDefaultOperations($entity);
    $operations['list'] = [
      'title' => $this->t('List Dialogs'),
      'weight' => 0,
      'url' => Url::fromRoute('entity.admin_dialog.list', ['admin_dialog_group' => $entity->id()]),
    ];
    return $operations;
  }

}
