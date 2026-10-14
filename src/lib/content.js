// 웹 레시피(만개의레시피 등)의 재료·조리 순서를 가져와 요리 모드에서 보여준다.
// 정적 호스팅이라 다른 사이트를 직접 읽을 수 없어(CORS) 공개 프록시를 거친다. 실패하면 원본 열기로 안내한다.

/** HTML 안의 JSON-LD(schema.org Recipe)에서 재료·순서를 뽑는다 */
export function parseRecipeHtml(html) {
  const blocks = [...String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, raw] of blocks) {
    let data
    try {
      data = JSON.parse(raw.trim())
    } catch {
      continue
    }
    const recipe = findRecipe(data)
    if (!recipe) continue
    const ingredients = toArray(recipe.recipeIngredient || recipe.ingredients).map(clean).filter(Boolean)
    const steps = flattenSteps(recipe.recipeInstructions)
    if (ingredients.length || steps.length) {
      return { title: clean(recipe.name), ingredients, steps }
    }
  }
  return null
}

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n)
      if (r) return r
    }
    return null
  }
  const type = toArray(node['@type'])
  if (type.includes('Recipe')) return node
  return findRecipe(node['@graph'])
}

function flattenSteps(ins) {
  const out = []
  for (const s of toArray(ins)) {
    if (typeof s === 'string') {
      // 문자열 하나에 여러 줄이 들어 있는 경우
      out.push(...s.split(/\n+/).map((t) => ({ text: clean(t) })))
    } else if (s?.['@type'] === 'HowToSection' || s?.itemListElement) {
      out.push(...flattenSteps(s.itemListElement))
    } else if (s) {
      out.push({ text: clean(s.text || s.name), image: firstImage(s.image) })
    }
  }
  return out.filter((s) => s.text)
}

function firstImage(img) {
  const v = toArray(img)[0]
  return typeof v === 'string' ? v : v?.url || ''
}

function toArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

