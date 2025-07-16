<?php

namespace Drupal\admin_dialogs\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\admin_dialogs\Entity\AdminDialogGroupEntity;

/**
 * Provides dynamic controller titles.
 *
 * @ingroup admin_dialogs
 */
class AdminDialogMisc extends ControllerBase {

  /**
   * Dialogs controller dynamic title.
   */
  public function getDialogsControllerTitle() {
    if ($id = \Drupal::routeMatch()->getParameter('admin_dialog_group')) {
      if (is_object($id)) {
        return $this->t('%label Dialogs', ['%label' => $id->label()]);
      }
      if ($dialog_group = AdminDialogGroupEntity::load($id)) {
        return $this->t('%label Dialogs', ['%label' => $dialog_group->label()]);
      }
    }
    return $this->t('Dialogs');
  }

}
