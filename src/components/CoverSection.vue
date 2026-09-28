<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import gsap from 'gsap'
import { config } from '../config'

const target = new Date(config.weddingDate).getTime()
const now = ref(Date.now())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 1000)
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.from('.cover .line, .cover .names, .cover .date, .cover .countdown', {
      opacity: 0,
      y: 28,
      duration: 1,
      ease: 'power2.out',
      stagger: 0.15,
      delay: 0.2,
    })
  }
})
onUnmounted(() => window.clearInterval(timer))

const remain = computed(() => {
  const diff = Math.max(0, target - now.value)
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return { d, h, m, s }
})

const dateText = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(config.weddingDate))

const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const musicBroken = ref(false)

function toggleMusic() {
  if (!audio.value) return
  if (playing.value) {
    audio.value.pause()
    playing.value = false
  } else {
    audio.value.play().then(
      () => (playing.value = true),
      () => (musicBroken.value = true),
    )
  }
}
</script>

<template>
  <section class="cover">
    <button
      v-if="config.music && !musicBroken"
      class="music-btn"
      :class="{ playing }"
      @click="toggleMusic"
    >
      {{ playing ? '♪ 暂停' : '♪ 播放' }}
    </button>
    <audio v-if="config.music" ref="audio" :src="config.music" loop preload="none" />

    <p class="line">{{ config.coverLine }}</p>
    <h1 class="names">{{ config.groom }} <span>&</span> {{ config.bride }}</h1>
    <p class="date">{{ dateText }}</p>

    <div class="countdown">
      <div v-for="unit in [
        { v: remain.d, label: '天' },
        { v: remain.h, label: '时' },
        { v: remain.m, label: '分' },
        { v: remain.s, label: '秒' },
      ]" :key="unit.label" class="cell">
        <b>{{ String(unit.v).padStart(2, '0') }}</b>
        <i>{{ unit.label }}</i>
      </div>
    </div>

    <a class="scroll-hint" href="#story">下滑开启邀请 ↓</a>
  </section>
</template>

<style scoped>
.cover {
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  background:
    radial-gradient(circle at 50% 18%, rgba(184, 147, 94, 0.14), transparent 55%),
    var(--paper);
}

.music-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold-deep);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 2px;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
}

.music-btn.playing {
  background: var(--gold);
  color: var(--paper);
}

.line {
  font-size: 14px;
  letter-spacing: 6px;
  color: var(--ink-soft);
  margin-bottom: 24px;
}

.names {
  font-size: 44px;
  font-weight: 600;
  letter-spacing: 4px;
  color: var(--ink);
}

.names span {
  color: var(--rose);
  font-size: 32px;
}

.date {
  margin-top: 20px;
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--gold-deep);
}

.countdown {
  display: flex;
  gap: 14px;
  margin-top: 40px;
}

.cell {
  width: 62px;
  padding: 10px 0;
  border: 1px solid rgba(184, 147, 94, 0.4);
  border-radius: 10px;
  background: rgba(255, 253, 248, 0.7);
}

.cell b {
  display: block;
  font-size: 22px;
  color: var(--ink);
}

.cell i {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-soft);
  letter-spacing: 2px;
}

.scroll-hint {
  position: absolute;
  bottom: 36px;
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--ink-soft);
  text-decoration: none;
  animation: bob 2s ease-in-out infinite;
}

@keyframes bob {
  50% { transform: translateY(6px); }
}
</style>
