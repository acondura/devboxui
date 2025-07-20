/**
 * @file
 * Contains js for the HTML5 validation.
 */

(function ($) {

  'use strict';

  $(function () {
    // Added required in input radio.
    $('.field--widget-options-buttons .required').each(function () {
      $(this).find('input').attr({'required': 'required', 'aria-required': 'true'});
    });

    // Removed '_none' value in first option.
    $("option[value='_none']:selected").val('');

    // Add and remove required attrubute.
    var requiredCheckboxes = $('.form-checkboxes :checkbox[required="required"]');
    requiredCheckboxes.change(function () {
      if (requiredCheckboxes.is(':checked')) {
        requiredCheckboxes.removeAttr('required');
      }
      else {
        requiredCheckboxes.attr('required', 'required');
      }
    });
  });
})(jQuery);
