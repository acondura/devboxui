(function ($, Drupal, drupalSettings, once) {
  Drupal.behaviors.qt_accordion = {
    attach(context, settings) {
      $(once('quicktabs-accordion', 'div.quicktabs-accordion', context)).each(
        function () {
          const id = $(this).attr('id');
          const qtKey = `qt_${this.id.substring(this.id.indexOf('-') + 1)}`;
          const options = drupalSettings.quicktabs[qtKey].options;
          $(this).accordion(options);
        },
      );
    },
  };
})(jQuery, Drupal, drupalSettings, once);
