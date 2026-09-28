import { ref } from 'vue'
import type cloudbase from '@cloudbase/js-sdk'

export interface Rsvp {
  name: string
  phone: string
  attending: boolean
  count: number
  note: string
  createdAt: number
}

export interface Wish {
  name: string
  text: string
  createdAt: number
}

const envId = import.meta.env.VITE_TCB_ENV as string | undefined

let app: cloudbase.app.App | null = null
let authed = false

/** 云环境未配置或调用失败时为 true，数据退化为本机 localStorage */
export const cloudOffline = ref(false)

async function ensureApp(): Promise<cloudbase.app.App | null> {
  if (!envId) return null
  try {
    if (!app) {
      const { default: sdk } = await import('@cloudbase/js-sdk')
      app = sdk.init({ env: envId })
    }
    if (!authed) {
      await app.auth({ persistence: 'local' }).signInAnonymously()
      authed = true
    }
    return app
  } catch {
    return null
  }
}

const LS_RSVP = 'wedding:rsvps'
const LS_WISH = 'wedding:wishes'

function readLs<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

function writeLs(key: string, value: unknown[]) {
  localStorage.setItem(key, JSON.stringify(value))
}

export async function submitRsvp(rsvp: Rsvp): Promise<void> {
  const client = await ensureApp()
  if (!client) {
    cloudOffline.value = true
    writeLs(LS_RSVP, [...readLs<Rsvp>(LS_RSVP), rsvp])
    return
  }
  await client.callFunction({ name: 'submitRsvp', data: rsvp })
}

export async function rsvpCount(): Promise<number> {
  const client = await ensureApp()
  if (!client) {
    cloudOffline.value = true
    return readLs<Rsvp>(LS_RSVP).length
  }
  const res = await client.callFunction({ name: 'getRsvpCount' })
  return (res.result as { count: number }).count
}

export async function submitWish(wish: Wish): Promise<void> {
  const client = await ensureApp()
  if (!client) {
    cloudOffline.value = true
    writeLs(LS_WISH, [...readLs<Wish>(LS_WISH), wish])
    return
  }
  await client.callFunction({ name: 'submitGreeting', data: wish })
}

export async function listWishes(): Promise<Wish[]> {
  const client = await ensureApp()
  if (!client) {
    cloudOffline.value = true
    return readLs<Wish>(LS_WISH)
  }
  const res = await client.callFunction({ name: 'listGreetings' })
  return (res.result as { items: Wish[] }).items
}
