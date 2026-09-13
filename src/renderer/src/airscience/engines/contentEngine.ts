/**
 * AirScience — Content Engine.
 *
 * Loads science facts by id. In-memory for the vertical slice; can be
 * swapped for a remote API later without changing call sites.
 *
 * Every fact must include a `source` and `sourceUrl`. Drafts are kept
 * here but flagged so UI can show a "đang xem xét" badge.
 */

import type { ScienceFact } from '../types.js';

/** Slice: Space World facts (draft, pending review). */
const SPACE_FACTS: ScienceFact[] = [
  {
    id: 'space.sun.basic',
    world: 'space',
    topic: 'star',
    objectId: 'sun',
    titleVi: 'Mặt Trời',
    titleEn: 'Sun',
    shortExplanationVi: 'Mặt Trời là một ngôi sao — trung tâm của Hệ Mặt Trời.',
    extendedExplanationVi:
      'Mặt Trời là một quả cầu khí khổng lồ, nóng tới hàng triệu độ. Mọi hành tinh trong Hệ Mặt Trời đều quay quanh nó.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/sun-1/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.mercury.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'mercury',
    titleVi: 'Sao Thủy',
    titleEn: 'Mercury',
    shortExplanationVi: 'Sao Thủy là hành tinh gần Mặt Trời nhất.',
    extendedExplanationVi:
      'Sao Thủy nhỏ và rất nóng vào ban ngày, rất lạnh vào ban đêm vì không có khí quyển dày để giữ nhiệt.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/mercury/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.venus.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'venus',
    titleVi: 'Sao Kim',
    titleEn: 'Venus',
    shortExplanationVi: 'Sao Kim là hành tinh thứ 2 tính từ Mặt Trời.',
    extendedExplanationVi:
      'Sao Kim nóng nhất trong các hành tinh vì có khí quyển rất dày giữ nhiệt. Sao Kim sáng hơn cả các ngôi sao khi nhìn từ Trái Đất.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/venus/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.earth.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'earth',
    titleVi: 'Trái Đất',
    titleEn: 'Earth',
    shortExplanationVi: 'Trái Đất là hành tinh thứ 3 tính từ Mặt Trời.',
    extendedExplanationVi:
      'Trái Đất quay quanh Mặt Trời mất khoảng 365 ngày — đó chính là một năm. Trái Đất cũng tự quay quanh mình, tạo ra ngày và đêm.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/our-planet/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.moon.basic',
    world: 'space',
    topic: 'satellite',
    objectId: 'moon',
    titleVi: 'Mặt Trăng',
    titleEn: 'Moon',
    shortExplanationVi: 'Mặt Trăng là vệ tinh tự nhiên của Trái Đất.',
    extendedExplanationVi:
      'Mặt Trăng quay quanh Trái Đất mất khoảng 27 ngày. Ánh sáng ta nhìn thấy ban đêm là ánh Mặt Trời chiếu vào Mặt Trăng rồi phản chiếu lại.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/moon/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.mars.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'mars',
    titleVi: 'Sao Hỏa',
    titleEn: 'Mars',
    shortExplanationVi: 'Sao Hỏa là hành tinh thứ 4 tính từ Mặt Trời.',
    extendedExplanationVi:
      'Sao Hỏa có màu đỏ vì có nhiều sắt trên bề mặt. Người ta gọi nó là "hành tinh đỏ".',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/mars/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.jupiter.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'jupiter',
    titleVi: 'Sao Mộc',
    titleEn: 'Jupiter',
    shortExplanationVi: 'Sao Mộc là hành tinh lớn nhất — lớn hơn tất cả hành tinh khác cộng lại.',
    extendedExplanationVi:
      'Sao Mộc là một hành tinh khí khổng lồ, có một vết đỏ lớn — đó là một cơn bão to gấp nhiều lần Trái Đất và đã tồn tại hàng trăm năm.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/jupiter/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.saturn.basic',
    world: 'space',
    topic: 'planet',
    objectId: 'saturn',
    titleVi: 'Sao Thổ',
    titleEn: 'Saturn',
    shortExplanationVi: 'Sao Thổ nổi tiếng vì có vành đai bao quanh.',
    extendedExplanationVi:
      'Vành đai Sao Thổ được tạo thành từ hàng tỷ mảnh đá và băng nhỏ bay quanh hành tinh.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/saturn/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.earth_moon.relationship',
    world: 'space',
    topic: 'system',
    objectId: 'earth',
    titleVi: 'Trái Đất và Mặt Trăng',
    titleEn: 'Earth and Moon',
    shortExplanationVi: 'Mặt Trăng quay quanh Trái Đất, còn Trái Đất quay quanh Mặt Trời.',
    extendedExplanationVi:
      'Trái Đất và Mặt Trăng giống như một cặp bạn nhảy: Mặt Trăng luôn đi vòng quanh Trái Đất. Cả hai cùng đi vòng quanh Mặt Trời.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/moon/',
    reviewStatus: 'draft',
    xpReward: 20
  },
  {
    id: 'space.day_night.basic',
    world: 'space',
    topic: 'phenomenon',
    objectId: 'earth',
    titleVi: 'Ngày và Đêm',
    titleEn: 'Day and Night',
    shortExplanationVi: 'Trái Đất tự quay quanh trục của mình, tạo ra ngày và đêm.',
    extendedExplanationVi:
      'Khi phần em đang đứng quay về phía Mặt Trời, đó là ban ngày. Khi phần đó quay ra phía ngược lại, đó là ban đêm. Một vòng quay mất khoảng 24 giờ.',
    ageRange: '7-8',
    difficulty: 'easy',
    source: 'NASA Space Place',
    sourceUrl: 'https://spaceplace.nasa.gov/days/',
    reviewStatus: 'draft',
    xpReward: 20
  }
];

/** Map keyed by fact id for O(1) lookup. */
const FACT_INDEX: Map<string, ScienceFact> = new Map(
  SPACE_FACTS.map((f) => [f.id, f])
);

/** Look up a fact by id. Returns undefined if not found. */
export function getFact(id: string): ScienceFact | undefined {
  return FACT_INDEX.get(id);
}

/** All facts for a world — used by Explore mode. */
export function getFactsForWorld(world: 'space'): ScienceFact[] {
  return SPACE_FACTS.filter((f) => f.world === world);
}

/** All fact ids. Useful for tests. */
export function listFactIds(): string[] {
  return Array.from(FACT_INDEX.keys());
}
