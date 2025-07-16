<?php

namespace Drupal\admin_dialogs\Entity\Form;

use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;

/**
 * Edit form for Admin Dialog Group.
 */
class AdminDialogGroupEditForm extends EntityForm {

  /**
   * @var \Drupal\admin_dialogs\AdminDialogEntityInterface
   */
  protected $entity;

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {
    $form = parent::buildForm($form, $form_state);
    $form['label'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Label'),
      '#maxlength' => 255,
      '#default_value' => $this->entity->label(),
      '#description' => $this->t('A short name to help you identify this configuration in the dialogs list.'),
      '#required' => TRUE,
    ];

    $form['id'] = [
      '#type' => 'machine_name',
      '#title' => $this->t('ID'),
      '#maxlength' => 255,
      '#default_value' => $this->entity->id(),
      '#required' => TRUE,
      '#disabled' => !$this->entity->isNew(),
      '#machine_name' => [
        'exists' => 'Drupal\admin_dialogs\Entity\AdminDialogGroupEntity::load',
      ],
    ];

    $form['description'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Description'),
      '#default_value' => $this->entity->getDescription(),
    ];

    $form['actions']['cancel'] = [
      '#type' => 'link',
      '#title' => $this->t('Cancel'),
      '#url' =>  Url::fromRoute('entity.admin_dialog_group.list'),
      '#weight' => 10,
      '#attributes' => ['class' => ['button', 'dialog-cancel']],
    ];

    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function buildEntity(array $form, FormStateInterface $form_state) {
    /** @var \Drupal\dialog\DialogEntityInterface $entity */
    $entity = parent::buildEntity($form, $form_state);
    return $entity;
  }

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state) {
    parent::save($form, $form_state);
    $this->messenger()->addMessage($this->t('Dialog group %label saved.', [
      '%label' => $this->entity->label(),
    ]));
    $form_state->setRedirectUrl(Url::fromRoute('entity.admin_dialog_group.list'));
  }

}
