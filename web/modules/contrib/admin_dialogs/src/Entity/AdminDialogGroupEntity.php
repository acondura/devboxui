<?php

declare(strict_types = 1);

namespace Drupal\admin_dialogs\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;
use Drupal\Core\StringTranslation\StringTranslationTrait;

/**
 * Defines the Admin Dialog Group entity.
 *
 * @ConfigEntityType(
 *   id = "admin_dialog_group",
 *   label = @Translation("Admin Dialog Group"),
 *   module = "admin_dialogs",
 *   entity_keys = {
 *     "id" = "id",
 *     "label" = "label",
 *     "uuid" = "uuid",
 *     "status" = "status"
 *   },
 *   config_export = {
 *     "id",
 *     "label",
 *     "description",
 *   },
 *   lookup_keys = {
 *     "id"
 *   },
 * )
 */
class AdminDialogGroupEntity extends ConfigEntityBase implements AdminDialogGroupEntityInterface {
  use StringTranslationTrait;

  /**
   * The entity ID.
   *
   * @var string
   */
  protected $id;

  /**
   * Dialog group label.
   *
   * @var string
   */
  protected $label;

  /**
   * Dialog group description.
   *
   * @var string
   */
  protected $description;

  /**
   * {@inheritdoc}
   */
  public function getDescription() {
    return $this->description;
  }

  /**
   * {@inheritdoc}
   */
  public function setDescription($description) {
    $this->description = $description;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function delete(): void {
    // Delete all dialogs contained in this group.
    $query = \Drupal::entityQuery('admin_dialog')
      // Access check false because if the user has access to deleting
      // migration groups they should have access to deleting related migration.
      ->accessCheck(FALSE)
      ->condition('dialog_group', $this->id());
    $names = $query->execute();

    // Order the dialogs according to their dependencies.
    $dialogs = \Drupal::entityTypeManager()->getStorage('admin_dialog')->loadMultiple($names);
    // Delete in reverse order, so dependencies are never violated.
    $dialogs = array_reverse($dialogs);
    foreach ($dialogs as $dialog) {
      $dialog->delete();
    }
    parent::delete();
  }

}
