<script setup lang="ts">
import { computed, ref } from 'vue'
import { config } from '../config'

const d = new Date(config.weddingDate)
const month = d.getMonth() + 1
const day = d.getDate()
const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(d)
const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const mapUrl = computed(
  () =>
    `https://uri.amap.com/marker?position=${config.venue.longitude},${config.venue.latitude}&name=${encodeURIComponent(config.venue.name)}`,
)

const copied = ref(false)
async function copyAddress() {
  await navigator.clipboard.writeText(`${config.venue.name} ${config.venue.address}`)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <section>
    <h2 class="section-title" data-reveal>婚礼信息</h2>
    <p class="section-sub" data-reveal>WEDDING INFO</p>

    <div class="date-card" data-reveal>
      <div class="m-d">{{ month }}<span>月</span>{{ day }}<span>日</span></div>
      <p class="week">{{ weekday }} · {{ time }}</p>
    </div>

    <div class="venue" data-reveal data-reveal-delay="0.1">
      <h3>{{ config.venue.name }}</h3>
      <p>{{ config.venue.address }}</p>
      <div class="actions">
        <a class="btn primary" :href="mapUrl" target="_blank" rel="noopener">导航前往</a>
        <button class="btn" @click="copyAddress">{{ copied ? '已复制' : '复制地址' }}</button>
      </div>
    </div>

    <ul class="schedule" data-reveal data-reveal-delay="0.15">
      <li v-for="item in config.schedule" :key="item.time">
        <span class="time">{{ item.time }}</span>
        <span class="event">{{ item.event }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.date-card {
  text-align: center;
  padding: 28px 0 8px;
}

.m-d {
  font-size: 52px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 2px;
}

.m-d span {
  font-size: 18px;
  color: var(--gold-deep);
  margin: 0 6px;
}

.week {
  margin-top: 8px;
  font-size: 14px;
  letter-spacing: 3px;
  color: var(--ink-soft);
}

.venue {
  margin-top: 32px;
  text-align: center;
}

.venue h3 {
  font-size: 17px;
  letter-spacing: 2px;
}

.venue p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
}

.btn {
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 2px;
  padding: 9px 22px;
  border-radius: 999px;
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold-deep);
  cursor: pointer;
  text-decoration: none;
}

.btn.primary {
  background: var(--gold);
  color: var(--paper);
}

.schedule {
  margin-top: 40px;
  list-style: none;
  border-top: 1px dashed rgba(184, 147, 94, 0.4);
}

.schedule li {
  display: flex;
  align-items: baseline;
  gap: 20px;
  padding: 14px 4px;
  border-bottom: 1px dashed rgba(184, 147, 94, 0.4);
}

.time {
  font-size: 15px;
  color: var(--gold-deep);
  font-weight: 600;
  min-width: 48px;
}

.event {
  font-size: 14px;
  color: var(--ink);
}
</style>
