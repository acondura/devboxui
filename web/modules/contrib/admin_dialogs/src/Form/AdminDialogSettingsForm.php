<?php

namespace Drupal\admin_dialogs\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Class DialogSettingsForm. The config form for the admin_dialogs module.
 *
 * @package admin_dialogs
 */
class AdminDialogSettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames() {
    return [
      'admin_dialogs.settings',
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'admin_dialogs_settings';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {
    $config = $this->config('admin_dialogs.settings');
    $form['settings'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Global settings'),
      '#collapsible' => FALSE,
    ];
    $form['settings']['delete_ops'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Add modal dialog to all "delete" operation links.'),
      '#description' => $this->t('This will make Delete operation link open confirmation form in a modal.'),
      '#default_value' => $config->get('delete_ops'),
      '#return_value' => TRUE,
    ];
    $form['settings']['delete_buttons'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Add modal dialog to all "delete" action buttons.'),
      '#description' => $this->t('This will make Delete action button open confirmation form in a modal.'),
      '#default_value' => $config->get('delete_buttons'),
      '#return_value' => TRUE,
    ];
    $form['settings']['other_buttons'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Extend dialogs.'),
      '#description' => $this->t('Add dialogs to as many elements as possible.'),
      '#default_value' => $config->get('other_buttons'),
      '#return_value' => TRUE,
    ];
    $form['experimental'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('Experimental'),
      '#collapsible' => FALSE,
    ];
    $form['experimental']['submit_spinner'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Show spinner in submit buttons.'),
      '#description' => $this->t('Show loading spinner inside submit button on form submit.'),
      '#default_value' => $config->get('submit_spinner'),
      '#return_value' => TRUE,
    ];
    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    $this->config('admin_dialogs.settings')
      ->set('delete_ops', (bool) $form_state->getValue('delete_ops'))
      ->set('delete_buttons', (bool) $form_state->getValue('delete_buttons'))
      ->set('other_buttons', (bool) $form_state->getValue('other_buttons'))
      ->set('submit_spinner', (bool) $form_state->getValue('submit_spinner'))
      ->save();
    parent::submitForm($form, $form_state);
  }

}
