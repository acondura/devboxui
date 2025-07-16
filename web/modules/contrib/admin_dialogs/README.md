# Admin Dialogs

The Admin Dialogs module intends to improve UI by reducing number of page loads.
Instead of opening delete confirmation page the module will show the form in
a dialog (modal) form. This module is a great companion to the Admin Toolbar module.

For a full description of the module, visit the
[project page](https://www.drupal.org/project/admin_dialogs).

Submit bug reports and feature suggestions, or track changes in the
[issue queue](https://www.drupal.org/project/issues/admin_dialogs).

## Table of contents

- Installation
- Configuration
- Maintainers

## Installation

Install as you would normally install a contributed Drupal module. For further
information, see
[Installing Drupal Modules](https://www.drupal.org/docs/extending-drupal/installing-drupal-modules).

## Configuration

Configure the Document OCR at (`/admin/config/user-interface/dialogs`).
The module suppots two dialog types: Modal and Off-canvas (slides from the right) and 5
link types (Operation, Task Links, Action Links, Paths and CSS Selector)

### Operation

This type targets links located in the operations links dropdown. The main keys are
edit, delete and you may enter custom key to trigger a dialog.

### Task Links

This type targets links in the tabs.

### Action Links

This type targets action links (buttons at the top of the pages (when available)).
You may also add wildcard. Currently only 1 trailing wildcard is supported.

Example:

`field_ui.field_storage_config_add:field_storage_config_add_*` this will target
routes that start with `field_ui.field_storage_config_add:field_storage_config_add_`
and open configured dialog.

### Paths

You may also target link URLs in HREF tags. To target links in multilingual sites you
would need to use `*` at the beginning of each path. Also its recommended to add
the `*` at the end of the path too so it ignores URL parameters like ?destination etc.

Example:

`*/add/*` this will find all links with HREF taht contains `/add/` and trigger 
configured dialog.

### CSS Selector

With the CSS selector you can target any element. You may target links with certain
class names or different attributes.

Example:

`#menu-overview li.edit a` this will triggered a dialog when a link in the list is
clicked

## Maintainers

- [Minnur Yunusov (minnur)](https://www.drupal.org/u/minnur)
