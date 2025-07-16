<?php

namespace Drupal\quicktabs\Plugin\views\style;

use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\StringTranslation\StringTranslationTrait;
use Drupal\views\Attribute\ViewsStyle;
use Drupal\views\Plugin\views\style\StylePluginBase;
use Drupal\Core\Link;
use Drupal\Core\Url;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Component\Utility\Xss;

/**
 * Style plugin to render views rows as tabs.
 *
 * @ingroup views_style_plugins
 */
#[ViewsStyle(
  id: "quicktabs",
  title: new TranslatableMarkup("Quick Tabs"),
  help: new TranslatableMarkup("Render each views row as a tab."),
  theme: "quicktabs_view_quicktabs",
  display_types: ["normal"],
)]
class Quicktabs extends StylePluginBase {

  use StringTranslationTrait;

  /**
   * Does the style plugin allows to use style plugins.
   *
   * @var bool
   */
  protected $usesRowPlugin = TRUE;

  /**
   * Does the style plugin support custom css class for the rows.
   *
   * @var bool
   */
  protected $usesRowClass = TRUE;

  /**
   * Should field labels be enabled by default.
   *
   * @var bool
   */
  protected $defaultFieldLabels = TRUE;

  /**
   * Mapping tabs to pages.
   *
   * @var bool
   */
  protected $setMapping;

  /**
   * The render array for the tabs.
   *
   * @var bool
   */
  protected $tabs = [];

  /**
   * Set default options.
   */
  protected function defineOptions(): array {
    $options = parent::defineOptions();
    $options['path'] = ['default' => 'quicktabs'];
    return $options;
  }

  /**
   * Set the tabs.
   */
  public function setTabs(array $tabs): void {
    $this->tabs = $tabs;
  }

  /**
   * Get the tabs.
   */
  public function getTabs(): bool|array {
    return $this->tabs;
  }

  /**
   * Set the set mapping.
   */
  public function setSetMapping(array $setMapping): void {
    $this->setMapping = $setMapping;
  }

  /**
   * Get the set mapping.
   */
  public function getSetMapping(): bool {
    return $this->setMapping;
  }

  /**
   * {@inheritdoc}
   */
  public function buildOptionsForm(&$form, FormStateInterface $form_state): void {
    parent::buildOptionsForm($form, $form_state);

    foreach ($form['grouping'] as $index => &$field) {
      if ($index == 0) {
        $field['field']['#required'] = 1;
        $field['rendered']['#default_value'] = TRUE;
        $field['rendered']['#access'] = FALSE;
        $field['rendered_strip']['#access'] = FALSE;
      }
      // Only allow 1 level of grouping.
      elseif ($index > 0) {
        unset($form['grouping'][$index]);
      }

      $current_value = $field['field']['#description']->getUntranslatedString();
      $field['field']['#description'] = $this->t('You must specify a field by which to group the records. This field will be used for the title of each tab.', ['@current_value' => $current_value]);
    }
  }

  /**
   * {@inheritdoc}
   */
  public function renderGroupingSets($sets, $level = 0): array {
    $output = [];
    $theme_functions = $this->view->buildThemeFunctions($this->groupingTheme);
    $tab_titles = [];
    $set_mapping = [];
    $link_classes = ['loaded'];
    $quicktab_id = str_replace('_', '-', $this->view->id());
    $set_count = 0;

    foreach ($sets as $index => $set) {
      $wrapper_attributes = [];

      if ($set_count === 0) {
        $wrapper_attributes['class'] = ['active'];
      }
      $tab_titles[] = [
        '0' => Link::fromTextAndUrl(
          Xss::filter($index, [
            'img',
            'em',
            'strong',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'small',
            'span',
            'i',
            'br',
          ]),
          Url::fromRoute(
            '<current>',
            [],
            [
              'attributes' => [
                'class' => $link_classes,
              ],
            ]
          )
        )->toRenderable(),
        '#wrapper_attributes' => $wrapper_attributes,
      ];

      $level = $set['level'] ?? 0;
      $row = reset($set['rows']);
      // Render as a grouping set.
      if (is_array($row) && isset($row['group'])) {
        $single_output = [
          '#theme' => $theme_functions,
          '#view' => $this->view,
          '#grouping' => $this->options['grouping'][$level],
          '#rows' => $set['rows'],
        ];
      }
      // Render as a record set.
      else {
        if ($this->usesRowPlugin()) {
          foreach ($set['rows'] as $index => $row) {
            $this->view->row_index = $index;
            $set['rows'][$index] = $this->view->rowPlugin->render($row);
          }
        }

        $single_output = $this->renderRowGroup($set['rows']);
      }

      $single_output['#grouping_level'] = $level;
      $single_output['#title'] = $set['group'];

      // Create a mapping of which rows belong in which set
      // This can then be used in the theme function to wrap each tab page.
      if (!empty($this->options['grouping'])) {
        $set_mapping = [];
        foreach ($sets as $set_index => $set) {
          foreach ($set['rows'] as $row_index => $row) {
            $set_mapping[$set_index][] = $row_index;
          }
        }
      }

      $output[] = $single_output;
      $set_count++;
    }

    $this->setSetMapping($set_mapping);
    unset($this->view->row_index);

    // Create the tabs for rendering.
    $tabs = [
      '#theme' => 'item_list',
      '#items' => $tab_titles,
      '#attributes' => [
        'class' => ['quicktabs-tabs'],
      ],
    ];

    $this->setTabs($tabs);

    // Add quicktabs wrapper to all the output.
    $output['#theme_wrappers'] = [
      'container' => [
        '#attributes' => [
          'class' => ['quicktabs-wrapper'],
          'id' => 'quicktabs-' . $quicktab_id,
        ],
      ],
    ];

    return $output;
  }

}
