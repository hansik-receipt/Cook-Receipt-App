<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { youtubeId, SOURCE_LABEL } from '../lib/recipes.js'
import DialPicker from './DialPicker.vue'
import { createVoiceListener, isVoiceSupported, speak } from '../lib/voice.js'
import { isContentLoading, loadContent } from '../lib/store.js'
import {
  cancelRecipeTimers, cancelTimer, dismissFired, formatDuration, formatRemaining, parseDurations, remaining,
  ringing, startTimer, timers
} from '../lib/timers.js'

const props = defineProps({ recipe: { type: Object, required: true } })
const emit = defineEmits(['close'])

// ── 사용자 설정 (이 휴대폰에 기억) ──
function pref(key, fallback) {
  try {
    return localStorage.getItem(`cook-recipes:${key}`) ?? fallback
  } catch {
    return fallback
  }
}
function setPref(key, value) {
  try {
    localStorage.setItem(`cook-recipes:${key}`, value)
  } catch {
    /* 무시 */
  }
}

// 글씨 크기: 거치대에 세워 두고 멀리서 봐도 읽히도록 기본을 크게
const SCALES = [1, 1.2, 1.45, 1.75, 2.1]
const scaleIdx = ref(Math.min(Math.max(Number(pref('font', 2)) || 2, 0), SCALES.length - 1))
watch(scaleIdx, (v) => setPref('font', v))
function zoom(d) {
  scaleIdx.value = Math.min(Math.max(scaleIdx.value + d, 0), SCALES.length - 1)
}

// 보기 방식: 한 단계씩(크게) / 전체
const view = ref(pref('view', 'focus'))
watch(view, (v) => setPref('view', v))

const body = ref(null)
const ytId = youtubeId(props.recipe.url)

// ── 레시피 내용 (저장돼 있으면 바로, 없으면 받아서 저장) ──
const content = computed(() => props.recipe.content || null)
const loading = computed(() => isContentLoading(props.recipe.id))
const failed = computed(() => !content.value && !loading.value && !!props.recipe.contentFailedAt)
const ingredients = computed(() => content.value?.ingredients || [])
const steps = computed(() => content.value?.steps || [])
const tips = computed(() => content.value?.tips || [])
const paragraphs = computed(() => (content.value?.text || '').split(/\n{2,}|\n/).filter(Boolean))
// 재료 목록 속 소제목 "[양념소스]"
const isGroup = (it) => /^\[.+\]$/.test(it)
const savedAt = computed(() => {
  const t = content.value?.savedAt
  return t ? new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''
})

// 한 단계씩 보기의 페이지: -1 = 재료, 0.. = 단계
const page = ref(-1)
const hasPages = computed(() => steps.value.length > 0)
const firstPage = computed(() => (ingredients.value.length ? -1 : 0))
watch(
  hasPages,
  (v) => {
    if (v && page.value < firstPage.value) page.value = firstPage.value
  },
  { immediate: true }
)
const focusMode = computed(() => view.value === 'focus' && hasPages.value)

