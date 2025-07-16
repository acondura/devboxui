<?php

namespace Drupal\eca\Validation;

/**
 * Provides static callbacks for schema validation.
 */
class EcaConstraintCallbacks {

  /**
   * Gets the list of valid entity types and bundles.
   *
   * @return array
   *   The list of valid entity types and bundles.
   */
  public static function getContentEntityTypesAndBundles(): array {
    return array_keys(\Drupal::service('eca.service.content_entity_types')->getTypesAndBundles(TRUE));
  }

}
