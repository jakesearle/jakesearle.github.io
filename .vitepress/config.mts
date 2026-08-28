import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Jake Searle',
  // description: "A VitePress Site",
  cleanUrls: true,
  // Markdown files that are notes/scaffolding, not pages. Without this,
  // VitePress builds every .md in the repo into a public URL.
  srcExclude: ['**/README.md', '**/TODO.md', 'scripts/**'],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Rivals 2', link: '/rivals' },
      { text: 'Crochet', link: '/crochet' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/jakesearle' }],
  },
});
