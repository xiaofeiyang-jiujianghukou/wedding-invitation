<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { cloudOffline, rsvpCount, submitRsvp, type Rsvp } from '../lib/store'

const form = reactive({ name: '', phone: '', attending: true, count: 1, note: '' })
const count = ref(0)
const done = ref(false)
const submitting = ref(false)

const valid = computed(() => form.name.trim().length > 0 && form.count >= 1)

onMounted(async () => {
  count.value = await rsvpCount()
})

async function submit() {
  if (!valid.value || submitting.value) return
  submitting.value = true
  const rsvp: Rsvp = {
    name: form.name.trim().slice(0, 20),
    phone: form.phone.trim().slice(0, 20),
    attending: form.attending,
    count: Math.min(10, Math.max(1, form.count)),
    note: form.note.trim().slice(0, 100),
    createdAt: Date.now(),
  }
  try {
    await submitRsvp(rsvp)
    count.value = cloudOffline.value ? count.value + 1 : await rsvpCount()
    done.value = true
    window.setTimeout(() => (done.value = false), 3000)
    form.name = ''
    form.phone = ''
    form.note = ''
    form.count = 1
    form.attending = true
  } finally {
    submitting.value = false
    nextTick(() => ScrollTrigger.refresh())
  }
}
</script>

<template>
  <section>
    <h2 class="section-title" data-reveal>赴约登记</h2>
    <p class="section-sub" data-reveal>RSVP</p>

    <form class="form" data-reveal @submit.prevent="submit">
      <label>
        <span>姓名 *</span>
        <input v-model="form.name" maxlength="20" placeholder="怎么称呼你" required />
      </label>

      <label>
        <span>手机</span>
        <input v-model="form.phone" maxlength="20" type="tel" placeholder="方便联系（选填）" />
      </label>

      <div class="row">
        <label class="radio">
          <input v-model="form.attending" type="radio" :value="true" />
          <em>准时到场</em>
        </label>
        <label class="radio">
          <input v-model="form.attending" type="radio" :value="false" />
          <em>遗憾缺席</em>
        </label>
      </div>

      <label v-if="form.attending">
        <span>同行人数</span>
        <input v-model.number="form.count" min="1" max="10" type="number" />
      </label>

      <label>
        <span>留言</span>
        <textarea v-model="form.note" maxlength="100" rows="3" placeholder="饮食禁忌或其他想告诉我们的（选填）" />
      </label>

      <button class="submit" type="submit" :disabled="!valid || submitting">
        {{ submitting ? '提交中…' : '提交回执' }}
      </button>
      <p v-if="done" class="toast">收到啦，感谢你的回复 ❤</p>
      <p v-if="cloudOffline" class="offline">预览模式：数据暂存在本机，接通云环境后自动同步到云端</p>
    </form>

    <p class="summary">已收到 {{ count }} 份回执</p>
  </section>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label > span {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--ink-soft);
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

.row {
  display: flex;
  gap: 16px;
}

.radio {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.radio input {
  accent-color: var(--gold-deep);
}

.radio em {
  font-style: normal;
}

.submit {
  margin-top: 6px;
  font-family: inherit;
  font-size: 15px;
  letter-spacing: 4px;
  padding: 12px;
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

.summary {
  margin-top: 28px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--ink-soft);
}
</style>
