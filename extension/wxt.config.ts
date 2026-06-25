import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    permissions: ['tabs', 'activeTab'],
    host_permissions: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      '*://shopee.co.th/*',
      '*://www.shopee.co.th/*',
    ],
    web_accessible_resources: [
      {
        resources: ['selectors.config.json'],
        matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*'],
      },
    ],
  },
})
