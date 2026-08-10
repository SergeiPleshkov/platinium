<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { loginSchema } from '@/features/auth/schema'
import { useAuthStore } from '@/features/auth/store'
import { BaseButton, BaseInput } from '@/shared/ui'

/**
 * Sign-in.
 *
 * Authentication is mocked, so the seeded credentials are shown on the page — a reviewer
 * cloning this repository should not have to read the source to get in.
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const submitting = ref(false)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: { email: '', password: '' },
})

const [email] = defineField('email')
const [password] = defineField('password')

const onSubmit = handleSubmit(async (values) => {
  submitting.value = true
  try {
    if (!(await auth.login(values))) return

    /*
     * Navigate here rather than emitting: this is a routed component, so an event has no
     * parent to listen for it. The guard stored where the user was heading before it
     * redirected them; send them there, and only fall back to the dashboard otherwise.
     *
     * The redirect is required to be a path on this site — echoing an arbitrary `?redirect=`
     * back into `router.push` is how open-redirect bugs happen.
     *
     * The fallback is `/`, not a named route: this feature must not import the app layer's
     * route table, and deciding what the portal's landing page is belongs to the app anyway.
     */
    const requested = route.query['redirect']
    const target =
      typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
        ? requested
        : '/'

    await router.push(target)
  } finally {
    submitting.value = false
  }
})

function useDemoAccount(demoEmail: string): void {
  email.value = demoEmail
  password.value = 'password123'
}

const demoAccounts = [
  { email: 'admin@ticketing.test', role: 'Administrator' },
  { email: 'editor@ticketing.test', role: 'Editor' },
  { email: 'viewer@ticketing.test', role: 'Viewer' },
]
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-surface-50 p-4 dark:bg-surface-950">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-semibold text-content">Ticket Admin Portal</h1>
        <p class="mt-1 text-sm text-content-muted">Sign in to manage events and tickets.</p>
      </div>

      <form
        class="flex flex-col gap-5 rounded-xl border border-border bg-surface-0 p-6 shadow-sm dark:bg-surface-900"
        novalidate
        @submit="onSubmit"
      >
        <!--
          The server's rejection is announced, not just displayed: a screen-reader user who
          submits and hears nothing has no way to know the attempt failed.
        -->
        <p
          v-if="auth.loginError"
          role="alert"
          class="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {{ auth.loginError }}
        </p>

        <BaseInput
          v-model="email"
          label="Email address"
          type="email"
          autocomplete="username"
          placeholder="you@example.com"
          required
          :error="errors.email"
        />

        <BaseInput
          v-model="password"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
          :error="errors.password"
        />

        <BaseButton type="submit" :loading="submitting" block>
          {{ submitting ? 'Signing in…' : 'Sign in' }}
        </BaseButton>
      </form>

      <section class="mt-6 rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900">
        <h2 class="text-xs font-semibold tracking-wide text-content-muted uppercase">
          Demo accounts
        </h2>
        <p class="mt-1 text-xs text-content-muted">
          Authentication is mocked. Every account uses the password
          <code class="rounded bg-surface-100 px-1 py-0.5 dark:bg-surface-800">password123</code>
          .
        </p>
        <ul class="mt-3 flex flex-col gap-1">
          <li v-for="account in demoAccounts" :key="account.email">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
              @click="useDemoAccount(account.email)"
            >
              <span class="text-content">{{ account.email }}</span>
              <span class="text-xs text-content-muted">{{ account.role }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
