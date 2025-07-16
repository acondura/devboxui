<?php

namespace Drupal\modeler_api\Form;

use Drupal\Component\Serialization\Yaml;
use Drupal\config\StorageReplaceDataWrapper;
use Drupal\Core\Archiver\ArchiveTar;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Config\CachedStorage;
use Drupal\Core\Config\ConfigException;
use Drupal\Core\Config\ConfigImporter;
use Drupal\Core\Config\ConfigManagerInterface;
use Drupal\Core\Config\FileStorage;
use Drupal\Core\Config\StorageComparer;
use Drupal\Core\Config\TypedConfigManager;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ModuleExtensionList;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Extension\ModuleInstallerInterface;
use Drupal\Core\Extension\ThemeExtensionList;
use Drupal\Core\Extension\ThemeHandler;
use Drupal\Core\File\FileSystemInterface;
use Drupal\Core\Form\FormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Lock\LockBackendInterface;
use Drupal\modeler_api\Api;
use Drupal\modeler_api\Plugin\ModelerPluginManager;
use Drupal\modeler_api\Plugin\ModelOwnerPluginManager;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

/**
 * Import a model from a previous export.
 */
class Import extends FormBase {

  /**
   * Symfony request.
   *
   * @var \Symfony\Component\HttpFoundation\Request
   */
  protected Request $request;

  /**
   * Config manager.
   *
   * @var \Drupal\Core\Config\ConfigManagerInterface
   */
  protected ConfigManagerInterface $configManager;

  /**
   * Cached storage.
   *
   * @var \Drupal\Core\Config\CachedStorage
   */
  protected CachedStorage $configStorage;

  /**
   * Cache backend.
   *
   * @var \Drupal\Core\Cache\CacheBackendInterface
   */
  protected CacheBackendInterface $configCache;

  /**
   * Module handler.
   *
   * @var \Drupal\Core\Extension\ModuleHandlerInterface
   */
  protected ModuleHandlerInterface $moduleHandler;

  /**
   * Event dispatcher.
   *
   * @var \Symfony\Contracts\EventDispatcher\EventDispatcherInterface
   */
  protected EventDispatcherInterface $eventDispatcher;

  /**
   * Lock backend.
   *
   * @var \Drupal\Core\Lock\LockBackendInterface
   */
  protected LockBackendInterface $lock;

  /**
   * Typed config manager.
   *
   * @var \Drupal\Core\Config\TypedConfigManager
   */
  protected TypedConfigManager $configTyped;

  /**
   * Module installer.
   *
   * @var \Drupal\Core\Extension\ModuleInstallerInterface
   */
  protected ModuleInstallerInterface $moduleInstaller;

  /**
   * Theme handler.
   *
   * @var \Drupal\Core\Extension\ThemeHandler
   */
  protected ThemeHandler $themeHandler;

  /**
   * The module extension list.
   *
   * @var \Drupal\Core\Extension\ModuleExtensionList
   */
  protected ModuleExtensionList $moduleExtensionList;

  /**
   * The theme extension list.
   *
   * @var \Drupal\Core\Extension\ThemeExtensionList
   */
  protected ThemeExtensionList $themeExtensionList;

  /**
   * The file system service.
   *
   * @var \Drupal\Core\File\FileSystemInterface
   */
  protected FileSystemInterface $fileSystem;

  /**
   * The model owner plugin manager.
   *
   * @var \Drupal\modeler_api\Plugin\ModelOwnerPluginManager
   */
  protected ModelOwnerPluginManager $modelOwnerPluginManager;

  /**
   * The modeler plugin manager.
   *
   * @var \Drupal\modeler_api\Plugin\ModelerPluginManager
   */
  protected ModelerPluginManager $modelerPluginManager;

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected EntityTypeManagerInterface $entityTypeManager;

