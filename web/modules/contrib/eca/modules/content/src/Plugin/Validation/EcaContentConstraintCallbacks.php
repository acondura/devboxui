<?php

namespace Drupal\eca_content\Plugin\Validation;

use Drupal\Core\TypedData\Plugin\DataType\LanguageReference;

/**
 * Provides static validations for config schemas.
 */
class EcaContentConstraintCallbacks {

  /**
   * Returns all valid langcodes for ECA content.
   *
   * @return string[]
   *   An array of valid langcodes.
   */
  public static function getAllValidLangcodes(): array {
    return array_merge(LanguageReference::getAllValidLangcodes(), ['_interface']);
  }

  /**
   * Returns all valid entity types and "_none".
   *
   * @return int[]|string[]
   *   All valid entity types.
   */
  public static function getAllValidContentEntityTypes(): array {
    $entity_type_ids = array_keys(\Drupal::service('entity_type.manager')->getDefinitions());
    $entity_type_ids[] = '_none';
    return $entity_type_ids;
  }

}
