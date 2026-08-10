<script setup lang="ts">
import { RouterView } from 'vue-router'

import { BaseToaster } from '@/shared/ui'
</script>

<template>
  <RouterView />
  <!-- Mounted once, outside the routed views, so a toast survives navigation. -->
  <BaseToaster />
</template>
