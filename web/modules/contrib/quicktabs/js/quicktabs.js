(function ($, Drupal, drupalSettings, once, cookies) {
  Drupal.quicktabs = Drupal.quicktabs || {};

  Drupal.quicktabs.getQTName = function (el) {
    return el.attr('id').substring(el.attr('id').indexOf('-') + 1);
  };

  Drupal.behaviors.quicktabs = {
    attach(context, settings) {
      $(once('quicktabs-wrapper', 'div.quicktabs-wrapper', context)).each(
        function () {
          const el = $(this);
          Drupal.quicktabs.prepare(el);
        },
      );
    },
  };

  // Setting up the initial behaviors
  Drupal.quicktabs.prepare = function (el) {
    // el.id format: "quicktabs-$name"
    const qtName = Drupal.quicktabs.getQTName(el);
    const $ul = $(el).find('ul.quicktabs-tabs:first');
    $ul.find('li a').each(function (i, element) {
      element.myTabIndex = i;
      element.qtName = qtName;
      const tab = new Drupal.quicktabs.tab(element);
      $(element).parents('li').get(0);
      $(element).on('click', { tab }, Drupal.quicktabs.clickHandler); // Replaced .bind() with .on()
      $(element).on(
        'keydown',
        { myTabIndex: i },
        Drupal.quicktabs.keyDownHandler,
      ); // Replaced .bind() with .on()
    });
  };

  Drupal.quicktabs.clickHandler = function (event) {
    let tab = event.data.tab;
    const element = this;

    // Set clicked tab to active.
    $(this).parents('li').siblings().removeClass('active');
    $(this).parents('li').siblings().attr('aria-selected', 'false');
    $(this).parents('li').siblings().find('a').attr('tabindex', '-1');
    $(this).parents('li').addClass('active');
    $(this).parents('li').attr('aria-selected', 'true');
    $(this).attr('tabindex', '0');

    if ($(this).hasClass('use-ajax')) {
      $(this).addClass('quicktabs-loaded');
    }

    // Hide all tabpages.
    tab.container.children().addClass('quicktabs-hide');

    if (!tab.tabpage.hasClass('quicktabs-tabpage')) {
      tab = new Drupal.quicktabs.tab(element);
    }

    tab.tabpage.removeClass('quicktabs-hide');
    return false;
  };

  Drupal.quicktabs.keyDownHandler = function (event) {
    const tabIndex = event.data.myTabIndex;

    const tabs = $(this).parent('li').parent('ul').find('li a');

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        if (tabIndex <= 0) {
          tabs[tabs.length - 1].click();
          tabs[tabs.length - 1].focus();
        } else {
          tabs[tabIndex - 1].click();
          tabs[tabIndex - 1].focus();
        }
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        if (tabIndex >= tabs.length - 1) {
          tabs[0].click();
          tabs[0].focus();
        } else {
          tabs[tabIndex + 1].click();
          tabs[tabIndex + 1].focus();
        }
    }
  };

  // Constructor for an individual tab
  Drupal.quicktabs.tab = function (el) {
    this.element = el;
    this.tabIndex = el.myTabIndex;
    const qtKey = `qt_${el.qtName}`;

    let i;
    for (i = 0; i < drupalSettings.quicktabs[qtKey].tabs.length; i++) {
      if (i === this.tabIndex) {
        this.tabObj = drupalSettings.quicktabs[qtKey].tabs[i];
        this.tabKey =
          typeof el.dataset.quicktabsTabIndex !== 'undefined'
            ? el.dataset.quicktabsTabIndex
            : i;
      }
    }

    this.tabpageId = `quicktabs-tabpage-${el.qtName}-${this.tabKey}`;
    this.container = $(`#quicktabs-container-${el.qtName}`);
    this.tabpage = this.container.find(`#${this.tabpageId}`);
  };

  // Enable tab memory (using jQuery Cookie plugin)
  Drupal.behaviors.quicktabsmemory = {
    attach(context, settings) {
      $(once('form-group', 'div.quicktabs-wrapper', context)).each(function () {
        const el = $(this);

        const qtName = Drupal.quicktabs.getQTName(el);
        const $ul = $(el).find('ul.quicktabs-tabs:first');

        // Default cookie options.
        const cookieOptions = { path: '/' };
        const cookieName = `Drupal-quicktabs-active-tab-id-${qtName}`;

        $ul.find('li a').each(function (i, element) {
          const $link = $(element);
          $link.data('myTabIndex', i);

          // Click the tab ID if a cookie exists.
          const $cookieValue = cookies.get(cookieName);
          if (
            $cookieValue !== '' &&
            $link.data('myTabIndex') === $cookieValue
          ) {
            // Changed == to ===
            $(element).click();
          }

          // Set the click handler for all tabs, this updates the cookie on every tab click.
          $link.on('click', function () {
            // Replaced .bind() with .on()
            const $linkdata = $(this);
            const tabIndex = $linkdata.data('myTabIndex');
            cookies.set(cookieName, tabIndex, cookieOptions);
          });
        });
      });
    },
  };

  if (Drupal.Ajax) {
    Drupal.Ajax.prototype.eventResponse = function (element, event) {
      event.preventDefault();
      event.stopPropagation();

      const ajax = this;

      if (ajax.ajaxing) {
        return;
      }

      try {
        if (ajax.$form) {
          if (ajax.setClick) {
            element.form.clk = element;
          }

          ajax.$form.ajaxSubmit(ajax.options);
        } else if (!$(element).hasClass('quicktabs-loaded')) {
          ajax.beforeSerialize(ajax.element, ajax.options);
          $.ajax(ajax.options);
        }
      } catch (e) {
        ajax.ajaxing = false;
        window.alert(
          `An error occurred while attempting to process ${ajax.options.url}: ${e.message}`,
        );
      }
    };
  }
})(jQuery, Drupal, drupalSettings, once, window.Cookies);
