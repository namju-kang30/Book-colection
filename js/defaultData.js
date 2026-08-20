/**
 * 초기 기본 데이터셋 (진로 계열, 차시, 양식 템플릿, 예시 독서일지)
 * PostgreSQL UUID 형식 및 LocalStorage 호환성을 보장하는 고유 ID 적용
 */

export const DEFAULT_TRACKS = [
  {
    id: '11111111-0001-4000-8000-000000000001',
    name: '자연과학',
    color: '#059669', // Emerald
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    icon: 'Atom',
    description: '물리, 화학, 생명과학, 지구환경 및 기초 순수과학 분야',
    order_num: 1
  },
  {
    id: '11111111-0002-4000-8000-000000000002',
    name: '공학·IT',
    color: '#2563EB', // Blue
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    icon: 'Cpu',
    description: '컴퓨터, 인공지능, 기계, 전자전기, 신소재 등 공학기술',
    order_num: 2
  },
  {
    id: '11111111-0003-4000-8000-000000000003',
    name: '인문·사회',
    color: '#D97706', // Amber
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    icon: 'BookOpen',
    description: '문학, 철학, 역사, 언어, 사회학, 법학 및 공공정책 분야',
    order_num: 3
  },
  {
    id: '11111111-0004-4000-8000-000000000004',
    name: '의약·보건',
    color: '#E11D48', // Rose
    bgColor: '#FFF1F2',
    borderColor: '#FECDD3',
    icon: 'Activity',
    description: '의학, 치의학, 한의학, 약학, 간호 및 바이오헬스케어',
    order_num: 4
  },
  {
    id: '11111111-0005-4000-8000-000000000005',
    name: '교육·사범',
    color: '#7C3AED', // Violet
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    icon: 'GraduationCap',
    description: '초·중·고등 교과교육, 유아교육, 특수교육 및 교육공학',
    order_num: 5
  },
  {
    id: '11111111-0006-4000-8000-000000000006',
    name: '경영·경제',
    color: '#0891B2', // Cyan
    bgColor: '#ECFEFF',
    borderColor: '#A5F3FC',
    icon: 'TrendingUp',
    description: '경영학, 금융경제, 마케팅, 벤처창업 및 빅데이터 분석',
    order_num: 6
  },
  {
    id: '11111111-0007-4000-8000-000000000007',
    name: '예술·체육',
    color: '#DB2777', // Pink
    bgColor: '#FDF2F8',
    borderColor: '#FBCFE8',
    icon: 'Palette',
    description: '시각디자인, 음악, 영상콘텐츠, 스포츠과학 및 운동처방',
    order_num: 7
  },
  {
    id: '11111111-0008-4000-8000-000000000008',
    name: '융합·자율',
    color: '#4F46E5', // Indigo
    bgColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    icon: 'Compass',
    description: '학제 간 융합연구 및 자기주도적 진로 탐색 분야',
    order_num: 8
  }
];

export const DEFAULT_SESSIONS = [
  {
    id: '22222222-0001-4000-8000-000000000001',
    title: '1차시 : 진로 탐색 및 핵심 도서 선정',
    date: '2026-03-10',
    is_active: true,
    created_at: new Date('2026-03-01').toISOString()
  },
  {
    id: '22222222-0002-4000-8000-000000000002',
    title: '2차시 : 심화 쟁점 분석 및 비판적 읽기',
    date: '2026-03-24',
    is_active: true,
    created_at: new Date('2026-03-15').toISOString()
  },
  {
    id: '22222222-0003-4000-8000-000000000003',
    title: '3차시 : 진로 융합 탐구 및 인사이트 나눔',
    date: '2026-04-07',
    is_active: true,
    created_at: new Date('2026-04-01').toISOString()
  },
  {
    id: '22222222-0004-4000-8000-000000000004',
    title: '4차시 : 독서 연계 주제 탐구 포트폴리오',
    date: '2026-04-21',
    is_active: false,
    created_at: new Date('2026-04-10').toISOString()
  }
];

