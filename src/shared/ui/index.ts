/**
 * The application UI kit.
 *
 * Everything outside `src/shared/ui` imports components from here, never from `primevue/*`
 * (enforced by the `boundaries/ui-kit-isolation` ESLint rule). Replacing PrimeVue with
 * in-house components is therefore a change behind this barrel, invisible to callers.
 */
export { default as BaseButton } from '@/shared/ui/BaseButton/BaseButton.vue'
export type { ButtonSize, ButtonVariant } from '@/shared/ui/BaseButton/types'
