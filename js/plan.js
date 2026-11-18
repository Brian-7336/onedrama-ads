// 12월 집행 계획 (원드라마_12월_미디어믹스.xlsx 기준). 계획이 바뀌면 이 파일만 고친다.
window.PLAN = {
  title: '원드라마 12월 광고 집행',
  start: '2026-12-01',
  end: '2026-12-31',
  budget: 9000000, // VAT 별도
  campaign: 'dec_1201',
  site: 'https://drama.onestore.co.kr',
  // 자주 여는 곳
  tools: [
    { id: 'ga4', name: 'GA4', url: 'https://analytics.google.com/analytics/web/', note: '첫 재생, 3화 시청, 결제' },
    { name: '원드라마', url: 'https://drama.onestore.co.kr', note: '랜딩 확인' },
    { name: '인스타그램 @onestoredrama', url: 'https://www.instagram.com/onestoredrama/', note: '원드라마 계정' },
    { name: '스레드 @onestoredrama', url: 'https://www.threads.net/@onestoredrama', note: '원드라마 계정' },
    { name: 'X @ONEstoreDrama', url: 'https://x.com/ONEstoreDrama', note: '원드라마 계정' },
  ],
  team: [
    { role: '총괄', name: '권오성' },
    { role: '매체 운영', name: '브라이언' },
    { role: '소재', name: '마스' },
    { role: 'GA4', name: '윤현정' },
  ],
  phases: [
    { id: 'test', name: '시험', start: '2026-12-01', end: '2026-12-09', share: 0.1 },
    { id: 'main', name: '메인', start: '2026-12-10', end: '2026-12-20', share: 0.5 },
    { id: 'xmas', name: '크리스마스', start: '2026-12-21', end: '2026-12-25', share: 0.3 },
    { id: 'wrap', name: '마무리', start: '2026-12-26', end: '2026-12-31', share: 0.1 },
  ],
  media: [
    {
      ad: { name: '메타 광고 관리자', url: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns' },
      id: 'meta', name: '메타', product: '릴스, 스토리', goal: '첫 재생(웹 전환)',
      target: '25~44세 여성, 드라마·웹툰 관심사', billing: '노출(CPM)', budget: 4000000,
      daily: { test: 44000, main: 182000, xmas: 240000, wrap: 67000 },
      source: 'meta', medium: 'paid_social', search: false,
      placements: ['reels', 'story', 'feed'],
      creatives: ['v15a', 'v15b', 'v60a', 'im01', 'im02'],
      accounts: ['인스타그램 @onestoredrama', '페이스북 원드라마', '스레드 @onestoredrama'],
    },
    {
      ad: { name: '구글 애즈', url: 'https://ads.google.com/aw/campaigns' },
      id: 'youtube', name: '유튜브', product: '쇼츠, 인스트림(건너뛰기 가능), 범퍼', goal: '첫 재생, 조회',
      target: '25~44세 여성', billing: '조회·노출', budget: 2500000,
      daily: { test: 28000, main: 114000, xmas: 150000, wrap: 42000 },
      source: 'youtube', medium: 'paid_social', search: false,
      placements: ['shorts', 'instream', 'bumper'],
      creatives: ['v06', 'v15a', 'v15b', 'v30a', 'v60a'],
      accounts: ['유튜브 원드라마'],
    },
    {
      ad: { name: '네이버 검색광고', url: 'https://searchad.naver.com/' },
      id: 'naver', name: '네이버 검색', product: '파워링크', goal: '유입',
      target: '작품명, 「숏드라마」「원드라마」 키워드', billing: '클릭(CPC)', budget: 800000,
      daily: { test: 9000, main: 36000, xmas: 48000, wrap: 13000 },
      source: 'naver', medium: 'paid_search', search: true,
      placements: ['powerlink'],
      creatives: ['brand', 'title', 'genre'],
    },
    {
      ad: { name: '구글 애즈', url: 'https://ads.google.com/aw/campaigns' },
      id: 'gsearch', name: '구글 검색', product: '검색 광고', goal: '유입',
      target: '작품명, 숏드라마 장르 키워드', billing: '클릭(CPC)', budget: 700000,
      daily: { test: 8000, main: 32000, xmas: 42000, wrap: 12000 },
      source: 'google', medium: 'paid_search', search: true,
      placements: ['search'],
      creatives: ['title', 'genre'],
    },
    {
      ad: { name: '구글 애즈', url: 'https://ads.google.com/aw/campaigns' },
      id: 'gdn', name: '구글 디스플레이', product: '리마케팅 배너', goal: '다시 부르기',
      target: '사이트 왔다가 안 본 사람, 중간에 그만둔 사람', billing: '클릭·노출', budget: 1000000,
      daily: { test: 11000, main: 45000, xmas: 60000, wrap: 17000 },
      source: 'google', medium: 'display', search: false,
      placements: ['remarketing'],
      creatives: ['bn01'],
    },
  ],
  // 작품 1편당 소재 8종
  creativeTypes: [
    { id: 'v06', name: '6초 범퍼', spec: '16:9', use: '유튜브 범퍼' },
    { id: 'v15a', name: '15초 세로 영상 A', spec: '9:16', use: '메타 릴스·스토리, 유튜브 쇼츠' },
    { id: 'v15b', name: '15초 세로 영상 B', spec: '9:16', use: '메타 릴스·스토리, 유튜브 쇼츠' },
    { id: 'v30a', name: '30초 가로 영상', spec: '16:9', use: '유튜브 인스트림' },
    { id: 'v60a', name: '60초 트레일러', spec: '9:16', use: '메타, 유튜브(시험용)' },
    { id: 'im01', name: '스틸컷 카드', spec: '1:1, 4:5', use: '메타 피드' },
    { id: 'im02', name: '명대사 카드', spec: '9:16', use: '메타 스토리' },
    { id: 'bn01', name: '리마케팅 배너', spec: '1200×1200, 1200×628', use: '구글 디스플레이' },
  ],
  keywordGroups: [
    { id: 'brand', name: '브랜드 (원드라마, 숏드라마)' },
    { id: 'title', name: '작품명' },
    { id: 'genre', name: '장르' },
  ],
  creativeStatuses: ['요청 전', '제작 중', '검수 중', '집행 중', '꺼짐'],
  qcItems: [
    '첫 3초에 가장 센 장면',
    '소리 없이 자막으로 읽힘',
    '끝 카드에 「원드라마」 로고',
    '세이프존 지킴 (릴스·스토리 상단 약 400px, 하단 약 550px)',
    'AI로 만든 티가 나는 장면 없음',
    '과장 문구 없음',
  ],
  forecast: { impressions: 720000, starts: 21600, costPerStart: 417 },
  killRule: { zeroDays: 3, costMultiple: 2 },

  checklist: [
    {
      id: 'prep', name: '집행 전 준비', period: '11/17 ~ 11/30', groups: [
        {
          name: '작품·소재', items: [
            { id: 'p01', text: '광고할 작품 3~5편 확정 (청불 제외)', owner: '권오성' },
            { id: 'p02', text: '작품마다 CP 홍보 허락 범위 확인 (스튜디오지니는 무료 회차 사용 가능 확인, 나머지 CP 미확인)', owner: '권오성' },
            { id: 'p20', text: 'CP 추천작 중 공개 보류 2편(미친 BL소설에서 살아남기, 수영부 또라이에게 찍혀버렸다)의 12월 공개 여부 확인', owner: '권오성', link: '#/works' },
            { id: 'p21', text: '스튜디오지니 가로형 포스터 추가분 아스페라에서 받기', owner: '마스' },
            { id: 'p03', text: '작품코드(w01~) 배정', owner: '브라이언', link: '#/works' },
            { id: 'p04', text: '작품마다 소재 8종 받기 (NAS 원본은 복사해서 작업)', owner: '마스', link: '#/creatives' },
            { id: 'p05', text: '소재 검수: 첫 3초, 자막, 끝 카드 로고, 세이프존, 배너 두 크기', owner: '브라이언', link: '#/creatives' },
          ],
        },
        {
          name: '측정·링크', items: [
            { id: 'p06', text: '위키 「유입 링크 태그 규칙」(651924478) 표에 paid_search, display 줄 추가', owner: '브라이언' },
            { id: 'p07', text: 'GA4 담당 윤현정 님께 공유', owner: '브라이언' },
            { id: 'p08', text: '유튜브 medium을 paid_social로 둘지 정하기', owner: '브라이언', link: '#/links' },
            { id: 'p09', text: '작품별 utm 링크 만들기', owner: '브라이언', link: '#/links' },
            { id: 'p10', text: '시험 클릭으로 GA4 이벤트 확인: video_start, 3화 시청, purchase', owner: '윤현정' },
            { id: 'p11', text: '랜딩이 앱 설치 없이 재생·결제되는지 확인 (사파리, 크롬, 인스타그램·페이스북 인앱)', owner: '브라이언' },
          ],
        },
        {
          name: '공식 SNS 연계 (사업TF)', items: [
            { id: 'p22', text: '사업TF 회신 확인: 원스토어 공식 SNS 계정 목록, 성과 분석 가능 여부 (강원구, 오아람)', owner: '권오성' },
            { id: 'p23', text: '공식 계정 공유 게시물에 붙일 utm 값 정하기 (유료 광고와 섞이지 않게, 위키 규칙 확인)', owner: '브라이언', link: '#/links' },
            { id: 'p24', text: '사업TF에 공유 요청할 게시물과 날짜 전달 (신작 예고편, 카드)', owner: '브라이언' },
            { id: 'p25', text: '12월 광고와 묶어 볼 아이디어를 채팅방에 남기기', owner: '브라이언' },
          ],
        },
        {
          name: '매체 세팅', items: [
            { id: 'p12', text: '메타: 릴스·스토리, 25~44세 여성, 드라마·웹툰 관심사. 노출 위치 수동 선택', owner: '브라이언' },
            { id: 'p13', text: '메타: 피드(im01 스틸컷)와 페이스북·스레드 지면을 켤지 정하기', owner: '브라이언' },
            { id: 'p14', text: '유튜브: 쇼츠, 범퍼, 인스트림. 과금 방식이 달라 캠페인 분리', owner: '브라이언' },
            { id: 'p15', text: '네이버 파워링크: 브랜드 / 작품명 / 장르로 광고그룹 분리, 소재 미리 등록', owner: '브라이언' },
            { id: 'p16', text: '구글 검색: 작품명, 숏드라마 장르 키워드', owner: '브라이언' },
            { id: 'p17', text: '구글 디스플레이: 리마케팅 목록 2개 미리 만들기 (방문 후 미재생 / 재생 후 중단)', owner: '브라이언' },
            { id: 'p26', text: '매체별 대량 등록 템플릿 내려받아 「광고 등록」 화면의 열 맞추기', owner: '브라이언', link: '#/register' },
            { id: 'p27', text: '광고 문구·키워드·영상 ID 채우고 등록 파일 올리기 (1~2개로 먼저 시험)', owner: '브라이언', link: '#/register' },
            { id: 'p18', text: '시험 기간 하루 예산 넣기 (합계 100,000원)', owner: '브라이언', link: '#/budget' },
            { id: 'p19', text: '매체별 결제 수단·세금계산서 확인', owner: '브라이언' },
          ],
        },
      ],
    },
    {
      id: 'test', name: '시험 기간', period: '12/1 ~ 12/9', groups: [
        {
          name: '운영', items: [
            { id: 't01', text: '매일 전날 성과 입력, 저성과 소재 끄기', owner: '브라이언', link: '#/report' },
            { id: 't02', text: '끄는 기준 확정 (잠정: 3일간 첫 재생 0 / 첫 재생당 비용이 평균의 2배 초과)', owner: '권오성' },
            { id: 't03', text: '목표치 다시 잡기 (현재 첫 재생당 417원은 대행사 제안서 가정)', owner: '권오성' },
            { id: 't04', text: '메인 기간 예산 재배분안 만들기', owner: '브라이언', link: '#/budget' },
          ],
        },
      ],
    },
    {
      id: 'main', name: '메인 ~ 마무리', period: '12/10 ~ 12/31', groups: [
        {
          name: '하루 예산 변경', items: [
            { id: 'm01', text: '12/10 메인 기간 값으로 변경 (하루 합계 409,000원)', owner: '브라이언', link: '#/budget' },
            { id: 'm02', text: '12/21 크리스마스 기간 값으로 변경 (540,000원)', owner: '브라이언', link: '#/budget' },
            { id: 'm03', text: '12/26 마무리 기간 값으로 변경 (151,000원)', owner: '브라이언', link: '#/budget' },
          ],
        },
        {
          name: '주간 운영', items: [
            { id: 'm04', text: '1주차(12/7) 주간 리포트, 소재 2종 교체', owner: '브라이언' },
            { id: 'm05', text: '2주차(12/14) 주간 리포트, 소재 2종 교체', owner: '브라이언' },
            { id: 'm06', text: '3주차(12/21) 주간 리포트, 소재 2종 교체', owner: '브라이언' },
            { id: 'm07', text: '4주차(12/28) 주간 리포트, 소재 2종 교체', owner: '브라이언' },
            { id: 'm08', text: '1월 초 결산 리포트 (집행액, 첫 재생, 3화 시청, 결제)', owner: '브라이언', link: '#/report' },
          ],
        },
      ],
    },
  ],

  rules: [
    ['측정', 'GA4(숏드라마 웹)로 utm별 첫 재생(video_start), 3화 시청, 결제(purchase)를 본다.'],
    ['랜딩', '작품 상세 페이지(drama.onestore.co.kr). 앱 설치 없이 웹에서 바로 보고 결제한다.'],
    ['소재', '작품 3~5편, 작품당 8종. 첫 3초에 가장 센 장면, 소리 없이 읽히는 자막, 끝 카드 「원드라마」 로고. 청불 작품은 뺀다.'],
    ['매일', '전날 매체·소재별 노출, 클릭, 첫 재생, 비용 정리 → 하위 소재 끄기, 잘 되는 세트에 예산 올리기.'],
    ['매주', '하위 소재 2종 빼고 새 2종 넣기. 주간 리포트.'],
    ['끄는 기준', '3일 동안 첫 재생 없음, 또는 첫 재생당 비용이 평균의 2배 넘음 (시험 뒤 확정). 검색 광고에는 2배 기준을 그대로 쓰지 않는다.'],
    ['매체 평가', '첫 재생당 비용만 보지 말고 결제당 비용까지 본다. 검색 결제 중 상당수는 SNS 광고를 먼저 본 사람일 수 있다.'],
  ],

  // CP가 추천한 작품과 반응 좋았던 소재 (스튜디오지니 이혜희 님 회신, 2026-11-17)
  recommended: {
    '3+4!': 'ID 영상 2종. 케이팝 팬 유입으로 틱톡 댓글·좋아요 반응이 좋았음',
    '악녀는 모래시계를 되돌린다': '예고편(0화). 신작, 주연 인지도 높음',
    '전직 특수부대 요원, 괴물 순경이 되다': '예고편(0화). 신작, 주연 인지도 높음',
    '미친 BL소설에서 살아남기': '비하인드·챌린지 영상 17종. 비하인드는 구간별로 잘라 쓰기 좋고, 챌린지는 인스타 반응이 좋았음',
    '수영부 또라이에게 찍혀버렸다': '비하인드 영상. 구간별로 쓰기 좋음',
  },

  cpNotes: [
    ['스튜디오지니', '예고편 같은 마케팅 소재는 아스페라로 받은 것이 전부. 작품마다 무료 회차는 홍보에 써도 된다. 가로형 포스터 추가분을 아스페라로 더 받는다. (이혜희 님 회신, 11/17)'],
    ['그 밖의 CP', '홍보 허락 범위 미확인. 광고에 쓰기 전에 확인한다.'],
  ],

  sns: {
    accounts: [
      ['인스타그램', '@onestoredrama'],
      ['X', '@ONEstoreDrama'],
      ['페이스북', '원드라마'],
      ['스레드', '@onestoredrama'],
      ['유튜브', '원드라마'],
    ],
    support: [
      ['부탁한 것', '원스토어 이름으로 운영 중인 SNS 계정 목록, 원드라마 계정의 신작 예고편·카드를 공식 계정에서 리트윗·공유, 같이 해 볼 아이디어'],
      ['사업TF 답', '강원구 님과 오아람 님을 통해 최대한 빨리 지원. 성과 분석이 되는지도 점검해 따로 알려 주기로 함 (바트, 11/18)'],
      ['관련 메일', '「[원드라마] 원스토어 공식 SNS 계정 확인과 공유 요청」'],
      ['유의', '공유 게시물 링크에는 유료 광고와 다른 utm 값을 붙여 성과가 섞이지 않게 한다.'],
    ],
  },

  mediaNotes: [
    ['메타', '노출 위치는 수동으로 고른다. 자동이면 피드·오디언스 네트워크로 퍼진다. GA4에서 페이스북과 인스타그램을 나눠 보려면 utm에 {{site_source_name}}을 쓴다.'],
    ['유튜브', '건너뛰기 가능한 인스트림은 CPV(30초 이상 시청 또는 상호작용 시 과금), 범퍼는 타깃 CPM. 캠페인·광고 그룹을 나눈다. 쇼츠 집중은 디맨드젠도 선택지.'],
    ['네이버', '캠페인 → 광고그룹 → 키워드+소재(제목 15자, 설명 45자). 소재 검수 시간이 걸리니 미리 등록한다.'],
    ['구글 디스플레이', '디맨드젠으로 옮겨 가는 중. 1월 이후에도 운영한다면 디맨드젠을 검토한다.'],
  ],

  openQuestions: [
    '위키 651924478 페이지의 실제 위치',
    '메타에서 피드, 페이스북, 스레드 지면을 켤지',
    '유튜브 medium을 paid_social로 둘지, paid_video로 나눌지',
    '하루 예산 반올림으로 생긴 5,000원 초과분을 맞출지',
    'CP 추천작 중 공개 보류 2편이 12월 안에 공개되는지',
    '공식 계정 공유 게시물에 붙일 utm 값',
    '스튜디오지니 외 CP의 홍보 허락 범위',
  ],

  glossary: [
    ['소재', '광고에 쓰는 영상·이미지 결과물'],
    ['노출', '광고가 화면에 보인 횟수'],
    ['첫 재생', '영상을 처음 재생한 횟수. GA4 이벤트 video_start'],
    ['첫 재생당 비용', '쓴 돈 ÷ 첫 재생 수'],
    ['결제당 비용', '쓴 돈 ÷ 결제 수'],
    ['CPM', '노출 1,000회당 비용'],
    ['CPC', '클릭 1회당 비용'],
    ['CPV', '조회 1회당 비용'],
    ['CTR', '클릭 ÷ 노출'],
    ['utm', '링크 끝에 붙이는 꼬리표. 어느 광고로 들어왔는지 GA4가 알 수 있게 해 준다'],
    ['GA4', '구글 애널리틱스 4. 사이트 방문과 행동을 재는 분석 도구'],
    ['랜딩', '광고를 누르면 처음 도착하는 페이지'],
    ['리마케팅', '이미 다녀간 사람에게 다시 광고를 보여 주는 방식'],
    ['범퍼', '유튜브의 건너뛸 수 없는 6초 이하 광고'],
    ['인스트림', '영상 시작 전이나 중간에 나오는 유튜브 광고'],
    ['파워링크', '네이버 검색 결과 위쪽에 뜨는 텍스트 광고'],
    ['광고 세트', '타깃·예산·소재를 묶은 운영 단위'],
    ['끝 카드', '영상 맨 마지막 화면'],
    ['세이프존', '앱 버튼이나 글자에 가리지 않는 화면 영역'],
    ['CP', '콘텐츠 공급사'],
    ['청불', '청소년 관람불가'],
  ],
};
