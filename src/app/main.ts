import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from '@/app/App.vue'
import { installPrimeVue } from '@/app/plugins/primevue'
import { router } from '@/app/router'

import '@/app/assets/main.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  installPrimeVue(app)

  // Resolving the initial route before mount avoids a flash of the wrong view on deep links.
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
