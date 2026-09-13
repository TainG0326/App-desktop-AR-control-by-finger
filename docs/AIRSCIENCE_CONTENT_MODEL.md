# AirScience — Content Model

## Nguyên tắc
1. **Mọi fact khoa học phải có nguồn.**
2. **Nguồn là URL thật (NASA, Wikipedia tiếng Việt/Anh, VNExpress Khoa học, v.v.).**
3. **AI có thể diễn đạt đơn giản cho trẻ, nhưng KHÔNG bịa fact mới.**
4. **Review status: `draft` → `reviewed` → `published`. Trẻ chỉ thấy `published`.**

## Schema

```ts
type AgeRange = '7-8' | '8-10' | '9-10';

type ScienceFact = {
  id: string;                    // 'space.earth.basic'
  world: 'space' | 'animals' | 'human-body';
  topic: string;                 // 'planet' | 'satellite' | ...
  objectId: string;              // 'earth', 'moon', ...
  titleVi: string;               // 'Trái Đất'
  titleEn: string;               // 'Earth'
  shortExplanationVi: string;    // 1 câu ≤ 18 từ
  extendedExplanationVi: string; // 2–3 câu
  ageRange: AgeRange;
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;                // 'Wikipedia tiếng Việt'
  sourceUrl: string;             // URL thật
  reviewedBy?: string;           // tên người review
  reviewedAt?: string;           // ISO date
  reviewStatus: 'draft' | 'reviewed' | 'published';
  xpReward: number;              // XP khi discover lần đầu
};
```

## Slice đầu — Space facts (Space World)

Tất cả 9 hành tinh + Sun + Moon. Mỗi cái 1 fact `basic` + 1 fact `extended` (khi discover).

Ví dụ:

```ts
{
  id: 'space.earth.basic',
  world: 'space',
  topic: 'planet',
  objectId: 'earth',
  titleVi: 'Trái Đất',
  titleEn: 'Earth',
  shortExplanationVi: 'Trái Đất là hành tinh thứ 3 tính từ Mặt Trời.',
  extendedExplanationVi:
    'Trái Đất quay quanh Mặt Trời mất khoảng 365 ngày — đó chính là một năm. ' +
    'Trái Đất cũng tự quay quanh mình, tạo ra ngày và đêm.',
  ageRange: '7-8',
  difficulty: 'easy',
  source: 'NASA Space Place',
  sourceUrl: 'https://spaceplace.nasa.gov/our-planet/',
  reviewedBy: 'pending',
  reviewedAt: undefined,
  reviewStatus: 'draft',
  xpReward: 20
}
```

Lưu ý: Mọi fact trong slice này đang ở `reviewStatus: 'draft'` cho tới khi người review phê duyệt. UI vẫn hiển thị nhưng badge "đang xem xét" hiện ở FactCard khi `showReviewedBadge` true (sẽ bật trong phase polish).

## Mission → Fact mapping

Một mission có thể tham chiếu nhiều fact qua `completionExplanation` (inline) + `factId` (engine load).

Ví dụ Earth-Moon mission:
- `factId: 'space.earth_moon.relationship'`
- `completionExplanation`: fact trên.

## Lưu trữ facts

`/src/renderer/src/airscience/engines/contentEngine.ts` — in-memory Map. Phase sau có thể move sang JSON file hoặc remote API.

## Không được làm
- KHÔNG bịa số liệu (ví dụ "Mặt Trăng cách Trái Đất 384.400 km" — phải từ nguồn).
- KHÔNG nhầm đơn vị (km vs dặm, °C vs °F).
- KHÔNG nói "Mặt Trời là ngôi sao lớn nhất" (Sai — UY Scuti lớn hơn nhiều). Đúng: "Mặt Trời là ngôi sao trung bình so với các ngôi sao khác trong vũ trụ."
- KHÔNG nói hành tinh "sống được" — nói "có thể có nước", "có khí quyển", v.v.
