<script setup lang="ts">
import { ref } from 'vue'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Pagination } from 'swiper/modules'
import { config } from '../config'
import 'swiper/css'
import 'swiper/css/pagination'

const modules = [Pagination]
const broken = ref(new Set<number>())

function markBroken(i: number) {
  broken.value = new Set(broken.value).add(i)
}
</script>

<template>
  <section>
    <h2 class="section-title" data-reveal>相 册</h2>
    <p class="section-sub" data-reveal>GALLERY</p>

    <Swiper
      data-reveal
      class="gallery-swiper"
      :modules="modules"
      :slides-per-view="1.15"
      :centered-slides="true"
      :space-between="14"
      :pagination="{ clickable: true }"
    >
      <SwiperSlide v-for="(item, i) in config.gallery" :key="i">
        <figure class="card">
          <img
            v-if="item.src && !broken.has(i)"
            :src="item.src"
            :alt="item.caption"
            loading="lazy"
            @error="markBroken(i)"
          />
          <div v-else class="placeholder" :style="{ '--seed': i }">
            <span>{{ item.caption }}</span>
          </div>
          <figcaption>{{ item.caption }}</figcaption>
        </figure>
      </SwiperSlide>
    </Swiper>
  </section>
</template>

<style scoped>
.gallery-swiper {
  --swiper-pagination-color: var(--gold);
  --swiper-pagination-bullet-inactive-color: #d8cdbb;
  --swiper-pagination-bottom: 0;
  padding-bottom: 28px;
}

.card {
  height: 100%;
}

.card img,
.placeholder {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 12px;
  display: block;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(160deg, hsl(calc(30 + var(--seed) * 18), 38%, 88%), hsl(calc(20 + var(--seed) * 18), 30%, 80%));
  color: var(--ink-soft);
  font-size: 13px;
  letter-spacing: 2px;
}

figcaption {
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--ink-soft);
}
</style>
