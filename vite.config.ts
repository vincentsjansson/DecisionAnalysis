import { defineConfig } from 'vite'

// Repo is served from https://<user>.github.io/DecisionAnalysis/,
// so all asset URLs need this prefix in production.
export default defineConfig({
  base: '/DecisionAnalysis/',
})
