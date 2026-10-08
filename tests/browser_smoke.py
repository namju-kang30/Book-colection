"""실제 DB를 변경하지 않는 브라우저 회귀 검증. 필요: pip install playwright, Chromium."""
import hashlib
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://reading-log.test'
fixtures = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_TRACKS,DEFAULT_SESSIONS,DEFAULT_TEMPLATE,INITIAL_READING_LOGS} from './js/defaultData.js'; console.log(JSON.stringify({career_tracks:DEFAULT_TRACKS,sessions:DEFAULT_SESSIONS,journal_templates:[DEFAULT_TEMPLATE],reading_logs:INITIAL_READING_LOGS}));"], cwd=ROOT))
MOCK = r'''
window.__db = __FIXTURES__;
window.__fail = false;
window.__lostResponse = false;
window.__delay = 0;
window.__channels = [];
window.supabase = {createClient: () => ({
  from: table => new Query(table),
  channel: () => { const callbacks = {}; return {
    on: function(kind, filter, cb) { callbacks[filter.event] = cb; return this; },
    subscribe: function() { window.__channels.push(callbacks); return this; },
    unsubscribe: () => {}
  }; }
})};
class Query {
  constructor(table) { this.table=table; this.op='select'; this.filters=[]; this.max=Infinity; }
  select() {return this;} order() {return this;} limit(n) {this.max=n;return this;}
  eq(key,val) {this.filters.push(r=>r[key]===val);return this;}
  neq(key,val) {this.filters.push(r=>r[key]!==val);return this;}
  gt(key,val) {this.filters.push(r=>r[key]>val);return this;}
  insert(records) {this.op='insert';this.records=records;return this;}
  upsert(records,options={}) {this.op='upsert';this.records=records;this.options=options;return this;}
  update(updates) {this.op='update';this.updates=updates;return this;}
  delete() {this.op='delete';return this;}
  single() {this.one=true;return this;} maybeSingle() {this.one=true;this.optional=true;return this;}
  then(resolve,reject) {return new Promise(r=>setTimeout(r, window.__delay)).then(()=>this.execute()).then(resolve,reject);}
  execute() {
    if(window.__fail) return {data:null,error:{message:'테스트 서버 연결 실패'}};
    const all=window.__db[this.table]; let result=[]; const matches=r=>this.filters.every(f=>f(r));
    if(this.op==='select') result=all.filter(matches).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,this.max);
    if(this.op==='upsert'||this.op==='insert') for(const row of this.records) {
      const existing=all.find(r=>r.id===row.id);
      if(existing&&this.options.ignoreDuplicates) continue;
      if(existing) Object.assign(existing,structuredClone(row)); else all.push(structuredClone(row));
      result.push(structuredClone(row));
    }
    if(this.op==='update') result=all.filter(matches).map(r=>Object.assign(r,this.updates));
    if(this.op==='delete') window.__db[this.table]=all.filter(r=>!matches(r));
    if(window.__lostResponse&&this.op==='upsert'&&this.table==='reading_logs') {window.__lostResponse=false;return {data:null,error:{message:'저장 후 응답 연결 끊김'}};}
    return {data:this.one?(result[0]||null):structuredClone(result),error:null};
  }
}
'''.replace('__FIXTURES__', json.dumps(fixtures, ensure_ascii=False))

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_app(self, cloud=False, mobile=False, storage_blocked=False):
        context = self.browser.new_context(viewport={'width': 390 if mobile else 1280, 'height': 844 if mobile else 900}, accept_downloads=True)
        self.addCleanup(context.close)
        script = "localStorage.setItem('reading_log_supabase_config', JSON.stringify({url:'',anonKey:''}));" if not cloud else ''
        script += "localStorage.setItem('admin_password_hash', '%s');" % hashlib.sha256(b'test-admin-password').hexdigest()
        if storage_blocked:
            script += "Storage.prototype.getItem = () => {throw Error('blocked')}; Storage.prototype.setItem = () => {throw Error('blocked')};"
        context.add_init_script(script)
        def route_handler(route):
            url = route.request.url
            if url.startswith(ORIGIN):
                path = ROOT / url.removeprefix(ORIGIN).split('?')[0].lstrip('/')
                if path == ROOT: path = ROOT / 'index.html'
                if path.is_file():
                    route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/javascript')
                else: route.fulfill(status=404, body='not found')
            elif 'supabase-js' in url:
                route.fulfill(body=MOCK, content_type='text/javascript')
            elif 'tailwindcss' in url:
                route.fulfill(body="window.tailwind={};const style=document.createElement('style');style.textContent='.hidden{display:none!important}';document.head.appendChild(style);", content_type='text/javascript')
            else:
                route.fulfill(body='', content_type='text/javascript')  # 외부 라이브러리 없음도 검증
        context.route('**/*', route_handler)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())
        page.goto(ORIGIN, wait_until='networkidle')
        expect(page.locator('#btn-open-form-modal')).to_be_visible()
        return page, errors

    def fill_log(self, page, title='브라우저 제출 검증'):
        page.locator('#btn-open-form-modal').click()
        page.locator('#form-student-id').fill('20999')
        page.locator('#form-student-name').fill('테스트 학생')
        page.locator('#form-student-pin').fill('2468')
        for field in ['field_book', 'field_author', 'field_quote', 'field_career']:
            page.locator(f'[name="{field}"]').fill(title if field == 'field_book' else '독서 기록 테스트 내용')

    def login_admin(self, page):
        page.locator('#btn-admin-toggle').click()
        page.locator('#admin-password-input').fill('test-admin-password')
        page.locator('#admin-login-form button[type="submit"]').click()
        expect(page.locator('[data-admin-tab="backup"]')).to_be_visible()

    def test_local_student_submit_pin_edit_delete_mobile(self):
        page, errors = self.open_app(mobile=True)
        self.fill_log(page)
        self.assertEqual(page.locator('#form-session-id option').count(), 3)
        page.locator('#btn-submit-log').click()
        expect(page.locator('#log-form-modal')).to_be_hidden()
        expect(page.locator('#stat-total-count')).to_have_text('6편')
        saved = page.evaluate("JSON.parse(localStorage.getItem('reading_log_entries'))[0]")
        self.assertEqual(saved['student_info']['password_hash'], hashlib.sha256(b'2468').hexdigest())
        card = page.locator(f'[data-log-card-id="{saved["id"]}"]')
        card.click()
        page.locator('#btn-edit-detail').click()
        page.locator('#auth-pin-input').fill('0000')
        page.locator('#auth-pin-form button[type="submit"]').click()
        expect(page.locator('#auth-pin-modal')).to_be_visible()
        page.locator('#auth-pin-input').fill('2468')
        page.locator('#auth-pin-form button[type="submit"]').click()
        expect(page.locator('#reading-log-form')).to_be_visible()
        page.locator('[name="field_book"]').fill('수정한 독서일지')
        page.locator('#btn-submit-log').click()
        expect(page.locator('#log-form-modal')).to_be_hidden()
        self.assertEqual(page.evaluate("JSON.parse(localStorage.getItem('reading_log_entries'))[0].content.field_book"), '수정한 독서일지')
        card.click()
        page.locator('#btn-delete-detail').click()
        page.locator('#auth-pin-input').fill('2468')
        page.locator('#auth-pin-form button[type="submit"]').click()
        expect(page.locator('#stat-total-count')).to_have_text('5편')
        self.assertEqual(errors, [])

    def test_json_backup_preview_import_invalid_and_duplicate(self):
        page, errors = self.open_app()
        self.login_admin(page)
        page.locator('[data-admin-tab="backup"]').click()
        with page.expect_download() as info:
            page.locator('#btn-export-json').click()
        downloaded = info.value
        backup = json.loads(Path(downloaded.path()).read_text())
        self.assertEqual(len(backup['data']['reading_logs']), 5)
        page.locator('#backup-json-file').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{bad'})
        expect(page.locator('#backup-file-status')).to_contain_text('JSON')
        expect(page.locator('#btn-import-json')).to_be_disabled()
        new_log = json.loads(json.dumps(backup['data']['reading_logs'][0]))
        new_log['id'] = '44444444-9999-4000-8000-000000000099'
        new_log['student_info']['name'] = '백업 복원 학생'
        backup['data']['reading_logs'].append(new_log)
        payload = {'name': 'backup.json', 'mimeType': 'application/json', 'buffer': json.dumps(backup, ensure_ascii=False).encode()}
        page.locator('#backup-json-file').set_input_files(payload)
        expect(page.locator('#backup-file-status')).to_contain_text('검증 완료')
        page.locator('#btn-import-json').click()
        expect(page.locator('#stat-total-count')).to_have_text('6편')
        page.locator('#backup-json-file').set_input_files(payload)
        expect(page.locator('#btn-import-json')).to_be_enabled()
        page.locator('#btn-import-json').click()
        expect(page.locator('#toast-container')).to_contain_text('0건 추가')
        self.assertEqual(errors, [])

    def test_cloud_failure_retry_lost_response_quota_and_realtime_filter(self):
        page, errors = self.open_app(cloud=True)
        self.fill_log(page)
        page.evaluate('window.__fail=true')
        page.locator('#btn-submit-log').click()
        expect(page.locator('#toast-container')).to_contain_text('테스트 서버 연결 실패')
        expect(page.locator('#btn-submit-log')).to_be_enabled()
        expect(page.locator('[name="field_book"]')).to_have_value('브라우저 제출 검증')
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 5)
        page.evaluate('window.__fail=false;window.__lostResponse=true;')
        page.locator('#btn-submit-log').click()
        expect(page.locator('#toast-container')).to_contain_text('저장 후 응답 연결 끊김')
        expect(page.locator('#btn-submit-log')).to_be_enabled()
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 6)
        page.evaluate("const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='reading_log_entries'||key.startsWith('cached_student'))throw Error('quota');return original.call(this,key,value)};window.__delay=100;")
        page.locator('#reading-log-form').evaluate("form=>{form.requestSubmit();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}")
        expect(page.locator('#log-form-modal')).to_be_hidden()
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 6)
        expect(page.locator('#stat-total-count')).to_have_text('6편')
        track = fixtures['career_tracks'][1]['id']
        page.locator(f'.track-btn[data-track-id="{track}"]').click()
        page.evaluate("window.__channels[0].UPDATE({new:window.__db.reading_logs[0]})")
        page.wait_for_timeout(500)
        page.locator('.track-btn[data-track-id="all"]').click()
        expect(page.locator('[data-log-card-id]')).to_have_count(6)
        self.assertEqual(errors, [])

    def test_multiple_rating_fields_draft_survives_other_modal_and_hash_failure(self):
        page, errors = self.open_app()
        page.evaluate("const template=JSON.parse(localStorage.getItem('reading_log_template'));template.fields.push({id:'rating_second',label:'두 번째 별점',type:'rating',required:true,placeholder:''});localStorage.setItem('reading_log_template',JSON.stringify(template));")
        page.reload(wait_until='networkidle')
        self.fill_log(page)
        groups = page.locator('[data-rating-group]')
        groups.nth(0).locator('[data-star-val="2"]').click()
        groups.nth(1).locator('[data-star-val="4"]').click()
        self.assertEqual(page.locator('[name="field_rating"]').input_value(), '2')
        self.assertEqual(page.locator('[name="rating_second"]').input_value(), '4')
        page.locator('#btn-admin-toggle').click()
        expect(page.locator('[name="field_book"]')).to_have_value('브라우저 제출 검증')
        page.locator('#btn-close-admin-login').click()
        page.evaluate("() => {crypto.subtle.digest=async()=>{throw Error('crypto unavailable')};}")
        page.locator('#btn-submit-log').click()
        expect(page.locator('#toast-container')).to_contain_text('비밀번호 처리에 실패')
        expect(page.locator('#btn-submit-log')).to_be_enabled()
        self.assertEqual(len(page.evaluate("JSON.parse(localStorage.getItem('reading_log_entries'))")), 5)
        self.assertEqual(errors, [])

    def test_admin_move_and_session_updates_and_cloud_delete_failure(self):
        page, errors = self.open_app(cloud=True)
        self.login_admin(page)
        log_id = fixtures['reading_logs'][0]['id']
        page.locator(f'[data-admin-move-log="{log_id}"]').click()
        page.locator('#move-target-track-id').select_option(fixtures['career_tracks'][0]['id'])
        page.locator('#btn-submit-move').click()
        expect(page.locator('#admin-move-modal')).to_be_hidden()
        self.assertEqual(page.evaluate("window.__db.reading_logs[0].track_id"), fixtures['career_tracks'][0]['id'])
        page.locator('[data-admin-tab="sessions"]').click()
        session_id = fixtures['sessions'][0]['id']
        page.locator(f'[data-edit-session="{session_id}"]').click()
        page.locator(f'#edit-session-title-{session_id}').fill('수정된 활동 차시')
        page.locator(f'[data-save-session="{session_id}"]').click()
        expect(page.locator('#toast-container')).to_contain_text('차시 정보가 성공적으로 수정')
        self.assertEqual(page.evaluate('window.__db.sessions[0].title'), '수정된 활동 차시')
        page.locator('[data-admin-tab="logs"]').click()
        page.evaluate('window.__fail=true')
        page.locator(f'[data-admin-delete-log="{log_id}"]').click()
        expect(page.locator('#toast-container')).to_contain_text('테스트 서버 연결 실패')
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 5)
        self.assertEqual(errors, [])

    def test_session_closed_during_writing_keeps_draft_and_rejects_submit(self):
        page, errors = self.open_app(cloud=True)
        self.fill_log(page)
        page.evaluate('window.__db.sessions[0].is_active=false')
        page.locator('#btn-submit-log').click()
        expect(page.locator('#toast-container')).to_contain_text('마감')
        expect(page.locator('#btn-submit-log')).to_be_enabled()
        expect(page.locator('[name="field_book"]')).to_have_value('브라우저 제출 검증')
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 5)
        self.assertEqual(errors, [])

    def test_storage_blocked_can_still_submit_to_cloud(self):
        page, errors = self.open_app(cloud=True, storage_blocked=True)
        self.fill_log(page)
        page.locator('#btn-submit-log').click()
        expect(page.locator('#log-form-modal')).to_be_hidden()
        self.assertEqual(page.evaluate('window.__db.reading_logs.length'), 6)
        self.assertEqual(errors, [])

if __name__ == '__main__':
    unittest.main(verbosity=2)
