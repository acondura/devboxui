<?php

namespace Drupal\quicktabs\Form;

use Drupal\Core\Entity\EntityConfirmFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Url;

/**
 * Creates QuickTabsInstanceDeleteForm entity confirmation form.
 */
class QuickTabsInstanceDeleteForm extends EntityConfirmFormBase {

  /**
   * {@inheritdoc}
   */
  public function getQuestion(): TranslatableMarkup {
    $entity = $this->entity;
    return $this->t('Are you sure you want to delete this quicktabs instance with name %name?', ['%name' => $entity->getLabel()]);
  }

  /**
   * {@inheritdoc}
   */
  public function getCancelUrl(): Url {
    return new Url('quicktabs.admin');
  }

  /**
   * {@inheritdoc}
   */
  public function getConfirmText(): TranslatableMarkup {
    return $this->t('Delete');
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->entity->delete();
    $form_state->setRedirectUrl($this->getCancelUrl());
  }

}
