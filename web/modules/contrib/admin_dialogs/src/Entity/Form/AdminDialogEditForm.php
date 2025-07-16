<?php

namespace Drupal\admin_dialogs\Entity\Form;

use Drupal\Core\Entity\EntityForm;
use Drupal\Core\Entity\EntityTypeBundleInfoInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Entity\FieldableEntityInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Language\LanguageManagerInterface;
use Drupal\Core\Url;
use Drupal\Core\Routing\RouteMatchInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Edit form for Admin Dialog.
 */
class AdminDialogEditForm extends EntityForm {

  /**
   * @var \Drupal\admin_dialogs\AdminDialogEntityInterface
   */
  protected $entity;

  /**
   * The entity type bundle info service.
   *
   * @var \Drupal\Core\Entity\EntityTypeBundleInfoInterface
   */
  protected $entityTypeBundleInfo;

  /**
   * The entity manager service.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The language manager service.
   *
   * @var \Drupal\Core\Language\LanguageManagerInterface
   */
  protected $languageManager;

  /**
   * The current route match.
   *
   * @var \Drupal\Core\Routing\RouteMatchInterface
   */
  protected $routeMatch;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('entity_type.bundle.info'),
      $container->get('entity_type.manager'),
      $container->get('language_manager'),
      $container->get('current_route_match')
    );
  }

  /**
   * DialogEditForm constructor.
   */
  public function __construct(EntityTypeBundleInfoInterface $entity_type_bundle_info, EntityTypeManagerInterface $entity_type_manager, LanguageManagerInterface $language_manager, RouteMatchInterface $route_match) {
    $this->entityTypeBundleInfo = $entity_type_bundle_info;
    $this->entityTypeManager = $entity_type_manager;
    $this->languageManager = $language_manager;
    $this->routeMatch = $route_match;
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {
    $form = parent::buildForm($form, $form_state);
    $form['#attached']['library'][] = 'admin_dialogs/admin_dialogs.admin';
    $conditions = $this->entity->getSelectionCriteria();

    $form_state->setStorage(['admin_dialog_group' => $this->routeMatch->getParameter('admin_dialog_group')]);

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
        'exists' => 'Drupal\admin_dialogs\Entity\AdminDialogEntity::load',
      ],
    ];

    $form['dialog_title_override'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Override Title'),
      '#maxlength' => 255,
      '#default_value' => $this->entity->getDialogTitleOverride(),
      '#placeholder' => $this->t('Override default dialog title'),
    ];

    $form['type'] = [
      '#type' => 'select',
      '#title' => $this->t('Type'),
      '#default_value' => $this->entity->getType(),
      '#options' => [
        'ops' => $this->t('Operations'),
        'tasks' => $this->t('Task Links'),
        'actions' => $this->t('Action Links'),
        'paths' => $this->t('Paths'),
        'selectors' => $this->t('CSS Selector'),
      ],
      '#required' => TRUE,
      '#empty_option' => $this->t('- Select -'),
      '#ajax' => [
        'callback' => '::ajaxReplaceDialogForm',
        'wrapper' => 'dialog-content-types',
        'method' => 'replace',
      ],
    ];

    $form['dialog_type'] = [
      '#type' => 'select',
      '#title' => $this->t('Dialog type'),
      '#default_value' => ($val = $this->entity->getDialogType()) ? $val : 'modal',
      '#options' => [
        'modal' => $this->t('Modal'),
        'off_canvas' => $this->t('Off-canvas'),
      ],
      '#required' => TRUE,
    ];

    $form['dialog_width'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Dialog width'),
      '#default_value' => $this->entity->getDialogWidth(),
      '#placeholder' => $this->t('px or % value'),
      '#size' => 12,
    ];

    $options = [];
    // Get all applicable entity types.
    foreach ($this->entityTypeManager->getDefinitions() as $entity_type_id => $entity_type) {
      $options[$entity_type_id] = $entity_type->getLabel();
    }
    $form['entity_types'] = [
      '#type' => 'select',
      '#title' => $this->t('Entity type'),
      '#default_value' => !empty($conditions['entity_type']) ? $conditions['entity_type'] : NULL,
      '#description' => $this->t('Important: Keep in mind not all entity type operation links can be overridden. It dependes on how links in each module implemented.'),
      '#options' => $options,
      '#limit_validation_errors' => [['content_type']],
      '#submit' => ['::submitSelectType'],
      '#executes_submit_callback' => TRUE,
      '#ajax' => [
        'callback' => '::ajaxReplaceDialogForm',
        'wrapper' => 'dialog-content-types',
        'method' => 'replace',
      ],
      '#states' => [
        'visible' => [
          [':input[name="type"]' => ['value' => 'ops']],
        ]
      ],
    ];

    $form['selection_container'] = [
      '#type' => 'container',
      '#prefix' => '<div id="dialog-content-types">',
      '#suffix' => '</div>',
    ];

    if (!empty($this->entity->getEntityTypes())) {

      if ($this->entity->getType() == 'ops') {

        $form['selection_container']['element_key'] = [
          '#type' => 'select',
          '#title' => $this->t('Action'),
          '#default_value' => (!empty($conditions['key']) && !in_array($conditions['key'], ['edit', 'delete']))
            ? 'other'
            : (!empty($conditions['key']) ? $conditions['key'] : NULL),
          '#options' => [
            'edit' => $this->t('Edit'),
            'delete' => $this->t('Delete'),
            'other' => $this->t('Other'),
          ],
        ];

        $form['selection_container']['element_key_other'] = [
          '#title' => $this->t('Link Key'),
          '#description' => $this->t('Provide array key for operation link'),
          '#type' => 'textfield',
          '#default_value' => !empty($conditions['key']) ? $conditions['key'] : '',
          '#states' => [
            'visible' => [
              [
                ':input[name="element_key"]' => ['value' => 'other'],
              ],
            ]
          ],
        ];
      }

      // Expose bundle and language conditions.
      if ($entity_type = $this->entityTypeManager->getDefinition($this->entity->getEntityTypes())) {

        if ($entity_type->hasKey('bundle') && $bundles = $this->entityTypeBundleInfo->getBundleInfo($entity_type->id())) {
          $bundle_options = [];
          foreach ($bundles as $id => $info) {
            $bundle_options[$id] = $info['label'];
          }
          $form['selection_container']['bundles'] = [
            '#title' => $entity_type->getBundleLabel(),
            '#type' => 'checkboxes',
            '#options' => $bundle_options,
            '#default_value' => !empty($conditions['bundles']) ? $conditions['bundles'] : [],
            '#description' => $this->t('Check to which types this dialog should be applied. Leave empty to allow any.'),
            '#states' => [
              'visible' => [
                [':input[name="type"]' => ['value' => 'ops']],
              ]
            ],
          ];
        }
      }
    }

    $form['routes'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Route names'),
      '#description' => $this->t('One route per line'),
      '#default_value' => !empty($conditions['routes']) ? join("\n", $conditions['routes']) : '',
      '#states' => [
        'visible' => [
          [':input[name="type"]' => ['value' => 'tasks']],
          'or',
          [':input[name="type"]' => ['value' => 'actions']],
        ]
      ],
    ];

    $form['paths'] = [
      '#type' => 'textarea',
      '#title' => $this->t('URL paths'),
      '#description' => $this->t('One path per line'),
      '#default_value' => !empty($conditions['paths']) ? join("\n", $conditions['paths']) : '',
      '#states' => [
        'visible' => [
          [':input[name="type"]' => ['value' => 'paths']],
        ]
      ],
    ];

    $form['selectors'] = [
      '#type' => 'textarea',
      '#title' => $this->t('CSS Selectors'),
      '#description' => $this->t('One selector per line (targeted element should have a href attribute)'),
      '#default_value' => !empty($conditions['selectors']) ? join("\n", $conditions['selectors']) : '',
      '#states' => [
        'visible' => [
          [':input[name="type"]' => ['value' => 'selectors']],
        ]
      ],
    ];

    $form['status'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable dialogs'),
      '#default_value' => $this->entity->status(),
    ];

    if (!$this->entity->getDialogGroup()) {
      $this->entity->set('dialog_group', 'administrative');
    }

    $form['actions']['cancel'] = [
      '#type' => 'link',
      '#title' => $this->t('Cancel'),
      '#url' =>  Url::fromRoute('entity.admin_dialog.list',  [
        'admin_dialog_group' => !empty($this->entity->getDialogGroup())
          ? $this->entity->getDialogGroup()
          : $this->routeMatch->getParameter('admin_dialog_group')
      ]),
      '#weight' => 10,
      '#attributes' => ['class' => ['button', 'dialog-cancel']],
    ];
    unset($form['actions']['delete']);
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function buildEntity(array $form, FormStateInterface $form_state) {
    /** @var \Drupal\admin_dialogs\DialogEntityInterface $entity */
    $entity = parent::buildEntity($form, $form_state);
    $storage = $form_state->getStorage();
    $criteria = [];
    if (in_array($form_state->getValue('type'), ['button', 'ops'])) {
      $criteria['entity_type'] = !empty($form_state->getValue('entity_types')) ? $form_state->getValue('entity_types') : NULL;
      $criteria['bundles'] = !empty($form_state->getValue('bundles')) ? array_filter($form_state->getValue('bundles')) : [];
      $criteria['key'] = ($form_state->getValue('element_key') == 'other' && !empty($form_state->getValue('element_key_other')))
        ? trim($form_state->getValue('element_key_other'))
        : $form_state->getValue('element_key');
    }
    if (in_array($form_state->getValue('type'), ['tasks', 'actions'])) {
      $criteria['routes'] = explode("\r\n", $form_state->getValue('routes'));
    }
    if (in_array($form_state->getValue('type'), ['paths'])) {
      $criteria['paths'] = explode("\r\n", $form_state->getValue('paths'));
    }
    if (in_array($form_state->getValue('type'), ['selectors'])) {
      $criteria['selectors'] = explode("\r\n", $form_state->getValue('selectors'));
    }
    $entity->setSelectionCriteria($criteria);
    $entity->setDialogGroup(!empty($storage['admin_dialog_group']) ? $storage['admin_dialog_group']->id() : $entity->getDialogGroup());
    return $entity;
  }

  /**
   * {@inheritdoc}
   */
  public function save(array $form, FormStateInterface $form_state) {
    parent::save($form, $form_state);
    $this->messenger()->addMessage($this->t('Dialog %label saved.', [
      '%label' => $this->entity->label(),
    ]));
    $form_state->setRedirectUrl(Url::fromRoute('entity.admin_dialog.list', [
      'admin_dialog_group' => $this->entity->getDialogGroup()
    ]));
  }

  /**
   * Handles switching the type selector.
   */
  public function ajaxReplaceDialogForm($form, FormStateInterface $form_state) {
    return $form['selection_container'];
  }

  /**
   * Handles submit call when alias type is selected.
   */
  public function submitSelectType(array $form, FormStateInterface $form_state) {
    $this->entity = $this->buildEntity($form, $form_state);
    $form_state->setRebuild();
  }

}
