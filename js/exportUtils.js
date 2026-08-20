/**
 * 일지 데이터 CSV / Excel 내보내기 유틸리티
 */

export function exportLogsToCSV(logs, tracks, sessions, template, filterInfo = null) {
  if (!logs || logs.length === 0) {
    alert('내보낼 독서일지 데이터가 없습니다.');
    return;
  }

  const trackMap = new Map(tracks.map(t => [t.id, t.name]));
  const sessionMap = new Map(sessions.map(s => [s.id, s.title]));

  // 헤더 생성
  const headers = [
    '등록일시',
    '학번',
    '이름',
    '진로계열',
    '활동차시'
  ];

  const templateFields = template?.fields || [];
  templateFields.forEach(f => {
    headers.push(f.label);
  });
  headers.push('공감수');

  // 행 데이터 생성
  const rows = logs.map(log => {
    const trackName = trackMap.get(log.track_id) || '기타';
    const sessionName = sessionMap.get(log.session_id) || '미지정';
    const sInfo = log.student_info || {};
    const content = log.content || {};

    const formattedDate = new Date(log.created_at).toLocaleString('ko-KR');

    const row = [
      formattedDate,
      sInfo.student_id || '',
      sInfo.name || '',
      trackName,
      sessionName
    ];

    templateFields.forEach(f => {
      const val = content[f.id] ?? '';
      row.push(String(val).replace(/"/g, '""'));
    });

    row.push(log.likes_count || 0);

    return row.map(cell => `"${cell}"`).join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().slice(0, 10);
  
  let namePrefix = '독서활동일지';
  if (filterInfo?.trackName && filterInfo.trackName !== '전체') {
    namePrefix += `_${filterInfo.trackName}`;
  }
  if (filterInfo?.sessionTitle && filterInfo.sessionTitle !== '전체') {
    namePrefix += `_${filterInfo.sessionTitle.replace(/[^a-zA-Z0-9가-힣]/g, '')}`;
  }
  if (!filterInfo || (filterInfo.trackName === '전체' && filterInfo.sessionTitle === '전체')) {
    namePrefix += '_전체';
  }

  link.setAttribute('download', `${namePrefix}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportLogsToExcel(logs, tracks, sessions, template, filterInfo = null) {
  if (!window.XLSX) {
    exportLogsToCSV(logs, tracks, sessions, template, filterInfo);
    return;
  }

  if (!logs || logs.length === 0) {
    alert('내보낼 독서일지 데이터가 없습니다.');
    return;
  }

  const trackMap = new Map(tracks.map(t => [t.id, t.name]));
  const sessionMap = new Map(sessions.map(s => [s.id, s.title]));
  const templateFields = template?.fields || [];

  const data = logs.map((log, index) => {
    const trackName = trackMap.get(log.track_id) || '기타';
    const sessionName = sessionMap.get(log.session_id) || '미지정';
    const sInfo = log.student_info || {};
    const content = log.content || {};

    const rowObj = {
      '연번': index + 1,
      '등록일시': new Date(log.created_at).toLocaleString('ko-KR'),
      '학번': sInfo.student_id || '',
      '이름': sInfo.name || '',
      '진로계열': trackName,
      '활동차시': sessionName
    };

    templateFields.forEach(f => {
      rowObj[f.label] = content[f.id] ?? '';
    });

    rowObj['공감수'] = log.likes_count || 0;

    return rowObj;
  });

  const worksheet = window.XLSX.utils.json_to_sheet(data);
  
  // 열 너비 자동 조정
  const colWidths = [
    { wch: 6 },  // 연번
    { wch: 20 }, // 등록일시
    { wch: 10 }, // 학번
    { wch: 12 }, // 이름
    { wch: 14 }, // 진로계열
    { wch: 25 }, // 활동차시
  ];
  templateFields.forEach(f => {
    if (f.type === 'textarea') {
      colWidths.push({ wch: 45 });
    } else {
      colWidths.push({ wch: 20 });
    }
  });
  colWidths.push({ wch: 8 }); // 공감수
  worksheet['!cols'] = colWidths;

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, '독서활동일지');

  const dateStr = new Date().toISOString().slice(0, 10);
  let namePrefix = '독서활동일지';
  if (filterInfo?.trackName && filterInfo.trackName !== '전체') {
    namePrefix += `_${filterInfo.trackName}`;
  }
  if (filterInfo?.sessionTitle && filterInfo.sessionTitle !== '전체') {
    namePrefix += `_${filterInfo.sessionTitle.replace(/[^a-zA-Z0-9가-힣]/g, '')}`;
  }
  if (!filterInfo || (filterInfo.trackName === '전체' && filterInfo.sessionTitle === '전체')) {
    namePrefix += '_전체';
  }

  window.XLSX.writeFile(workbook, `${namePrefix}_${dateStr}.xlsx`);
}
