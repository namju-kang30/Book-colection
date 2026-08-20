-- ====================================================================
-- 진로 맞춤형 차시별 독서 활동 일지 (Reading Log Platform) DB Schema
-- Supabase SQL Editor에 복사하여 붙여넣고 [Run]을 누르세요.
-- ====================================================================

-- 1. 확장 기능 활성화 (UUID 생성)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 진로 계열 테이블 (career_tracks)
CREATE TABLE IF NOT EXISTS career_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#4F46E5',
    icon TEXT DEFAULT 'BookOpen',
    order_num INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 활동 차시 테이블 (sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 독서 일지 공통 양식 테이블 (journal_templates)
CREATE TABLE IF NOT EXISTS journal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT '표준 독서 활동 일지 양식',
    fields JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 학생 독서 일지 테이블 (reading_logs)
CREATE TABLE IF NOT EXISTS reading_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES career_tracks(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    student_info JSONB NOT NULL, -- {"student_id": "20315", "name": "김하은", "password_hash": "..."}
    content JSONB NOT NULL,      -- {"field_book": "코스모스", "field_author": "칼 세이건", ...}
    likes_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Row Level Security (RLS) 활성화 및 전체 공개 정책 설정
ALTER TABLE career_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_logs ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 후 재생성 (중복 에러 방지)
DROP POLICY IF EXISTS "Allow public read career_tracks" ON career_tracks;
DROP POLICY IF EXISTS "Allow public insert career_tracks" ON career_tracks;
DROP POLICY IF EXISTS "Allow public update career_tracks" ON career_tracks;
DROP POLICY IF EXISTS "Allow public delete career_tracks" ON career_tracks;

DROP POLICY IF EXISTS "Allow public read sessions" ON sessions;
DROP POLICY IF EXISTS "Allow public insert sessions" ON sessions;
DROP POLICY IF EXISTS "Allow public update sessions" ON sessions;
DROP POLICY IF EXISTS "Allow public delete sessions" ON sessions;

DROP POLICY IF EXISTS "Allow public read journal_templates" ON journal_templates;
DROP POLICY IF EXISTS "Allow public insert journal_templates" ON journal_templates;
DROP POLICY IF EXISTS "Allow public update journal_templates" ON journal_templates;
DROP POLICY IF EXISTS "Allow public delete journal_templates" ON journal_templates;

DROP POLICY IF EXISTS "Allow public read reading_logs" ON reading_logs;
DROP POLICY IF EXISTS "Allow public insert reading_logs" ON reading_logs;
DROP POLICY IF EXISTS "Allow public update reading_logs" ON reading_logs;
DROP POLICY IF EXISTS "Allow public delete reading_logs" ON reading_logs;

-- 모든 사용자(학생/관리자)에 대한 접근 권한 허용 (Anon Key 기준)
CREATE POLICY "Allow public read career_tracks" ON career_tracks FOR SELECT USING (true);
CREATE POLICY "Allow public insert career_tracks" ON career_tracks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update career_tracks" ON career_tracks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete career_tracks" ON career_tracks FOR DELETE USING (true);

CREATE POLICY "Allow public read sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sessions" ON sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete sessions" ON sessions FOR DELETE USING (true);

CREATE POLICY "Allow public read journal_templates" ON journal_templates FOR SELECT USING (true);
CREATE POLICY "Allow public insert journal_templates" ON journal_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update journal_templates" ON journal_templates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete journal_templates" ON journal_templates FOR DELETE USING (true);

CREATE POLICY "Allow public read reading_logs" ON reading_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert reading_logs" ON reading_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update reading_logs" ON reading_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete reading_logs" ON reading_logs FOR DELETE USING (true);

-- 7. 실시간(Realtime) 복제 활성화
BEGIN;
  -- supabase_realtime publication에 테이블 추가 (이미 추가된 경우 무시)
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'career_tracks') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE career_tracks;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sessions') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'journal_templates') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE journal_templates;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reading_logs') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE reading_logs;
    END IF;
  END $$;
COMMIT;

-- 8. 초기 기본 데이터 삽입 (고정 UUID 적용으로 프론트엔드와 100% 일치)
INSERT INTO career_tracks (id, name, color, icon, order_num)
VALUES 
    ('11111111-0001-4000-8000-000000000001', '자연과학', '#059669', 'Atom', 1),
    ('11111111-0002-4000-8000-000000000002', '공학·IT', '#2563EB', 'Cpu', 2),
    ('11111111-0003-4000-8000-000000000003', '인문·사회', '#D97706', 'BookOpen', 3),
    ('11111111-0004-4000-8000-000000000004', '의약·보건', '#E11D48', 'Activity', 4),
    ('11111111-0005-4000-8000-000000000005', '교육·사범', '#7C3AED', 'GraduationCap', 5),
    ('11111111-0006-4000-8000-000000000006', '경영·경제', '#0891B2', 'TrendingUp', 6),
    ('11111111-0007-4000-8000-000000000007', '예술·체육', '#DB2777', 'Palette', 7),
    ('11111111-0008-4000-8000-000000000008', '융합·자율', '#4F46E5', 'Compass', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sessions (id, title, date, is_active)
VALUES 
    ('22222222-0001-4000-8000-000000000001', '1차시 : 진로 탐색 및 핵심 도서 선정', '2026-03-10', TRUE),
    ('22222222-0002-4000-8000-000000000002', '2차시 : 심화 쟁점 분석 및 비판적 읽기', '2026-03-24', TRUE),
    ('22222222-0003-4000-8000-000000000003', '3차시 : 진로 융합 탐구 및 인사이트 나눔', '2026-04-07', TRUE),
    ('22222222-0004-4000-8000-000000000004', '4차시 : 독서 연계 주제 탐구 포트폴리오', '2026-04-21', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO journal_templates (id, title, fields, is_active)
VALUES (
    '33333333-0001-4000-8000-000000000001',
    '표준 독서 활동 일지 양식',
    '[
        {"id": "field_book", "label": "도서명", "type": "text", "required": true, "placeholder": "예: 부분과 전체, 사피엔스, 멋진 신세계 등"},
        {"id": "field_author", "label": "저자 / 역자 / 출판사", "type": "text", "required": true, "placeholder": "예: 베르너 하이젠베르크 / 지식산업사"},
        {"id": "field_pages", "label": "읽은 범위 / 쪽수", "type": "text", "required": false, "placeholder": "예: 120p ~ 245p 또는 전체 완독"},
        {"id": "field_quote", "label": "가장 인상 깊었던 구절 및 선정한 이유", "type": "textarea", "required": true, "placeholder": "마음에 와닿거나 새로운 시각을 준 핵심 문장을 인용하고, 그 이유를 적어주세요."},
        {"id": "field_career", "label": "나의 진로와의 연계점 및 느낀 점 (실천 계획)", "type": "textarea", "required": true, "placeholder": "이 책을 읽고 희망 진로 분야에서 어떤 영감을 얻었는지, 앞으로의 심화 탐구 또는 실천 계획을 서술해 주세요."},
        {"id": "field_keywords", "label": "핵심 키워드 (쉼표로 구분)", "type": "text", "required": false, "placeholder": "예: 양자역학, 불확정성원리, 과학철학"},
        {"id": "field_rating", "label": "이 책에 대한 나의 추천 별점", "type": "rating", "required": false, "placeholder": "5점 만점"}
    ]'::jsonb,
    TRUE
)
ON CONFLICT (id) DO NOTHING;
