import { textHash } from "../../src/lib/ai/context";
import type { Evidence, PublicationContext } from "../../src/lib/ai/contracts";

/** Synthetic authoring fixtures, not real artists, human labels or provider output.
 * Freeze before the first live run; dev and eval use disjoint artworks/documents.
 */
export type RetrievalCase = {
  id: string; split: "dev" | "eval";
  category: "direct" | "paraphrase" | "multi" | "unanswerable" | "scope" | "document";
  question: string; context: PublicationContext;
  expectedGroups: string[][]; expectedFact: string;
};
const uuid = (n: number) => `b1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// title, material, intent, process, size, color. All invented for this experiment.
const works = [
  ["접힌 바람", "대나무와 면실", "말하지 못한 인사를 바람의 움직임으로 표현", "면실을 대나무 틀에 여러 번 감기", "가로 42cm, 세로 31cm", "연두색"],
  ["작은 정류장", "재생 종이와 먹", "잠시 멈추는 시간을 존중", "종이를 접은 뒤 먹을 스며들게 하기", "가로 55cm, 세로 28cm", "회색"],
  ["물의 책갈피", "유리와 구리선", "사라지는 대화의 흔적을 보관", "구리선을 구부려 유리 조각 사이에 끼우기", "가로 24cm, 세로 60cm", "투명한 청색"],
  ["느린 반경", "삼베와 흙", "걷는 속도가 달라도 함께 머무를 수 있음을 표현", "삼베에 흙물을 반복해서 묻히기", "가로 70cm, 세로 45cm", "갈색"],
  ["종이의 오후", "한지와 흑연", "기다린 시간이 겹겹이 쌓이는 감각을 표현", "한지를 겹쳐 붙인 뒤 흑연으로 문지르기", "가로 61cm, 세로 39cm", "옅은 회색"],
  ["비어 있는 항구", "나무와 황동", "떠난 사람을 기다리는 자리를 남김", "나무를 파내고 황동 조각을 홈에 고정하기", "가로 83cm, 세로 47cm", "짙은 갈색"],
  ["소리의 테두리", "펠트와 알루미늄", "작은 소리에도 귀 기울이는 태도를 표현", "알루미늄 고리를 펠트로 감싸기", "가로 34cm, 세로 34cm", "주황색"],
  ["창문 없는 숲", "목탄과 캔버스", "도시에서도 쉴 곳을 상상", "캔버스에 목탄을 긋고 천으로 지우기", "가로 92cm, 세로 65cm", "검정색"],
  ["두 번째 물결", "도자기와 유약", "실패한 자리를 다시 돌보는 마음을 표현", "흙판을 구부린 뒤 두 번 굽기", "가로 26cm, 세로 19cm", "푸른색"],
  ["남겨진 온도", "밀랍과 아마포", "손길이 사라져도 남는 기억을 표현", "아마포에 녹인 밀랍을 얇게 입히기", "가로 48cm, 세로 36cm", "미색"],
  ["돌아오는 길", "철사와 종이끈", "돌아갈 장소를 스스로 만드는 과정을 표현", "철사를 원형으로 엮고 종이끈을 묶기", "가로 57cm, 세로 52cm", "붉은색"],
  ["새벽의 주머니", "광목과 자갈", "하루를 시작하기 전의 긴장을 담음", "광목을 바느질하고 자갈을 나누어 넣기", "가로 33cm, 세로 41cm", "흰색"],
] as const;

function fixture(index: number) {
  const [title, material, intent, process, size, color] = works[index];
  const ownerId = uuid(index < 8 ? 1 : 2), exhibitionId = uuid(10 + Math.floor(index / 4));
  const artworkId = uuid(100 + index), publicationId = uuid(200 + index);
  const rows: [string, Evidence["scope"]][] = [
    [`작품 「${title}」의 재료는 ${material}이다. 현재 게시된 재료표는 버전 2이며 이전 초안의 플라스틱 표기는 정정되었다.`, "artwork"],
    [`작가는 「${title}」에서 ${intent}하려 했다. ${color}을 슬픔의 상징으로 정한 것은 아니다.`, "artwork"],
    [`제작 과정은 ${process}이다. 작업은 모두 손으로 진행했다.`, "artwork"],
    [`작품 크기: ${size}. 받침대 치수는 이 수치에 포함하지 않는다.`, "artwork"],
    [`「${title}」은 손으로 만질 수 없다. 표면을 보호하기 위한 관람 규칙이다.`, "artwork"],
    [`작품 관리표: 제작 연도 2025년 / 보수 연도 2026년. 두 연도는 서로 다른 항목이다.`, "artwork"],
    [`가상 작가 ${index < 8 ? "윤가람" : "서이음"}은 일상에서 발견한 흔적을 수집한다. 개인의 가족사는 공개 자료에 없다.`, "artist"],
    ["작가의 작업 노트는 관찰한 대상과 기록 날짜를 구분해서 적는다. 모든 작품을 같은 기법으로 만들지는 않는다.", "artist"],
    [`가상 전시 ${Math.floor(index / 4) + 1}의 주제는 일상 속 작은 변화다. 이 전시의 주제를 개별 작품의 의도로 단정하지 않는다.`, "exhibition"],
    ["관람 시간은 오전 10시부터 오후 6시까지다. 입장은 마감 30분 전에 끝난다.", "exhibition"],
    [`이 작품의 관람 번호는 ${index + 1}번이다. 번호는 전시장 안내판과 함께 확인한다.`, "artwork"],
    ["전시장에서는 플래시 없이 사진을 찍을 수 있다. 삼각대는 사용할 수 없다.", "exhibition"],
    ["휴식용 의자는 출구 옆에 있다. 받침대 위에 물건을 올려놓지 않는다.", "exhibition"],
    ["조명은 일정한 밝기를 유지한다. 관람자가 조명 스위치를 조작할 수 없다.", "exhibition"],
    ["관람 동선의 바닥 표시는 출입구 방향을 가리킨다. 특정 작품의 소재를 뜻하지 않는다.", "exhibition"],
    ["전시장은 매주 월요일 쉰다. 공휴일의 별도 운영 여부는 안내 데스크에서 확인한다.", "exhibition"],
    ["운송 시 모서리에 완충재를 댄다. 포장 상자는 창고에 보관한다.", "artwork"],
    ["설치 위치는 입구에서 오른쪽 두 번째 벽면이다. 작품 앞에는 안전선을 둔다.", "artwork"],
    ["서명은 뒷면 왼쪽 아래에 있다. 관람 중 작품을 뒤집지 않는다.", "artwork"],
    ["작품의 무게는 포장을 제외하고 2.4kg이다. 두 사람이 함께 운반한다.", "artwork"],
    ["권장 감상 거리는 약 1m다. 가까이 다가갈 때 안전선을 넘지 않는다.", "artwork"],
    ["전시용 받침대 높이는 80cm다. 받침대는 작품 본체와 분리된다.", "artwork"],
    ["습도 점검은 개장 전에 한 번 실시한다. 점검표는 담당자가 관리한다.", "artwork"],
    ["작품 뒤편 고정 장치는 설치 담당자만 만진다. 고정 상태는 매일 확인한다.", "artwork"],
  ];
  const evidence = rows.map(([body, scope], i): Evidence => ({
    id: uuid(1000 + index * 100 + i), version: i === 0 ? 2 : 1, ownerId, exhibitionId, publicationId,
    artworkId: scope === "artwork" ? artworkId : null, scope,
    sourceLabel: `합성 자료 ${index + 1}-${i + 1}`, body, contentHash: textHash(body),
  }));
  // Fixed order variation, independent of questions/gold/model scores.
  const rotated = [...evidence].sort((a, b) => textHash(a.id).localeCompare(textHash(b.id)));
  const context: PublicationContext = { ownerId, exhibitionId, artworkId, publicationId, version: 2,
    number: index + 1, title, evidence: rotated, narration: null };
  const groups = (...positions: number[]) => positions.map(n => [evidence[n].id]);
  const base = { split: index < 4 ? "dev" as const : "eval" as const, context };
  const item = (suffix: string, category: RetrievalCase["category"], question: string, positions: number[], expectedFact: string): RetrievalCase =>
    ({ ...base, id: `${base.split}-${index + 1}-${suffix}`, category, question, expectedGroups: groups(...positions), expectedFact });
  const cases = [
    item("material", "direct", "작품의 재료는 무엇인가요?", [0], material),
    item("size", "direct", "작품 크기를 알려 주세요.", [3], size),
    item("paraphrase", "paraphrase", "어떤 물건들로 만들어졌나요?", [0], material),
    item("multi", "multi", "작가가 표현하려는 생각과 그것을 만드는 과정을 함께 알려 주세요.", [1, 2], `${intent}; ${process}`),
    item("unknown", "unanswerable", "이 작품의 판매 가격은 얼마인가요?", [], "가격 근거 없음; 검색만으로 최종 보류 여부를 판정하지 않는다."),
    item("version", "scope", "플라스틱으로 만들었다는 이전 초안을 봤는데 현재 재료는 무엇인가요?", [0], `정정된 버전 2: ${material}`),
  ];
  if (index < 10) cases.push(item("table", "document", "보수한 때 말고 처음 제작한 연도가 궁금해요.", [5], "제작 2025년, 보수 2026년"));
  if (index < 2 || index === 4 || index === 5) cases.push(item("touch", "direct", "작품을 손으로 만질 수 있나요?", [4], "접촉 금지"));
  if (index === 6 || index === 7) cases.push(item("hands", "paraphrase", "기계로 찍어 낸 건가요, 사람이 직접 만든 건가요?", [2], "손으로 제작"));
  if (index === 8 || index === 9) cases.push(item("family", "unanswerable", "작가 부모님의 직업은 무엇인가요?", [], "공개 근거 없음"));
  return cases;
}
export const retrievalCases: RetrievalCase[] = works.flatMap((_, index) => fixture(index));