function clean(t) {
  return String(t || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * JSON-LD 가 없을 때 만개의레시피 화면 구조에서 직접 뽑는다 (브라우저 DOMParser 필요)
 *   재료: #divConfirmedMaterialArea li / .ready_ingre3 li   순서: [id^=stepdescr] / .step_list_txt
 */
export function parseRecipeDom(html) {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pick = (sels) => {
    for (const sel of sels) {
      const els = [...doc.querySelectorAll(sel)]
      if (els.length) return els
    }
    return []
  }
  const ingredients = pick(['#divConfirmedMaterialArea li', '.ready_ingre3 li', '.ingre_list li', '[class*="ingredient"] li'])
    .map((li) => clean(li.textContent.replace(/구매/g, '')))
    .filter(Boolean)
  const steps = pick(['[id^="stepdescr"]', '.step_list_txt', '.view_step_cont .media-body', '[class*="step"] li'])
    .map((el) => ({ text: clean(el.textContent), image: el.closest('[id^="stepDiv"], li')?.querySelector('img')?.getAttribute('src') || '' }))
    .filter((s) => s.text)
  if (steps.length < 2) return null
  return { title: clean(doc.querySelector('h3, h1')?.textContent), ingredients, steps }
}

const JUNK = /(로그인|회원가입|광고|공유하기|스크랩|댓글|구독|팔로우|앱\s*다운|쿠키|copyright|ⓒ|©|바로가기|메뉴|검색|더보기|이전글|다음글|관련\s*레시피|추천\s*레시피|요리\s*후기|사진\s*후기|리뷰|신고)/i
const END_MARK = /^(#+\s*)?(댓글|요리\s*후기|관련\s*레시피|추천\s*레시피|이\s*레시피와|레시피\s*작성자|요리\s*팁\s*더보기)/
const ING_MARK = /^(#+\s*)?(\[?\s*재료|재료\s*Ingredients|Ingredients)/i
const STEP_MARK = /^(#+\s*)?(조리\s*순서|요리\s*순서|만드는\s*(법|방법)|레시피\s*순서|Steps?|How to)/i
const STEP_LINE = /^(step\s*\d+|\d+\s*[.)]|\d+\s*단계)\s*/i

/** 리더 서비스의 본문 텍스트에서 잡음을 지우고, 가능하면 재료·순서로 나눈다 */
export function structureText(raw) {
  let lines = String(raw || '')
    .replace(/^(Title|URL Source|Published Time|Markdown Content|Warning):.*$/gim, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>|]+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^[-=#\s]+$/.test(l) && !/^https?:\/\//.test(l))

  // 후기·댓글 이후는 버린다
  const end = lines.findIndex((l, i) => i > 5 && END_MARK.test(l))
  if (end > 0) lines = lines.slice(0, end)
  lines = lines.filter((l) => !(l.length < 25 && JUNK.test(l)))

  const ingAt = lines.findIndex((l) => ING_MARK.test(l))
  const stepAt = lines.findIndex((l, i) => i > ingAt && STEP_MARK.test(l))

  let ingredients = []
  let steps = []
  if (ingAt >= 0 && stepAt > ingAt) {
    ingredients = lines
      .slice(ingAt + 1, stepAt)
      .map((l) => l.replace(/\s*구매$/, ''))
      .filter((l) => l && l.length <= 40 && !ING_MARK.test(l))
    steps = lines.slice(stepAt + 1)
  } else {
    const numbered = lines.filter((l) => STEP_LINE.test(l))
    if (numbered.length >= 2) steps = lines.slice(lines.indexOf(numbered[0]))
  }
  // 번호 줄을 기준으로 단계를 묶는다 (번호가 없으면 줄마다 한 단계)
  if (steps.length) {
    const grouped = []
    const hasNumbers = steps.filter((l) => STEP_LINE.test(l)).length >= 2
    for (const l of steps) {
      if (!hasNumbers || STEP_LINE.test(l) || !grouped.length) {
        const text = l.replace(STEP_LINE, '').trim()
        if (text) grouped.push({ text })
        else grouped.push({ text: '' })
      } else grouped[grouped.length - 1].text += ` ${l}`
    }
    steps = grouped.map((s) => ({ text: s.text.trim() })).filter((s) => s.text.length > 1)
  }
  if (steps.length >= 2) return { ingredients, steps, fromText: true }
  const text = lines.join('\n').trim()
  return text.length > 50 ? { text } : null
}

// ── 인스타그램 릴스·게시물 ─────────────────────────────
// 리더 서비스 텍스트에는 캡션이 두 번(제목, 본문) 들어 있고, 뒤에 로그인 안내·댓글·메뉴가 붙는다.
// 캡션만 꺼낸 다음, 재료·순서·팁만 남기고 인사말·사연·해시태그는 버린다.

/** 정리 규칙이 바뀌면 올린다 → 예전 방식으로 저장된 인스타그램 내용을 다시 받는다 */
export const IG_PARSER = 1

const IG_AGE = /\S\s?\d{1,3}[smhdw]$/ // "natashablue life5d" 같은 작성자+시간 줄
const IG_REPLY = /^(Reply|답글\s*달기)$/i

function igLine(l) {
  return l
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 리더 텍스트에서 캡션 원문만 꺼낸다. 못 찾으면 '' */
export function instagramCaption(raw) {
  const s = String(raw || '').replace(/\r/g, '')
  const found = []
  // 1) 제목: `작성자 on Instagram: "캡션…"` (여러 줄)
  const t = s.match(/^Title:\s*([\s\S]*?)\n(?:URL Source|Published Time|Markdown Content):/m)
  const m = t?.[1].match(/Instagram[^:\n"“]*:\s*["“]([\s\S]*)$/)
  if (m) found.push(m[1].replace(/["”]\s*$/, ''))
  // 2) 본문: Follow 다음 "작성자+시간" 줄부터 첫 댓글 전까지
  const lines = s.split(/^Markdown Content:.*$/m).pop().split('\n').map(igLine)
  const follow = lines.findIndex((l) => /^(Follow|팔로우)$/i.test(l))
  const start = follow < 0 ? -1 : lines.findIndex((l, i) => i > follow && IG_AGE.test(l))
  if (start > 0) {
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      const commentHead = IG_AGE.test(lines[i]) && lines.slice(i + 1, i + 10).some((l) => IG_REPLY.test(l))
      if (commentHead || /^(Log in to like|More posts from|\d+ (days?|hours?|weeks?) ago$)/i.test(lines[i])) {
        end = i
        break
      }
    }
    found.push(lines.slice(start + 1, end).join('\n'))
  }
  return found.map((c) => c.trim()).sort((a, b) => b.length - a.length)[0] || ''
}

const LEAD = /^[\s\-–—~•·∙▪▫◦●○■□◆◇▶▷►✔✓☑✅❤♥*※>\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]+/u
const QTY =
  /(\d+(?:[./]\d+)?\s*(?:T|t|Ts|ts|큰술|작은술|스푼|숟가락|숟갈|티스푼|컵|g|kg|ml|mL|ML|L|l|리터|cc|개|대|통|봉지?|줌|꼬집|쪽|알|장|모|마리|덩이|줄기|인분|포기|팩)(?![a-zA-Z가-힣])|약간|적당량|한\s*줌|한\s*꼬집)/
const SENTENCE = /(요|다|죠|니다|세요)[.!~\s]*$/
const ING_HEAD = /^\[?\s*(?:주\s*|준비\s*|필요한\s*|기본\s*)?재료\s*(?:\(.*?\))?\s*\]?\s*[:：]?\s*/
const STEP_HEAD = /^\[?\s*(?:만드는\s*(?:법|방법)|조리\s*(?:법|순서|방법)|요리\s*순서|레시피\s*순서|how\s*to\s*make|how\s*to|steps?)\s*\]?\s*[:：]?\s*$/i
const IG_STEP = /^(?:step\s*\d+\s*[.):]?|\d{1,2}\s*[.)](?!\d)|\d️?⃣|[①-⑳]|\d+\s*단계\s*[.):]?)\s*/i
const TIP_MARK = /^\s*(?:‼|❗|❕|💡|⭐|🌟|📌|※|\*|tip|팁|꿀팁|포인트|point|주의|참고)/i
// 조리 동작 (요리 이름 속 글자와 헷갈리지 않게 활용형으로: "떡볶이" ≠ "볶아")
const COOK =
  /넣|볶[아았고으는기은]|끓[여였이고으는]|구워|굽[고는기]|썰[어고]|잘라|자르|다져|다지|데쳐|데치|삶[아았고은기는]|섞|버무|무쳐|무치|부어|붓[고는]|올려|뿌려|재워|졸[여이]|익혀|익히|계량|헹궈|씻[어고]|건져|식혀|갈아|풀어|녹여|튀[겨기]|쪄|찌[고는]|저어|으깨|[중약센강]불|뚜껑|팬[에을]|냄비|\d+\s*분|\d+\s*초/

function splitItems(line) {
  const out = []
  const label = line.match(/^([^:：,()]{1,12}?)\s*[:：]\s*(.+)$/)
  if (label) out.push(`[${label[1].trim()}]`)
  const rest = label ? label[2] : line
  for (const part of rest.split(/\s*[,，]\s*(?![^()]*\))/)) {
    const v = part.replace(LEAD, '').trim()
    if (v) out.push(v)
  }
  return out
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITY[e.toLowerCase()] ?? all
  })
}

/**
 * 리더 서비스가 막혔을 때: 원본 HTML 의 og:title / og:description 에서 캡션을 꺼낸다
 *   og:title       = `작성자 on Instagram: "캡션"`
 *   og:description = `좋아요 652개, 댓글 27개 - 작성자 - 10월 9일: "캡션"`
 */
export function instagramCaptionFromHtml(html) {
  const found = []
  for (const prop of ['og:title', 'og:description', 'twitter:title', 'description']) {
    const tag = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'))?.[0]
    const content = tag?.match(/content=(["'])([\s\S]*?)\1/i)?.[2]
    const m = content && decodeEntities(content).match(/:\s*["“]([\s\S]*)["”]\s*\.?\s*$/)
    if (m) found.push(m[1].trim())
  }
  return found.sort((a, b) => b.length - a.length)[0] || ''
}

/** 인스타그램 리더 텍스트 → { ingredients, steps, tips, text } (재료·순서를 못 찾으면 { text }) */
export function parseInstagramText(raw, caption = instagramCaption(raw)) {
  if (!caption) return null
  const lines = caption
    .split('\n')
    .map((l) => l.replace(/#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.replace(LEAD, '').length > 0)

  const ingredients = []
  const steps = []
  const tips = []
  let mode = null // 'ing' | 'step'
  let started = false
  let last = null // 바로 앞 줄을 어디에 넣었는지 (이어지는 줄 붙이기)
  for (const line of lines) {
    const core = line.replace(LEAD, '').trim()
    const tipLike = TIP_MARK.test(line)
    if (ING_HEAD.test(core) && (core.replace(ING_HEAD, '') === '' || QTY.test(core))) {
      mode = 'ing'
      started = true
      const rest = core.replace(ING_HEAD, '')
      if (rest) ingredients.push(...splitItems(rest))
      last = 'ing'
      continue
    }
    if (STEP_HEAD.test(core)) {
      mode = 'step'
      started = true
      last = null
      continue
    }
    if (IG_STEP.test(line.trim()) || IG_STEP.test(core)) {
      const text = core.replace(IG_STEP, '').trim() || line.trim().replace(IG_STEP, '').replace(LEAD, '').trim()
      if (text) steps.push({ text })
      mode = 'step'
      started = true
      last = 'step'
      continue
    }
    if (!tipLike && core.length <= 120 && QTY.test(core) && !SENTENCE.test(core)) {
      ingredients.push(...splitItems(core))
      started = true
      last = 'ing'
      continue
    }
    if (mode === 'ing' && !tipLike && core.length <= 40 && !SENTENCE.test(core) && !/[.!?]$/.test(core)) {
      ingredients.push(...splitItems(core))
      last = 'ing'
      continue
    }
    if (!started) continue
    if (mode === 'step' && !tipLike && COOK.test(core)) {
      if (last === 'step' && steps.length && !IG_STEP.test(line)) steps[steps.length - 1].text += ` ${core}`
      else steps.push({ text: core })
      last = 'step'
      continue
    }
    if (tipLike || COOK.test(core)) {
      const prev = tips[tips.length - 1]
      if (last === 'tip' && prev && (/[,，]$/.test(prev) || /^[(（]/.test(core) || !/[.!?)~]$/.test(prev))) {
        tips[tips.length - 1] = `${prev} ${core}`
      } else tips.push(core)
      last = 'tip'
      continue
    }
    last = null // 사연·인사말은 버린다
  }
  const text = lines.join('\n')
  if (ingredients.length || steps.length >= 2) return { ingredients, steps, tips, text }
  return text.length > 20 ? { text } : null
}

async function getText(url, init = {}, ms = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res.ok ? await res.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function fromHtml(html) {
  if (!html) return null
  return parseRecipeHtml(html) || parseRecipeDom(html)
}

/**
 * { ingredients, steps } 또는 { text } 를 돌려준다. 모두 실패하면 null. (인스타그램은 위의 캡션 정리를 쓴다)
 * 1) 원본 HTML(allorigins) → JSON-LD / 화면 구조
 * 2) 리더 서비스의 HTML(r.jina.ai) → 같은 해석
 * 3) 리더 서비스의 본문 텍스트 → 잡음 제거·구조화
 */
export async function fetchRecipeContent(url) {
  if (/(^|\.)instagram\.com$/.test(hostOf(url))) {
    // 원본 HTML은 로그인 화면이라 리더 텍스트에서 캡션을 꺼낸다
    const raw = await getText(`https://r.jina.ai/${url}`)
    let r = parseInstagramText(raw)
    // 리더 서비스가 인스타그램을 잠시 막는 일이 있다 → 원본 HTML 의 미리보기 정보로
    if (!r) r = parseInstagramText('', instagramCaptionFromHtml(await getText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)))
    if (!r) r = structureText(raw)
    return r && { ...r, parser: IG_PARSER }
  }
  const a = fromHtml(await getText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`))
  if (a) return a
  const b = fromHtml(await getText(`https://r.jina.ai/${url}`, { headers: { 'X-Respond-With': 'html' } }))
  if (b) return b
  return structureText(await getText(`https://r.jina.ai/${url}`))
}