async function goPage(i) {
  if (!hasPages.value) return false
  page.value = Math.min(Math.max(i, firstPage.value), steps.value.length - 1)
  await nextTick()
  if (focusMode.value) body.value?.scrollTo({ top: 0 })
  else body.value?.querySelector(`[data-step="${page.value}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

function refresh() {
  loadContent(props.recipe.id, { force: true })
}

// ── 유튜브 플레이어 ──
const playerEl = ref(null)
let player = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    if (!document.querySelector('script[data-yt-api]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.dataset.ytApi = '1'
      document.head.appendChild(s)
    }
  })
}
async function initPlayer() {
  if (!ytId) return
  await loadYouTubeApi()
  if (!playerEl.value) return
  player = new window.YT.Player(playerEl.value, { videoId: ytId, playerVars: { playsinline: 1, rel: 0 } })
}
function seek(delta) {
  if (!player?.getCurrentTime) return
  player.seekTo(Math.max(0, player.getCurrentTime() + delta), true)
}

// ── 스크롤 ──
function scrollPage(dir) {
  const el = body.value
  if (el) el.scrollBy({ top: dir * el.clientHeight * 0.6, behavior: 'smooth' })
}
function scrollEdge(top) {
  const el = body.value
  if (el) el.scrollTo({ top: top ? 0 : el.scrollHeight, behavior: 'smooth' })
}

// ── 읽어주기 ──
async function read() {
  let text = ''
  if (hasPages.value && page.value >= 0) text = `${page.value + 1}단계. ${steps.value[page.value].text}`
  else if (ingredients.value.length) text = `재료. ${ingredients.value.join(', ')}`
  else if (steps.value.length) text = `1단계. ${steps.value[0].text}`
  if (!text) return
  voice?.pause()
  await speak(text)
  voice?.resume()
}

// ── 스텝별 타이머 ──
const stepDurations = computed(() => steps.value.map((st) => parseDurations(st.text)))
const recipeTimers = computed(() => timers.filter((t) => t.recipeId === props.recipe.id))
function stepTimer(step, seconds) {
  return recipeTimers.value.find((t) => t.step === step && t.seconds === seconds)
}
function startStepTimer(step, seconds, label) {
  startTimer({ recipeId: props.recipe.id, recipeTitle: props.recipe.title, step, seconds, label })
  showFlash(`⏱ ${label || formatDuration(seconds)} 시작`)
}
const currentStep = computed(() => (hasPages.value && page.value >= 0 ? page.value : null))

// 직접 맞추기
const picker = ref(false)
const PRESETS = [30, 60, 180, 300, 600, 900, 1200, 1800] // 초
function startCustom(sec) {
  if (!(sec > 0)) return
  startStepTimer(currentStep.value, sec)
  picker.value = false
  dial.value = false
}
// 시계 다이얼 팝업 (마지막에 고른 값을 기억)
const dial = ref(false)
const lastDial = ref(Number(pref('dial', 300)) || 300)
function onDialConfirm(sec) {
  lastDial.value = sec
  setPref('dial', sec)
  startCustom(sec)
}

// ── 음성 명령 ──
const voiceSupported = isVoiceSupported()
const listening = ref(false)
const heard = ref('')
const voiceError = ref('')
const flash = ref('')
let voice = null

const ACTION_LABEL = {
  down: '⬇ 내려요', up: '⬆ 올려요', top: '⏫ 맨 위로', bottom: '⏬ 마지막 단계', nextStep: '다음 ▶',
  prevStep: '◀ 이전', read: '🔊 읽어요', play: '▶ 재생', pause: '⏸ 멈춤', rewind: '⏪ 10초 뒤로',
  forward: '⏩ 10초 앞으로', close: '닫기', stop: '🎤 끔', bigger: '가+ 크게', smaller: '가− 작게',
  ingredients: '🥕 재료', all: '📜 전체 보기'
}

function showFlash(text) {
  flash.value = text
  clearTimeout(showFlash.t)
  showFlash.t = setTimeout(() => (flash.value = ''), 1100)
}

// "7번으로" → 7단계로 바로 이동
async function gotoStep(n) {
  if (!steps.value.length) return showFlash('단계 정보가 없어요')
  if (n < 1 || n > steps.value.length) return showFlash(`${n}단계는 없어요 (1~${steps.value.length})`)
  showFlash(`${n}단계로 이동`)
  return goPage(n - 1)
}

function onTimerCommand(action) {
  if (action === 'timer:cancel') {
    if (!recipeTimers.value.length) return showFlash('켜진 타이머가 없어요')
    cancelRecipeTimers(props.recipe.id)
    return showFlash('⏱ 타이머 취소')
  }
  if (action.startsWith('timer:set:')) return startStepTimer(currentStep.value, Number(action.slice(10)))
  // "타이머 시작": 지금 단계 문장에 있는 시간으로
  const d = currentStep.value != null ? stepDurations.value[currentStep.value][0] : null
  if (!d) return showFlash('이 단계엔 시간이 없어요 · “3분 타이머”처럼 말해 주세요')
  return startStepTimer(currentStep.value, d.seconds, d.label)
}

async function onCommand(action) {
  // 알람이 울리는 중이면 "알았어/멈춰/그만"으로 끈다
  if (ringing.value && ['dismiss', 'pause', 'timer:cancel', 'stop'].includes(action)) {
    dismissFired()
    return showFlash('⏰ 알람 끔')
  }
  if (action === 'dismiss') return
  if (action.startsWith('timer:')) return onTimerCommand(action)
  if (action.startsWith('goto:')) return gotoStep(Number(action.slice(5)))
  showFlash(ACTION_LABEL[action] || '')
  switch (action) {
    case 'down': return scrollPage(1)
    case 'up': return scrollPage(-1)
    // 맨 위 = 재료(첫 화면), 끝 = 마지막 단계
    case 'top':
      if (hasPages.value) await goPage(firstPage.value)
      return scrollEdge(true)
    case 'bottom':
      if (hasPages.value) await goPage(steps.value.length - 1)
      if (!focusMode.value) return scrollEdge(false)
      return
    case 'nextStep': return (await goPage(page.value + 1)) || scrollPage(1)
    case 'prevStep': return (await goPage(page.value - 1)) || scrollPage(-1)
    case 'ingredients':
      if (focusMode.value) return goPage(-1)
      return body.value?.querySelector('.ingredients')?.scrollIntoView({ behavior: 'smooth' })
    case 'all': view.value = 'all'; return goPage(page.value)
    case 'read': return read()
    case 'bigger': return zoom(1)
    case 'smaller': return zoom(-1)
    case 'play': return player?.playVideo?.()
    case 'pause': return player?.pauseVideo?.()
    case 'rewind': return player ? seek(-10) : (await goPage(page.value - 1)) || scrollPage(-1)
    case 'forward': return player ? seek(10) : (await goPage(page.value + 1)) || scrollPage(1)
    case 'close': return emit('close')
    case 'stop': return toggleVoice(false)
  }
}

function toggleVoice(on = !listening.value) {
  setPref('voice', on ? '1' : '0')
  if (!voice) return
  if (on) voice.start()
  else voice.stop()
}

// ── 화면 꺼짐 방지 ──
let wakeLock = null
async function keepAwake() {
  try {
    if (document.visibilityState === 'visible') wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    /* 지원 안 함 */
  }
}
function onVisible() {
  if (document.visibilityState === 'visible') keepAwake()
}

onMounted(() => {
  if (!ytId) loadContent(props.recipe.id) // 저장돼 있으면 그대로, 예전 방식으로 정리된 인스타그램이면 다시 받는다
  initPlayer()
  keepAwake()
  document.addEventListener('visibilitychange', onVisible)
  if (voiceSupported) {
    voice = createVoiceListener({
      onCommand,
      onState: (s) => {
        if ('listening' in s) listening.value = s.listening
        if (s.heard) heard.value = s.heard
        if (s.error !== undefined) voiceError.value = s.error
      }
    })
    if (pref('voice', '0') === '1') voice.start()
  }
})
onUnmounted(() => {
  voice?.stop()
  window.speechSynthesis?.cancel()
  wakeLock?.release?.().catch(() => {})
  document.removeEventListener('visibilitychange', onVisible)
  player?.destroy?.()
})
</script>

<template>
  <div class="cook" role="dialog" aria-label="요리 모드" :style="{ '--cook-scale': SCALES[scaleIdx] }">
    <header class="cook-head">
      <button class="icon-btn big" aria-label="닫기" @click="emit('close')">←</button>
      <h2>{{ props.recipe.title || '레시피' }}</h2>
      <div class="zoom">
        <button :disabled="scaleIdx === 0" aria-label="글씨 작게" @click="zoom(-1)">가<sup>−</sup></button>
        <button :disabled="scaleIdx === SCALES.length - 1" aria-label="글씨 크게" @click="zoom(1)">가<sup>+</sup></button>
      </div>
      <button class="timer-btn" aria-label="타이머 맞추기" @click="picker = !picker">⏱</button>
      <button
        v-if="voiceSupported"
        class="mic"
        :class="{ on: listening }"
        :aria-label="listening ? '음성 명령 끄기' : '음성 명령 켜기'"
        @click="toggleVoice()"
      >
        🎤
      </button>
    </header>

    <div v-if="listening || voiceError" class="voice-bar" :class="{ err: voiceError }">
      <template v-if="voiceError">{{ voiceError }}</template>
      <template v-else>
        <span class="dot" /> 듣는 중 — “다음” “이전” “3번” “끝으로” “맨 위로” “재료” “내려” “올려” “읽어 줘” “타이머 시작” “3분 타이머” “크게”<template v-if="ytId">
          “재생” “멈춰” “뒤로”</template>
        <span v-if="heard" class="heard">· {{ heard }}</span>
      </template>
    </div>

    <div v-if="picker" class="timer-picker">
      <div class="presets">
        <button v-for="sec in PRESETS" :key="sec" @click="startCustom(sec)">{{ formatDuration(sec) }}</button>
      </div>
      <button class="btn ghost block dial-open" @click="dial = true">🕒 직접 설정 (분·초 다이얼)</button>
    </div>

    <DialPicker
      v-if="dial"
      :minutes="Math.floor(lastDial / 60)"
      :seconds="lastDial % 60"
      :start-label="`${currentStep != null ? `${currentStep + 1}단계 ` : ''}타이머 시작`"
      @confirm="onDialConfirm"
      @cancel="dial = false"
    />

    <div v-if="recipeTimers.length" class="timer-bar">
      <span v-for="t in recipeTimers" :key="t.id" class="timer-pill" :class="{ done: t.fired }">
        <button class="pill-main" @click="t.step != null && goPage(t.step)">
          {{ t.fired ? '⏰ 끝!' : '⏱' }}
          <small v-if="t.step != null">{{ t.step + 1 }}단계</small>
          <b>{{ t.fired ? t.label : formatRemaining(remaining(t)) }}</b>
        </button>
        <button class="pill-x" aria-label="타이머 끄기" @click="cancelTimer(t.id)">✕</button>
      </span>
    </div>

    <nav v-if="hasPages" class="view-tabs" role="tablist">
      <button role="tab" :aria-selected="view === 'focus'" :class="{ active: view === 'focus' }" @click="view = 'focus'">
        한 단계씩 크게
      </button>
      <button role="tab" :aria-selected="view === 'all'" :class="{ active: view === 'all' }" @click="view = 'all'">
        전체 보기
      </button>
    </nav>

    <Transition name="fade"><div v-if="flash" class="flash">{{ flash }}</div></Transition>

    <div ref="body" class="cook-body" :class="{ focus: focusMode }">
      <div v-if="ytId" class="player"><div ref="playerEl" /></div>
      <p v-if="props.recipe.memo" class="memo-box">📝 {{ props.recipe.memo }}</p>

      <template v-if="!ytId">
        <p v-if="loading && !content" class="state-msg">레시피 내용을 가져오는 중…</p>

        <!-- 한 단계씩 크게 -->
        <template v-else-if="focusMode">
          <div class="progress" aria-hidden="true">
            <span :style="{ width: `${((page + 1) / steps.length) * 100}%` }" />
          </div>
          <section v-if="page === -1" class="focus-card">
            <p class="focus-label">🥕 재료 <small>{{ ingredients.length }}가지</small></p>
            <ul class="focus-ingredients">
              <li v-for="(it, i) in ingredients" :key="i" :class="{ group: isGroup(it) }">{{ it }}</li>
            </ul>
            <ul v-if="tips.length" class="tips">
              <li v-for="(t, i) in tips" :key="i">💡 {{ t }}</li>
            </ul>
          </section>
          <section v-else class="focus-card">
            <p class="focus-label">
              <b>{{ page + 1 }}</b> <small>/ {{ steps.length }} 단계</small>
            </p>
            <p class="focus-text">{{ steps[page].text }}</p>
            <div v-if="stepDurations[page].length" class="step-timers">
              <template v-for="d in stepDurations[page]" :key="d.seconds">
                <button v-if="!stepTimer(page, d.seconds)" class="timer-chip" @click="startStepTimer(page, d.seconds, d.label)">
                  ⏱ {{ d.label }} 타이머
                </button>
                <button v-else class="timer-chip running" @click="cancelTimer(stepTimer(page, d.seconds).id)">
                  ⏱ {{ formatRemaining(remaining(stepTimer(page, d.seconds))) }} · 끄기
                </button>
              </template>
            </div>
            <img v-if="steps[page].image" :src="steps[page].image" alt="" referrerpolicy="no-referrer" />
          </section>
        </template>

        <!-- 전체 보기 -->
        <div v-else-if="ingredients.length || steps.length" class="all-view">
          <section v-if="ingredients.length" class="ingredients">
            <h3>🥕 재료</h3>
            <ul>
              <li v-for="(it, i) in ingredients" :key="i" :class="{ group: isGroup(it) }">{{ it }}</li>
            </ul>
            <ul v-if="tips.length" class="tips">
              <li v-for="(t, i) in tips" :key="i">💡 {{ t }}</li>
            </ul>
          </section>
          <section v-if="steps.length" class="steps">
            <h3>🍳 조리 순서</h3>
            <ol>
              <li v-for="(s, i) in steps" :key="i" :data-step="i" :class="{ current: i === page }" @click="goPage(i)">
                <span class="no">{{ i + 1 }}</span>
                <div>
                  <p>{{ s.text }}</p>
                  <div v-if="stepDurations[i].length" class="step-timers" @click.stop>
                    <template v-for="d in stepDurations[i]" :key="d.seconds">
                      <button v-if="!stepTimer(i, d.seconds)" class="timer-chip" @click="startStepTimer(i, d.seconds, d.label)">
                        ⏱ {{ d.label }}
                      </button>
                      <button v-else class="timer-chip running" @click="cancelTimer(stepTimer(i, d.seconds).id)">
                        ⏱ {{ formatRemaining(remaining(stepTimer(i, d.seconds))) }} ✕
                      </button>
                    </template>
                  </div>
                  <img v-if="s.image" :src="s.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
                </div>
              </li>
            </ol>
          </section>
        </div>

        <div v-else-if="paragraphs.length" class="plain">
          <p v-for="(t, i) in paragraphs" :key="i">{{ t }}</p>
        </div>

        <div v-else-if="failed" class="state-msg">
          <p>이 레시피 내용은 앱 안에서 보여줄 수 없었어요.</p>
          <button class="btn ghost" @click="refresh">다시 시도</button>
        </div>

        <!-- 인스타그램: 재료·순서만 추렸으니 원문도 접어서 남겨 둔다 -->
        <details v-if="(ingredients.length || steps.length) && paragraphs.length && !focusMode" class="original">
          <summary>📄 원문 글 전체 보기</summary>
          <p v-for="(t, i) in paragraphs" :key="i">{{ t }}</p>
        </details>
      </template>

      <div class="cook-foot">
        <p v-if="content" class="saved">
          💾 {{ savedAt }} 저장된 내용이라 인터넷 없이도 열려요 ·
          <button class="linkish" :disabled="loading" @click="refresh">{{ loading ? '가져오는 중…' : '새로 가져오기' }}</button>
        </p>
        <a class="btn ghost block" :href="props.recipe.url" target="_blank" rel="noopener">
          {{ SOURCE_LABEL[props.recipe.source] }}에서 원본 열기 ↗
        </a>
        <p v-if="!voiceSupported" class="saved">이 브라우저는 음성 명령을 지원하지 않아요. 크롬에서 열어 주세요.</p>
      </div>
    </div>

    <!-- 한 단계씩 보기: 젖은 손으로도 누르기 쉬운 큰 버튼 -->
    <footer v-if="focusMode" class="step-nav">
      <button :disabled="page <= firstPage" @click="goPage(page - 1)">◀ 이전</button>
      <button class="next" :disabled="page >= steps.length - 1" @click="goPage(page + 1)">
        {{ page === -1 ? '1단계 시작 ▶' : '다음 ▶' }}
      </button>
    </footer>
  </div>
</template>
