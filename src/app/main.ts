import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from '@/app/App.vue'
import { installPrimeVue } from '@/app/plugins/primevue'
import { router } from '@/app/router'
import { useAuthStore } from '@/features/auth'
import { configureHttp } from '@/shared/api'
import { initTheme } from '@/shared/composables'

import '@/app/assets/main.css'

async function bootstrap(): Promise<void> {
  /*
   * The mock backend must be intercepting before the first request goes out, so it is awaited
   * ahead of mount. It ships in the production image too, because this application has no real
   * backend, and the brief asks for a demonstrable one.
   */
  if (import.meta.env.VITE_ENABLE_MOCK_API !== 'false') {
    const { startMockApi } = await import('@/mocks/browser')
    await startMockApi()
  }

  // Re-applies the stored preference the inline script in index.html set pre-paint.
  initTheme()

  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  installPrimeVue(app)

  /*
   * The HTTP layer is told how to find the token and what to do on a 401, rather than
   * importing the auth store itself, `shared/` may not depend on a feature. Wiring the two
   * together is the app layer's job, and this is the seam where it happens.
   */
  const auth = useAuthStore(pinia)
  configureHttp({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
    getAuthToken: () => auth.token,
    onUnauthorized: () => auth.endExpiredSession(),
  })

  app.use(router)

  // Resolving the initial route before mount avoids a flash of the wrong view on deep links.
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
