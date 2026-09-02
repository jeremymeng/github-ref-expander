const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    // Pure-logic tests (test/refExpander.test.js) run under the default
    // 'node' environment. DOM/browser-wiring tests opt into jsdom per-file
    // via a `// @vitest-environment jsdom` docblock; when they do, this sets
    // the simulated page to a real-looking GitHub issue URL so
    // `location.pathname`-based repo detection in src/content.js works.
    environmentOptions: {
      jsdom: {
        url: 'https://github.com/octocat/hello-world/issues/1',
      },
    },
  },
});
