<script setup lang="ts">
import { useResponsiveLayout } from '@/shared/composables/useBreakpoint'
import { useTableViewMode, type TableViewMode } from '@/shared/composables/useTableViewMode'
import BaseSegmentedControl, {
  type SegmentedOption,
} from '@/shared/ui/BaseSegmentedControl/BaseSegmentedControl.vue'

/**
 * The pagination ↔ virtual-scrolling switch that sits above every list.
 *
 * Reads the shared mode directly rather than taking a prop. It is one global preference with
 * three call sites and no per-page variation, so threading it through each page as
 * `v-model` would add three bindings that could only ever hold the same value.
 *
 * Hidden below `md`, where the grid becomes a card list and virtual mode does not apply, see
 * `BaseDataTable`. A visible control that silently does nothing is worse than no control.
 */

const { mode, setMode } = useTableViewMode()
const { isMobile } = useResponsiveLayout()

const options: ReadonlyArray<SegmentedOption<TableViewMode>> = [
  { value: 'paginated', label: 'Pages', icon: 'pi pi-list' },
  { value: 'virtual', label: 'Virtual', icon: 'pi pi-bars' },
]
</script>

<template>
  <div v-if="!isMobile" class="flex items-center gap-2">
    <!--
      Labelled as a demo control on the surface, not just in a code comment. A reviewer should
      not have to guess whether shipping both strategies was a decision or an indecision.
    -->
    <span class="text-xs font-medium tracking-wide text-content-muted uppercase">Demo</span>
    <BaseSegmentedControl
      :model-value="mode"
      :options="options"
      label="Row rendering strategy"
      @update:model-value="setMode"
    />
  </div>
</template>
