import { defineConfig } from 'vitest/config'

// Repo is served from https://<user>.github.io/DecisionAnalysis/,
// so all asset URLs need this prefix in production.
export default defineConfig({
  base: '/DecisionAnalysis/',
  test: {
    environment: 'node',
  },
})
