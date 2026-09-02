/* GitHub Ref Expander — popup script. */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  const STORAGE_KEY = 'autoExpandEnabled';

  const toggle = document.getElementById('auto-expand-toggle');
  const readmeLink = document.getElementById('readme-link');

  if (readmeLink && api.runtime && api.runtime.getURL) {
    readmeLink.href = api.runtime.getURL('README.md');
  }

  Promise.resolve(api.storage.sync.get({ [STORAGE_KEY]: true }))
    .then((result) => {
      toggle.checked = result[STORAGE_KEY];
    })
    .catch(() => {
      toggle.checked = true;
    });

  toggle.addEventListener('change', () => {
    Promise.resolve(api.storage.sync.set({ [STORAGE_KEY]: toggle.checked })).catch(() => {});
  });
})();
