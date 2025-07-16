(function ($, Drupal) {

  Drupal.behaviors.AdminDialogsSelector = {
    attach: function (context, settings) {
      let paths = settings.admin_dialogs.paths;
      let selectors = settings.admin_dialogs.selectors;
      if (paths) {
        $('a:not(".admin-dialog-processed")').each(function() {
          // Optional chaining
          let href = $(this).attr('href');
          for (const path in paths) {
            if (matchRule(href, path)) {
              if (paths[path] !== undefined) {
                $(this).addClass(paths[path]['class'][0]);
                $(this).attr('data-dialog-options', paths[path]['data-dialog-options']);
                $(this).attr('data-dialog-type', paths[path]['data-dialog-type']);
                if (paths[path]['data-dialog-type'] == 'dialog') {
                  $(this).attr('data-dialog-renderer', paths[path]['data-dialog-renderer']);
                }
              }
              $(this).addClass('admin-dialog-processed');
            }
          }
        });
      }
      if (selectors) {
        for (var selector in selectors) {
          let element = $(selector + ':not(".admin-dialog-selector-processed")');
          element.each(function() {
            $(this).addClass(selectors[selector]['class'][0]);
            $(this).attr('data-dialog-options', selectors[selector]['data-dialog-options']);
            $(this).attr('data-dialog-type', selectors[selector]['data-dialog-type']);
            if (selectors[selector]['data-dialog-type'] == 'dialog') {
              $(this).attr('data-dialog-renderer', selectors[selector]['data-dialog-renderer']);
            }
            $(this).addClass('admin-dialog-selector-processed');
          });
        }
      }
    }
  };

  function matchRule(str, rule) {
    const escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
  }

})(jQuery, Drupal);