export const DEFAULT_TEMPLATE = {
  id: '33333333-0001-4000-8000-000000000001',
  title: '표준 독서 활동 일지 양식',
  is_active: true,
  fields: [
    {
      id: 'field_book',
      label: '도서명',
      type: 'text',
      required: true,
      placeholder: '예: 부분과 전체, 사피엔스, 멋진 신세계 등'
    },
    {
      id: 'field_author',
      label: '저자 / 역자 / 출판사',
      type: 'text',
      required: true,
      placeholder: '예: 베르너 하이젠베르크 / 지식산업사'
    },
    {
      id: 'field_pages',
      label: '읽은 범위 / 쪽수',
      type: 'text',
      required: false,
      placeholder: '예: 120p ~ 245p 또는 전체 완독'
    },
    {
      id: 'field_quote',
      label: '가장 인상 깊었던 구절 및 선정한 이유',
      type: 'textarea',
      required: true,
      placeholder: '마음에 와닿거나 새로운 시각을 준 핵심 문장을 인용하고, 그 이유를 적어주세요.'
    },
    {
      id: 'field_career',
      label: '나의 진로와의 연계점 및 느낀 점 (실천 계획)',
      type: 'textarea',
      required: true,
      placeholder: '이 책을 읽고 희망 진로 분야에서 어떤 영감을 얻었는지, 앞으로의 심화 탐구 또는 실천 계획을 서술해 주세요.'
    },
    {
      id: 'field_keywords',
      label: '핵심 키워드 (쉼표로 구분)',
      type: 'text',
      required: false,
      placeholder: '예: 양자역학, 불확정성원리, 과학철학'
    },
    {
      id: 'field_rating',
      label: '이 책에 대한 나의 추천 별점',
      type: 'rating',
      required: false,
      placeholder: '5점 만점'
    }
  ],
  created_at: new Date().toISOString()
};

