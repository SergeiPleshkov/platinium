/**
 * The application UI kit.
 *
 * Everything outside `src/shared/ui` imports components from here, never from `primevue/*`
 * (enforced by the `boundaries/ui-layer` ESLint rule). Replacing PrimeVue with in-house
 * components is therefore a change behind this barrel, invisible to callers.
 *
 * Primitives are added when a real screen needs them, so their prop API is shaped by actual
 * use rather than guessed at up front.
 */
export { default as BaseButton } from '@/shared/ui/BaseButton/BaseButton.vue'
export { default as BaseFormField } from '@/shared/ui/BaseFormField/BaseFormField.vue'
export { default as BaseInput } from '@/shared/ui/BaseInput/BaseInput.vue'
export { default as BaseToaster } from '@/shared/ui/BaseToaster/BaseToaster.vue'
export type { ButtonSize, ButtonVariant } from '@/shared/ui/BaseButton/types'