  /**
   * The modeler API service.
   *
   * @var \Drupal\modeler_api\Api
   */
  protected Api $api;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): Import {
    $form = parent::create($container);
    $form->request = $container->get('request_stack')->getCurrentRequest();
    $form->configManager = $container->get('config.manager');
    $form->configStorage = $container->get('config.storage');
    $form->configCache = $container->get('cache.config');
    $form->moduleHandler = $container->get('module_handler');
    $form->eventDispatcher = $container->get('event_dispatcher');
    $form->lock = $container->get('lock');
    $form->configTyped = $container->get('config.typed');
    $form->moduleInstaller = $container->get('module_installer');
    $form->themeHandler = $container->get('theme_handler');
    $form->moduleExtensionList = $container->get('extension.list.module');
    $form->themeExtensionList = $container->get('extension.list.theme');
    $form->fileSystem = $container->get('file_system');
    $form->modelOwnerPluginManager = $container->get('plugin.manager.modeler_api.model_owner');
    $form->modelerPluginManager = $container->get('plugin.manager.modeler_api.modeler');
    $form->entityTypeManager = $container->get('entity_type.manager');
    $form->api = $container->get('modeler_api.service');
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'modeler_api_import';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state, ?string $ownerId = NULL): array {
    $form_state->set('modeler_api_owner_id', $ownerId);
    if ($this->moduleHandler->moduleExists('config')) {
      $form['type'] = [
        '#type' => 'radios',
        '#title' => $this->t('Type'),
        '#options' => [
          'raw' => $this->t('Raw'),
          'archive' => $this->t('Archive'),
        ],
        '#default_value' => 'archive',
      ];
      $form['raw'] = [
        '#type' => 'container',
        '#states' => [
          'visible' => [
            ':input[name="type"]' => ['value' => 'raw'],
          ],
        ],
      ];
      $modelers = [];
      foreach ($this->modelerPluginManager->getDefinitions() as $definition) {
        if ($definition['id'] === 'fallback') {
          continue;
        }
        $modelers[$definition['id']] = $definition['label'];
      }
      $form['raw']['modeler'] = [
        '#type' => 'select',
        '#title' => $this->t('Modeler'),
        '#options' => $modelers,
      ];
      $form['model'] = [
        '#type' => 'file',
        '#title' => $this->t('File containing the model.'),
      ];
      $form['actions']['#type'] = 'actions';
      $form['actions']['submit'] = [
        '#type' => 'submit',
        '#value' => $this->t('Import'),
        '#button_type' => 'primary',
      ];
    }
    else {
      $form['info'] = [
        '#type' => 'markup',
        '#markup' => $this->t('Import requires the config module to be enabled.'),
      ];
    }
    return $form;
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);
    $all_files = $this->request->files->get('files', []);
    if (empty($all_files)) {
      $form_state->setErrorByName('model', 'No file provided.');
      return;
    }
    /** @var \Symfony\Component\HttpFoundation\File\UploadedFile|bool $file */
    $file = reset($all_files);
    if (!$file) {
      $form_state->setErrorByName('model', 'No file provided.');
      return;
    }
    $filename = $file->getRealPath();
    if (!file_exists($filename)) {
      $form_state->setErrorByName('model', 'Something went wrong during upload.');
      return;
    }
    $extension = $file->getClientOriginalExtension();
    $ownerId = $form_state->get('modeler_api_owner_id');
    $modelerId = $form_state->getValue('modeler');
    if ($form_state->getValue('type') === 'raw') {
      /** @var \Drupal\modeler_api\Plugin\modeler_api_modeler\ModelerInterface $modeler */
      $modeler = $this->modelerPluginManager->createInstance($modelerId);
      if ($extension !== $modeler->getRawFileExtension()) {
        $form_state->setErrorByName('model', 'The file extension does not match the modeler.');
        return;
      }
      $data = file_get_contents($filename);
      try {
        $model = $this->api->prepareModelFromData($data, $ownerId, $modelerId, TRUE, TRUE);
      }
      catch (\Exception $e) {
        $this->messenger->addError($e->getMessage());
        return;
      }
      if (!$model) {
        $form_state->setError($form, implode('<br/>', $this->api->getErrors()));
        $form_state->setErrorByName('model', 'The file can not be parsed.');
        return;
      }
      /** @var \Drupal\modeler_api\Plugin\modeler_api_model_owner\ModelOwnerInterface $owner */
      $owner = $this->modelOwnerPluginManager->createInstance($ownerId);
      $existingModel = $this->entityTypeManager->getStorage($owner->configEntityTypeId())->load($model->id());
      if ($existingModel && $existingModel->id() !== $model->id()) {
        $form_state->setErrorByName('model', 'Model with that ID already available with the label "' . $modeler->getLabel() . '". Delete that first, when you really want to import this file.');
        return;
      }
      try {
        $model->calculateDependencies();
      }
      catch (\Exception $e) {
        $form_state->setErrorByName('model', $e->getMessage());
        return;
      }

      // Prepare for final import in submit handler.
      $form_state->set('modeler_api_model_id', $model->id());
      $form_state->set('modeler_api_filename', $filename);
    }
    elseif ($extension === 'gz') {
      $source_storage_dir = $this->fileSystem->tempnam($this->fileSystem->getTempDirectory(), 'modeler-api-import');
      unlink($source_storage_dir);
      $this->fileSystem->prepareDirectory($source_storage_dir);
      try {
        $archiver = new ArchiveTar($filename, 'gz');
        $files = [];
        foreach ($archiver->listContent() as $file) {
          $files[] = $file['filename'];
        }
        $archiver->extractList($files, $source_storage_dir, '', FALSE, FALSE);
        $this->fileSystem->unlink($filename);

        $dependencyFilename = $source_storage_dir . '/dependencies.yml';
        if (!file_exists($dependencyFilename)) {
          $form_state->setErrorByName('model', 'Uploaded archive is not consistent.');
          return;
        }
        $dependencies = Yaml::decode(file_get_contents($dependencyFilename));
        $this->fileSystem->unlink($dependencyFilename);
        $missingModules = [];
        if (isset($dependencies['module']) && is_array($dependencies['module'])) {
          foreach ($dependencies['module'] as $module) {
            if (!$this->moduleHandler->moduleExists($module)) {
              $missingModules[] = $module;
            }
          }
        }
        if (!empty($missingModules)) {
          $form_state->setErrorByName('model', 'Can not import archive due to missing module(s): ' . implode(', ', $missingModules));
        }
        elseif (empty($dependencies['config']) || !is_array($dependencies['config'])) {
          $form_state->setErrorByName('model', 'Archive is not consistent.');
        }
        else {
          $missingFiles = [];
          foreach ($dependencies['config'] as $item) {
            if (!file_exists($source_storage_dir . '/' . $item . '.yml')) {
              $missingFiles[] = $item;
            }
          }
          if (!empty($missingFiles)) {
            $form_state->setErrorByName('model', 'Can not import archive due to missing config file(s): ' . implode(', ', $missingFiles));
          }
          else {
            // Prepare for final import in submit handler.
            $form_state->set('modeler_api_directory', $source_storage_dir);
          }
        }
      }
      catch (\Exception $e) {
        $form_state->setErrorByName('model', $e->getMessage());
      }
    }
    else {
      $form_state->setErrorByName('model', 'Unsupported file extension.');
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $ownerId = $form_state->get('modeler_api_owner_id');
    /** @var \Drupal\modeler_api\Plugin\modeler_api_model_owner\ModelOwnerInterface $owner */
    $owner = $this->modelOwnerPluginManager->createInstance($ownerId);
    $storage = $this->entityTypeManager->getStorage($owner->configEntityTypeId());
    if ($form_state->getValue('type') === 'raw') {
      $modelerId = $form_state->getValue('modeler');
      $data = file_get_contents($form_state->get('modeler_api_filename'));
      $model = $this->api->prepareModelFromData($data, $ownerId, $modelerId, TRUE);
      $model->save();
      $this->messenger()->addStatus($this->t('The configuration <strong>@name</strong> was imported successfully.', [
        '@name' => $owner->getLabel($model),
      ]));
    }
    else {
      // Import all files from an extracted archive.
      $source_storage_dir = $form_state->get('modeler_api_directory');
      $source_storage = new FileStorage($source_storage_dir);
      $active_storage = $this->configStorage;
      $replacement_storage = new StorageReplaceDataWrapper($active_storage);
      $id = NULL;
      $file_prefix = $owner->configEntityProviderId() . '.' . $owner->configEntityTypeId() . '.';
      foreach ($source_storage->listAll() as $name) {
        $data = $source_storage->read($name);
        if (is_array($data)) {
          if (mb_strpos($name, $file_prefix) === 0) {
            $id = $data['id'];
          }
          $replacement_storage->replaceData($name, $data);
        }
        else {
          $this->messenger()->addError($this->t('The contained config entity %name is invalid and got ignored.', [
            '%name' => $name,
          ]));
        }
      }
      $source_storage = $replacement_storage;

      $storage_comparer = new StorageComparer($source_storage, $active_storage);
      if ($id === NULL) {
        $this->messenger()->addError('This file does not contain any model.');
      }
      elseif (!$storage_comparer->createChangelist()->hasChanges()) {
        $this->messenger()->addStatus('There are no changes to import.');
      }
      else {
        $config_importer = new ConfigImporter(
          $storage_comparer,
          $this->eventDispatcher,
          $this->configManager,
          $this->lock,
          $this->configTyped,
          $this->moduleHandler,
          $this->moduleInstaller,
          $this->themeHandler,
          $this->getStringTranslation(),
          $this->moduleExtensionList,
          $this->themeExtensionList
        );
        if ($config_importer->alreadyImporting()) {
          $this->messenger()->addWarning('Another request may be synchronizing configuration already.');
        }
        else {
          try {
            $config_importer->import();
            if ($config_importer->getErrors()) {
              $this->messenger()->addError(implode("<br>\n", $config_importer->getErrors()));
            }
            elseif ($model = $storage->load($id)) {
              /** @var \Drupal\Core\Config\Entity\ConfigEntityInterface $model */
              if ($owner->isEditable($model)) {
                $this->messenger()->addStatus($this->t('The configuration <strong>@name</strong> was imported successfully.', [
                  '@name' => $owner->getLabel($model),
                ]));
              }
              else {
                $this->messenger()->addStatus($this->t('The configuration %name was imported successfully.', [
                  '%name' => $owner->getLabel($model),
                ]));
              }
            }
            else {
              $this->messenger()->addError('Unexpected error.');
            }
          }
          catch (ConfigException $e) {
            $message = 'The import failed due to the following reason: ' . $e->getMessage() . "<br>\n" . implode("<br>\n", $config_importer->getErrors());
            $this->messenger()->addError($message);
          }
        }
      }
      $this->fileSystem->deleteRecursive($source_storage_dir);
    }
    $form_state->setRedirect('entity.' . $owner->configEntityTypeId() . '.collection');
  }

}