export const INITIAL_READING_LOGS = [
  {
    id: '44444444-0001-4000-8000-000000000001',
    track_id: '11111111-0002-4000-8000-000000000002',
    session_id: '22222222-0002-4000-8000-000000000002',
    student_info: {
      student_id: '20412',
      name: '이도윤',
      password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    },
    content: {
      field_book: '클린 코드 (Clean Code)',
      field_author: '로버트 C. 마틴 / 인사이트',
      field_pages: '1장 ~ 6장 (120p)',
      field_quote: '깨끗한 코드는 읽기 쉽고 고치기 쉽다. 잘 쓴 문장처럼 술술 읽힌다.',
      field_career: '인공지능 소프트웨어 엔지니어를 꿈꾸며 파이썬으로 알고리즘 문제를 풀 때 기능 구현에만 급급했던 제 코딩 습관을 반성하게 되었습니다. 변수명 하나에도 의도를 담는 것이 협업의 기본임을 깨달았습니다. 다음 학기 자율동아리 프로젝트에서는 네이밍 규칙과 단위 테스트를 직접 적용해 볼 계획입니다.',
      field_keywords: '소프트웨어공학, 가독성, 리팩토링, 협업',
      field_rating: 5
    },
    likes_count: 7,
    created_at: '2026-03-24T10:15:00.000Z'
  },
  {
    id: '44444444-0002-4000-8000-000000000002',
    track_id: '11111111-0004-4000-8000-000000000004',
    session_id: '22222222-0002-4000-8000-000000000002',
    student_info: {
      student_id: '20105',
      name: '박서연',
      password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    },
    content: {
      field_book: '숨결이 바람 될 때 (When Breath Becomes Air)',
      field_author: '폴 칼라니티 / 흐름출판',
      field_pages: '완독 (280p)',
      field_quote: '의사의 의무는 죽음을 물리치거나 다시 건강하게 만드는 것이 아니라, 삶이 무너져 내린 환자와 가족을 품에 안고 그들이 다시 일어서서 자신에게 의미 있는 삶을 살도록 돕는 것이다.',
      field_career: '신경외과 전문의 또는 생명윤리 전문가를 지망하며, 의학 기술의 고도화만큼이나 환자의 인간적 고통에 깊이 공감하는 태도가 중요함을 배웠습니다. 향후 의료 데이터 분석 연구를 진행할 때도 기술 지향을 넘어 인간 중심 가치를 잃지 않겠습니다.',
      field_keywords: '의료윤리, 신경외과, 공감의학, 생명존중',
      field_rating: 5
    },
    likes_count: 12,
    created_at: '2026-03-24T14:30:00.000Z'
  },
  {
    id: '44444444-0003-4000-8000-000000000003',
    track_id: '11111111-0001-4000-8000-000000000001',
    session_id: '22222222-0001-4000-8000-000000000001',
    student_info: {
      student_id: '20218',
      name: '최민준',
      password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    },
    content: {
      field_book: '코스모스 (Cosmos)',
      field_author: '칼 세이건 / 사이언스북스',
      field_pages: '1장 ~ 4장',
      field_quote: '우리는 코스모스의 일부다. 이것은 결코 시적 수사가 아니다. 우리의 세포 하나하나는 별의 잔해로 만들어졌다.',
      field_career: '천체물리학 연구원을 지망하며, 우주를 연구하는 것이 단순한 과학적 호기심을 넘어 인류의 기원과 존재의 의미를 묻는 철학적 작업임을 실감했습니다. 학교 지구과학 수업 시간에 배운 스펙트럼 분석 원리와 연계하여 별의 탄생 과정을 심화 발표할 것입니다.',
      field_keywords: '천문학, 우주론, 별의진화, 칼세이건',
      field_rating: 5
    },
    likes_count: 9,
    created_at: '2026-03-10T11:20:00.000Z'
  },
  {
    id: '44444444-0004-4000-8000-000000000004',
    track_id: '11111111-0003-4000-8000-000000000003',
    session_id: '22222222-0001-4000-8000-000000000001',
    student_info: {
      student_id: '20301',
      name: '정지우',
      password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    },
    content: {
      field_book: '정의란 무엇인가',
      field_author: '마이클 샌델 / 와이즈베리',
      field_pages: '1장 ~ 5장',
      field_quote: '정의로운 사회는 단순히 공리를 극대화하거나 선택의 자유를 확보하는 것만으로는 만들 수 없다. 좋은 삶의 의미를 함께 고민하고, 불가피하게 생기는 이견을 기꺼이 받아들이는 문화를 가꾸어야 한다.',
      field_career: '사회학 및 공공정책 분야에 관심을 두고 있는 학생으로서, 복지 정책과 자원 분배에서 공리주의적 관점과 의무론적 관점의 충돌을 깊이 있게 비교 분석할 수 있었습니다. 특히 최근 논의되는 기본소득 정책을 정의론의 관점에서 비판적으로 검토하는 소논문을 작성해 볼 생각입니다.',
      field_keywords: '정의론, 공리주의, 공동체주의, 정책학',
      field_rating: 4
    },
    likes_count: 5,
    created_at: '2026-03-10T16:45:00.000Z'
  },
  {
    id: '44444444-0005-4000-8000-000000000005',
    track_id: '11111111-0005-4000-8000-000000000005',
    session_id: '22222222-0003-4000-8000-000000000003',
    student_info: {
      student_id: '20509',
      name: '한예린',
      password_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    },
    content: {
      field_book: '에밀 (Emile)',
      field_author: '장 자크 루소 / 돋을새김',
      field_pages: '1권 ~ 2권',
      field_quote: '아이를 불행하게 만드는 가장 확실한 방법은 언제나 모든 것을 다 갖게 해주는 것이다.',
      field_career: '국어 교육 및 청소년 상담 교사를 꿈꾸며 루소의 자연주의 교육관을 접했습니다. 주입식 교육을 지양하고 학생 각자의 발달 단계와 자율성을 존중하는 수업 설계를 구상해 보았습니다. 방과후 멘토링 활동에서 학생들이 스스로 질문을 생성하도록 유도하는 소크라테스식 대화법을 실천하겠습니다.',
      field_keywords: '교육철학, 자연주의, 자기주도학습, 멘토링',
      field_rating: 4
    },
    likes_count: 8,
    created_at: '2026-04-07T09:10:00.000Z'
  }
];
