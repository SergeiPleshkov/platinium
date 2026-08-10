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
export { default as BaseBadge } from '@/shared/ui/BaseBadge/BaseBadge.vue'
export { default as BaseButton } from '@/shared/ui/BaseButton/BaseButton.vue'
export { default as BaseDatePicker } from '@/shared/ui/BaseDatePicker/BaseDatePicker.vue'
export { default as BaseConfirmDialog } from '@/shared/ui/BaseConfirmDialog/BaseConfirmDialog.vue'
export { default as BaseDataTable } from '@/shared/ui/BaseDataTable/BaseDataTable.vue'
export { default as BaseEmptyState } from '@/shared/ui/BaseEmptyState/BaseEmptyState.vue'
export { default as BaseFormField } from '@/shared/ui/BaseFormField/BaseFormField.vue'
export { default as BaseInput } from '@/shared/ui/BaseInput/BaseInput.vue'
export { default as BaseModal } from '@/shared/ui/BaseModal/BaseModal.vue'
export { default as BaseSearchInput } from '@/shared/ui/BaseSearchInput/BaseSearchInput.vue'
export { default as BaseSelect } from '@/shared/ui/BaseSelect/BaseSelect.vue'
export { default as BaseTextarea } from '@/shared/ui/BaseTextarea/BaseTextarea.vue'
export { default as BaseToaster } from '@/shared/ui/BaseToaster/BaseToaster.vue'
export type { ButtonSize, ButtonVariant } from '@/shared/ui/BaseButton/types'
export type { BadgeTone } from '@/shared/ui/BaseBadge/BaseBadge.vue'
export type { SelectOption } from '@/shared/ui/BaseSelect/BaseSelect.vue'
export type { TableColumn } from '@/shared/ui/BaseDataTable/types'
