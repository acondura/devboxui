(function ($, Drupal) {

  Drupal.behaviors.AdminDialogsSpinner = {
    attach: function (context, settings) {
      $('form', context).on('submit', function() {
        $(this).find('.button--primary.form-submit').addClass('admin-dialogs-hide-text');
        $(this).find('.admin-dialogs-spinner').addClass('admin-dialogs-in-progress');
      });
      $('input.button--primary.form-submit', context).on('click', function() {
        $(this).addClass('admin-dialogs-hide-text');
        $(this).parent().find('.admin-dialogs-spinner').addClass('admin-dialogs-in-progress');
      });
    }
  };
  $(document).on('dialogopen', function(e, ui) {
    $('form').on('submit', function() {
      $(this).closest('.ui-dialog-buttons').find('.button--primary.form-submit').addClass('admin-dialogs-in-progress');
    });
  });

})(jQuery, Drupal);
