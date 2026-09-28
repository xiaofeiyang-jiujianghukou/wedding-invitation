<script setup lang="ts">
import { onMounted } from 'vue'
import CoverSection from './components/CoverSection.vue'
import StorySection from './components/StorySection.vue'
import GallerySection from './components/GallerySection.vue'
import InfoSection from './components/InfoSection.vue'
import RsvpSection from './components/RsvpSection.vue'
import WishesSection from './components/WishesSection.vue'
import EndingSection from './components/EndingSection.vue'
import { initReveal } from './lib/reveal'

onMounted(() => initReveal())
</script>

<template>
  <CoverSection />
  <StorySection />
  <GallerySection />
  <InfoSection />
  <RsvpSection />
  <WishesSection />
  <EndingSection />
</template>
