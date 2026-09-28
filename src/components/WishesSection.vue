<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { cloudOffline, listWishes, submitWish, type Wish } from '../lib/store'

const form = reactive({ name: '', text: '' })
const list = ref<Wish[]>([])
const done = ref(false)
const submitting = ref(false)

const valid = computed(() => form.name.trim().length > 0 && form.text.trim().length > 0)

onMounted(async () => {
  list.value = await listWishes()
})

async function submit() {
  if (!valid.value || submitting.value) return
  submitting.value = true
  const wish: Wish = {
    name: form.name.trim().slice(0, 20),
    text: form.text.trim().slice(0, 100),
    createdAt: Date.now(),
  }
  try {
    await submitWish(wish)
    list.value = cloudOffline.value ? [wish, ...list.value] : await listWishes()
    done.value = true
    window.setTimeout(() => (done.value = false), 3000)
    form.name = ''
    form.text = ''
  } finally {
    submitting.value = false
    nextTick(() => ScrollTrigger.refresh())
  }
}
</script>

<template>
  <section>
    <h2 class="section-title" data-reveal>祝福墙</h2>
    <p class="section-sub" data-reveal>WISHES</p>

    <form class="form" data-reveal @submit.prevent="submit">
      <input v-model="form.name" maxlength="20" placeholder="你的名字" required />
      <textarea v-model="form.text" maxlength="100" rows="3" placeholder="写下对我们的祝福吧" required />
      <button class="submit" type="submit" :disabled="!valid || submitting">
        {{ submitting ? '发送中…' : '送上祝福' }}
      </button>
      <p v-if="done" class="toast">祝福已上墙 ❤</p>
      <p v-if="cloudOffline" class="offline">预览模式：数据暂存在本机，接通云环境后自动同步到云端</p>
    </form>

    <ul v-if="list.length" class="wall" data-reveal>
      <li v-for="wish in list" :key="wish.createdAt">
        <p class="text">{{ wish.text }}</p>
        <p class="from">—— {{ wish.name }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

input,
textarea {
  font-family: inherit;
  font-size: 15px;
  color: var(--ink);
  background: var(--ivory);
  border: 1px solid rgba(184, 147, 94, 0.35);
  border-radius: 8px;
  padding: 10px 14px;
  outline: none;
}

input:focus,
textarea:focus {
  border-color: var(--gold);
}

.submit {
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 4px;
  padding: 11px;
  border: none;
  border-radius: 999px;
  background: var(--gold);
  color: var(--paper);
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toast {
  text-align: center;
  font-size: 13px;
  color: var(--rose);
}

.offline {
  text-align: center;
  font-size: 12px;
  color: var(--ink-soft);
}

.wall {
  margin-top: 36px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wall li {
  background: var(--ivory);
  border: 1px solid rgba(184, 147, 94, 0.25);
  border-radius: 12px;
  padding: 14px 18px;
}

.text {
  font-size: 14px;
  color: var(--ink);
}

.from {
  margin-top: 6px;
  text-align: right;
  font-size: 12px;
  color: var(--ink-soft);
  letter-spacing: 1px;
}
</style>
