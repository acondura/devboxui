(function ($, Drupal, drupalSettings, once) {
  Drupal.behaviors.qt_ui_tabs = {
    attach(context, settings) {
      $(once('quicktabs-ui-wrapper', 'div.quicktabs-ui-wrapper', context)).each(
        function () {
          const id = $(this).attr('id');
          const qtKey = `qt_${this.id.substring(this.id.indexOf('-') + 1)}`;
          $(this).tabs({ active: drupalSettings.quicktabs[qtKey].default_tab });
        },
      );
    },
  };
})(jQuery, Drupal, drupalSettings, once);
