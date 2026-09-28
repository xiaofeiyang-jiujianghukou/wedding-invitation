<script setup lang="ts">
import { config } from '../config'
</script>

<template>
  <section class="ending">
    <div class="divider" data-reveal>❦</div>
    <p class="thanks" data-reveal data-reveal-delay="0.1">{{ config.endingThanks }}</p>
    <p class="names" data-reveal data-reveal-delay="0.2">{{ config.groom }} & {{ config.bride }} 敬邀</p>
  </section>
</template>

<style scoped>
.ending {
  text-align: center;
  padding-bottom: 96px;
  background: radial-gradient(circle at 50% 100%, rgba(184, 147, 94, 0.12), transparent 60%);
}

.divider {
  color: var(--gold);
  font-size: 20px;
  margin-bottom: 28px;
}

.thanks {
  font-size: 15px;
  color: var(--ink-soft);
  white-space: pre-line;
  letter-spacing: 1px;
}

.names {
  margin-top: 32px;
  font-size: 17px;
  letter-spacing: 4px;
  color: var(--gold-deep);
}
</style>
