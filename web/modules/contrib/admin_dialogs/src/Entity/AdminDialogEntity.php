<?php

namespace Drupal\admin_dialogs\Entity;

use Drupal\Core\Config\Entity\ConfigEntityBase;
use Drupal\Core\StringTranslation\StringTranslationTrait;

/**
 * Defines the Admin Dialog entity.
 *
 * @ConfigEntityType(
 *   id = "admin_dialog",
 *   label = @Translation("Admin Dialog"),
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
 *     "type",
 *     "dialog_group",
 *     "dialog_type",
 *     "dialog_width",
 *     "dialog_title_override",
 *     "selection_criteria",
 *   },
 *   lookup_keys = {
 *     "id"
 *   },
 * )
 */
class AdminDialogEntity extends ConfigEntityBase implements AdminDialogEntityInterface {
  use StringTranslationTrait;

  /**
   * The entity ID.
   *
   * @var string
   */
  protected $id;

  /**
   * The module which this Entity Reference Pattern is assigned to.
   *
   * @var string
   */
  protected $module;

  /**
   * The dialog group.
   *
   * @var string
   */
  protected $dialog_group;

  /**
   * The label of the Entity Reference Pattern.
   *
   * @var string
   */
  protected $label;

  /**
   * The element type.
   *
   * @var string
   */
  protected $type;

  /**
   * The dialog type.
   *
   * @var string
   */
  protected $dialog_type;

  /**
   * The dialog width.
   *
   * @var string
   */
  protected $dialog_width;

  /**
   * The dialog title override.
   *
   * @var string
   */
  protected $dialog_title_override;

  /**
   * The entity type.
   *
   * @var string
   */
  protected $entity_types;

  /**
   * The plugin configuration for the selection criteria condition plugins.
   *
   * @var array
   */
  protected $selection_criteria = [];

  /**
   * {@inheritdoc}
   */
  public function getDialogType($key = TRUE) {
    $types = [
      'modal' => $this->t('Modal'),
      'off_canvas' => $this->t('Off-canvas'),
    ];
    if ($key) {
      return !empty($this->dialog_type) ? $this->dialog_type : 'modal';
    }
    else {
      return !empty($types[$this->dialog_type]) ? $types[$this->dialog_type] : $this->dialog_type;
    }
  }

  /**
   * {@inheritdoc}
   */
  public function setDialogType($dialog_type) {
    $this->dialog_type = $dialog_type;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getDialogWidth() {
    return !empty($this->dialog_width) ? $this->dialog_width : 550;
  }

  /**
   * {@inheritdoc}
   */
  public function setDialogWidth($width) {
    $this->dialog_width = $width;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getDialogTitleOverride() {
    return !empty($this->dialog_title_override) ? $this->dialog_title_override : '';
  }

  /**
   * {@inheritdoc}
   */
  public function setDialogTitleOverride($title) {
    $this->dialog_title_override = $title;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getType($key = TRUE) {
    $types = [
      'ops' => $this->t('Operations'),
      'tasks' => $this->t('Task Links'),
      'actions' => $this->t('Action Links'),
      'paths' => $this->t('Paths'),
      'selectors' => $this->t('CSS Selector'),
    ];
    return $key ? $this->type : (!empty($types[$this->type]) ? $types[$this->type] : $this->type);
  }

  /**
   * {@inheritdoc}
   */
  public function setType($type) {
    $this->type = $type;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function entityTypeExists() {
    return !empty(\Drupal::entityTypeManager()->getDefinition($this->getEntityTypes(), FALSE));
  }

  /**
   * {@inheritdoc}
   */
  public function getEntityTypes() {
    $criteria = $this->getSelectionCriteria();
    return !empty($this->entity_types)
     ? $this->entity_types
     : (!empty($criteria['entity_type']) ? $criteria['entity_type'] : NULL);
  }

  /**
   * {@inheritdoc}
   */
  public function setEntityTypes($type) {
    $this->entity_types = $type;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getModule() {
    return $this->module;
  }

  /**
   * {@inheritdoc}
   */
  public function setModule($module) {
    $this->module = $module;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getSelectionCriteria() {
    if (empty(array_values($this->selection_criteria))) {
      return FALSE;
    }
    else {
      return $this->selection_criteria;
    }
  }

  /**
   * {@inheritdoc}
   */
  public function setSelectionCriteria(array $selection_criteria) {
    $this->selection_criteria = $selection_criteria;
    return $this;
  }

  /**
   * {@inheritdoc}
   */
  public function getDialogGroup() {
    return $this->dialog_group;
  }

  /**
   * {@inheritdoc}
   */
  public function setDialogGroup($dialog_group) {
    $this->dialog_group = $dialog_group;
    return $this;
  }

}
