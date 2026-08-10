import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from '@/app/App.vue'
import { installPrimeVue } from '@/app/plugins/primevue'
import { router } from '@/app/router'

import '@/app/assets/main.css'

async function bootstrap(): Promise<void> {
  /*
   * The mock backend must be intercepting before the first request goes out, so it is awaited
   * ahead of mount. It ships in the production image too — this application has no real
   * backend, and the brief asks for a demonstrable one.
   */
  if (import.meta.env.VITE_ENABLE_MOCK_API !== 'false') {
    const { startMockApi } = await import('@/mocks/browser')
    await startMockApi()
  }

  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  installPrimeVue(app)

  // Resolving the initial route before mount avoids a flash of the wrong view on deep links.
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
