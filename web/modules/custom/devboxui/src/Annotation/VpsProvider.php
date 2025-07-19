<?php

namespace Drupal\devboxui\Annotation;

use Drupal\Component\Annotation\Plugin;

/**
 * Defines a VPS Provider plugin annotation.
 *
 * @Annotation
 */
class VpsProvider extends Plugin {
  public $id;
  public $label;
}
