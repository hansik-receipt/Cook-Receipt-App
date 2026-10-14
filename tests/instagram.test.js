import { describe, expect, it } from 'vitest'
import { instagramCaption, instagramCaptionFromHtml, parseInstagramText } from '../src/lib/content.js'

// 실제 릴스(떡볶이)를 리더 서비스로 받은 텍스트 형식. 캡션이 제목과 본문에 두 번 들어 있다.
const CAPTION = `이 떡볶이 레시피의 역사에 대해 말해보자면

-인스타 + 유튜브 = 1000만 조회수

-네이버 블로그에 레시피 올렸다가 메인가고 난리남

-집에서 먹어 본 친구들마다 레시피 적어줌

많이 달지 않으면서 간이 딱 맞고,
멸치육수&굴소스 덕분에
감칠맛이 폭발하는 스타일의 떡볶이예요✨

이 레시피를 알려 드린지 벌써 2년이 되었는데
그 간 재료 양도 알려달라는 요청이 많았어서
이번에 이 떡볶이 레시피를
좀 더 정교하게 손 봤습니다.

👩‍🍳엽떡보다 맛있는 국물 떡볶이 레시피

-물 1리터, 멸치맛 코인육수 2개

-양념소스 : 고추장 2T, 고춧가루 1.5T, 진간장 1T, 굴소스 1T, 맛술 1T, 알룰로오스 4T(물엿 대체 가능), 다진마늘 1T

-양파 1개, 양배추 1/4통, 대파 1대, 떡볶이떡 250g, 비엔나소세지 170g, 어묵 250g, 라면 or 쫄면

‼️계량스푼에 계량 할 때 깎아서 넣지 않았고,
소복하게 듬뿍 떠서 계량했습니다.

라면이나 쫄면 꼭 넣어야 완성되는 레시피예요!
(안 넣으면 홍수됨)

인터넷 레시피 솔직히 다 맛있는 거 아닌데
해보고 진짜 맛있는 레시피만 알려드려요🥹
전 이 레시피로 만들고부터는
떡볶이 배달을 끊었답니다,, ㅎㅎ

가을 타서 꿀꿀 할 때,
매콤하고 감칠맛도는 떡볶이로 해결해보아요!! ❤️`

const TTEOK = `Title: natashablue life on Instagram: "${CAPTION}

#떡볶이레시피 #떡볶이 #집밥스타그램 #주방스타그램"

URL Source: https://www.instagram.com/reel/DeOz-3EJKvD/

Markdown Content:
Log In

Sign Up

Never miss a post from natashablue life

[natashablue life](https://www.instagram.com/natashablue_life/)

•

Follow

girl in red•we fell in love in october

[natashablue life](https://www.instagram.com/natashablue_life/)5d

${CAPTION}

#떡볶이레시피#떡볶이#집밥스타그램#주방스타그램

[gimsiyeon470](https://www.instagram.com/gimsiyeon470/)8h

❤️

Like

Reply

[fairy mom](https://www.instagram.com/fairymom/)4d

오 .. 맛있겠어요 🧚🏻‍♀️🩵

3 likes

Reply

[seoksunho](https://www.instagram.com/seoksunho/)5d

맛있겠어요 레시피저장할께요~

1 like

Reply

652 27

5 days ago

Log in to like or comment.

More posts from natashablue life

© 2026 Instagram from Meta`

