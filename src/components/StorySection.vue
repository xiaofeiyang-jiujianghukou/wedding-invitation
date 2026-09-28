<script setup lang="ts">
import { config } from '../config'
</script>

<template>
  <section id="story">
    <h2 class="section-title" data-reveal>我们的故事</h2>
    <p class="section-sub" data-reveal>OUR STORY</p>

    <div class="timeline">
      <div v-for="(item, i) in config.story" :key="item.title" class="node" data-reveal :data-reveal-delay="i * 0.12">
        <div class="dot" />
        <p class="date">{{ item.date }}</p>
        <h3>{{ item.title }}</h3>
        <p class="text">{{ item.text }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  position: relative;
  padding-left: 24px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: linear-gradient(var(--gold), rgba(184, 147, 94, 0.15));
}

.node {
  position: relative;
  padding-bottom: 36px;
}

.node:last-child {
  padding-bottom: 0;
}

.dot {
  position: absolute;
  left: -24px;
  top: 8px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--paper);
  border: 2px solid var(--gold);
}

.date {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--gold-deep);
}

.node h3 {
  font-size: 18px;
  margin: 4px 0 6px;
  letter-spacing: 2px;
}

.text {
  font-size: 14px;
  color: var(--ink-soft);
}
</style>