describe('instagram', () => {
  it('리더 텍스트에서 캡션만 꺼낸다 (로그인 안내·댓글·메뉴 제외)', () => {
    const c = instagramCaption(TTEOK)
    expect(c.startsWith('이 떡볶이 레시피의 역사')).toBe(true)
    expect(c).not.toMatch(/Log In|Follow|Reply|맛있겠어요|Meta/)
    // 제목이 없어도 본문 쪽 캡션으로 찾는다
    const bodyOnly = instagramCaption(TTEOK.replace(/^Title:[\s\S]*?(?=URL Source:)/, 'Title: x\n'))
    expect(bodyOnly.startsWith('이 떡볶이 레시피의 역사')).toBe(true)
    expect(bodyOnly).not.toMatch(/gimsiyeon|Reply|맛있겠어요/)
  })

  it('사연·인사말을 버리고 재료와 팁만 남긴다', () => {
    const r = parseInstagramText(TTEOK)
    expect(r.ingredients).toEqual([
      '물 1리터', '멸치맛 코인육수 2개',
      '[양념소스]', '고추장 2T', '고춧가루 1.5T', '진간장 1T', '굴소스 1T', '맛술 1T', '알룰로오스 4T(물엿 대체 가능)', '다진마늘 1T',
      '양파 1개', '양배추 1/4통', '대파 1대', '떡볶이떡 250g', '비엔나소세지 170g', '어묵 250g', '라면 or 쫄면'
    ])
    expect(r.steps).toEqual([])
    expect(r.tips).toEqual([
      '계량스푼에 계량 할 때 깎아서 넣지 않았고, 소복하게 듬뿍 떠서 계량했습니다.',
      '라면이나 쫄면 꼭 넣어야 완성되는 레시피예요! (안 넣으면 홍수됨)'
    ])
    expect(r.text).not.toMatch(/#/)
  })

  it('번호 매긴 순서와 재료 제목을 나눈다', () => {
    const cap = `오늘은 초간단 계란말이 🥚 저장해두고 따라해보세요!!

[재료]
계란 4개
대파 약간
소금 2꼬집

[만드는 법]
1️⃣ 계란을 풀고 소금, 대파를 넣어 섞어요.
2️⃣ 약불에 팬을 달구고 기름을 둘러요.
얇게 부어 익혀 주세요.
3️⃣ 돌돌 말아 1분 더 익혀요.

맛있게 드세요 ❤️ 팔로우하고 더 많은 레시피 받아보세요!
#계란말이 #자취요리`
    const r = parseInstagramText(`Title: cook on Instagram: "${cap}"\nURL Source: https://www.instagram.com/reel/x/\nMarkdown Content:\nLog In`)
    expect(r.ingredients).toEqual(['계란 4개', '대파 약간', '소금 2꼬집'])
    expect(r.steps.map((s) => s.text)).toEqual([
      '계란을 풀고 소금, 대파를 넣어 섞어요.',
      '약불에 팬을 달구고 기름을 둘러요. 얇게 부어 익혀 주세요.',
      '돌돌 말아 1분 더 익혀요.'
    ])
    expect(r.tips).toEqual([])
  })

  it('레시피가 없는 캡션은 정리된 글만 준다', () => {
    const r = parseInstagramText('Title: a on Instagram: "오늘 저녁은 집밥! 너무 맛있었어요 다들 좋은 하루 보내세요 #집밥"\nURL Source: x\nMarkdown Content:\nLog In')
    expect(r).toEqual({ text: '오늘 저녁은 집밥! 너무 맛있었어요 다들 좋은 하루 보내세요' })
    expect(parseInstagramText('Title: 로그인\nURL Source: x')).toBeNull()
  })
})

describe('instagram HTML (리더 서비스가 막혔을 때)', () => {
  it('og:title / og:description 에서 캡션을 꺼낸다', () => {
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#x0a;')
    const html = `<html><head>
<meta property="og:description" content="652 likes, 27 comments - natashablue_life on October 9, 2026: &quot;짧게 잘린 캡션&quot;. " />
<meta property="og:title" content="natashablue life on Instagram: &quot;${esc(CAPTION)}&quot;" />
</head></html>`
    const cap = instagramCaptionFromHtml(html)
    expect(cap).toBe(CAPTION)
    const r = parseInstagramText('', cap)
    expect(r.ingredients).toContain('떡볶이떡 250g')
    expect(r.tips).toHaveLength(2)
    expect(instagramCaptionFromHtml('<html>Log in</html>')).toBe('')
    expect(instagramCaptionFromHtml(null)).toBe('')
  })
})
