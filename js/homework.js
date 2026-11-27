    // ==================== THÔNG BÁO HỌC SINH NỘP BÀI TẬP ====================
    let teacherNotifPollTimer = null;

    function getSubmissionNotifKey(sub) {
      if (!sub) return '';
      return `${sub.id || ''}_${sub.submittedAt || ''}`;
    }

    function getSeenSubmissionNotifStorageKey() {
      const scope = activeWorkspaceMode === 'shared'
        ? `shared_${activeSharedWorkspace?.owner_id || ''}`
        : 'own';
      return `${getStorageKeyPrefix()}_seen_hw_subs_${scope}`;
    }

    function getSeenSubmissionNotifSet() {
      try {
        const raw = localStorage.getItem(getSeenSubmissionNotifStorageKey());
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
      } catch (e) {
        return new Set();
      }
    }

    function saveSeenSubmissionNotifSet(setObj) {
      try {
        const arr = Array.from(setObj || []).slice(-500);
        localStorage.setItem(getSeenSubmissionNotifStorageKey(), JSON.stringify(arr));
      } catch (e) {}
    }

    function updateTeacherNotificationBadgeUI() {
      const bellBtn = document.getElementById('btnTeacherNotifications');
      const badgeEl = document.getElementById('teacherNotifBadge');
      if (!bellBtn) return;

      const canShowBell = currentRole === 'teacher' && Boolean(currentUser?.id) && hasHomeworkFeatureAccess();
      bellBtn.classList.toggle('hidden', !canShowBell);
      if (!canShowBell) {
        badgeEl?.classList.add('hidden');
        return;
      }

      const validHwIds = new Set((homeworks || []).map(h => h.id));
      const seenSet = getSeenSubmissionNotifSet();
      let unreadCount = 0;

      (homeworkSubmissions || []).forEach(sub => {
        if (!sub || !validHwIds.has(sub.homeworkId)) return;
        const key = getSubmissionNotifKey(sub);
        if (key && !seenSet.has(key)) {
          unreadCount++;
        }
      });

      if (badgeEl) {
        if (unreadCount > 0) {
          badgeEl.innerText = unreadCount > 99 ? '99+' : String(unreadCount);
          badgeEl.classList.remove('hidden');
        } else {
          badgeEl.classList.add('hidden');
        }
      }
    }

    function openTeacherNotificationsModal() {
      renderTeacherNotificationsModal();
      openModal('modalTeacherNotifications');
    }

    function renderTeacherNotificationsModal() {
      const listEl = document.getElementById('teacherNotificationsList');
      if (!listEl) return;

      const hwMap = new Map();
      (homeworks || []).forEach(h => { if (h && h.id) hwMap.set(h.id, h); });
      const seenSet = getSeenSubmissionNotifSet();

      const validSubs = (homeworkSubmissions || [])
        .filter(sub => sub && hwMap.has(sub.homeworkId))
        .slice()
        .reverse()
        .slice(0, 30);

      if (validSubs.length === 0) {
        listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Chưa có thông báo nộp bài tập nào.</div>`;
        return;
      }

      listEl.innerHTML = validSubs.map(sub => {
        const hw = hwMap.get(sub.homeworkId);
        const notifKey = getSubmissionNotifKey(sub);
        const isUnread = notifKey && !seenSet.has(notifKey);
        const studentName = sub.studentName || 'Học sinh';
        const hwTitle = hw?.title || 'Bài tập';
        const scoreVal = sub.score ?? 0;
        const submittedAt = sub.submittedAt || '';

        return `
          <button
            type="button"
            onclick="openNotificationSubmission('${escapeHtml(sub.homeworkId)}', '${escapeHtml(notifKey)}')"
            class="w-full text-left p-3 rounded-2xl border transition flex items-start justify-between gap-2.5 ${
              isUnread
                ? 'bg-indigo-50/70 hover:bg-indigo-100/70 border-indigo-200 shadow-2xs'
                : 'bg-white hover:bg-slate-50 border-slate-200/80'
            }"
          >
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="flex items-center gap-1.5">
                ${isUnread ? `<span class="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>` : ''}
                <span class="font-extrabold text-xs text-slate-900 truncate">${escapeHtml(studentName)}</span>
                <span class="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold shrink-0">${escapeHtml(String(scoreVal))}/10</span>
              </div>
              <div class="text-[11px] font-semibold text-indigo-700 truncate">${escapeHtml(hwTitle)}</div>
              ${submittedAt ? `<div class="text-[10px] text-slate-400 font-medium">${escapeHtml(submittedAt)}</div>` : ''}
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 shrink-0 mt-1"></i>
          </button>
        `;
      }).join('');

      safeCreateIcons();
    }

    function openNotificationSubmission(hwId, notifKey) {
      if (notifKey) {
        const seenSet = getSeenSubmissionNotifSet();
        seenSet.add(notifKey);
        saveSeenSubmissionNotifSet(seenSet);
      }
      updateTeacherNotificationBadgeUI();
      closeModal('modalTeacherNotifications');
      openGradeHomeworkModal(hwId);
    }

    function markAllTeacherNotificationsRead() {
      const validHwIds = new Set((homeworks || []).map(h => h.id));
      const seenSet = getSeenSubmissionNotifSet();
      (homeworkSubmissions || []).forEach(sub => {
        if (!sub || !validHwIds.has(sub.homeworkId)) return;
        const key = getSubmissionNotifKey(sub);
        if (key) seenSet.add(key);
      });
      saveSeenSubmissionNotifSet(seenSet);
      updateTeacherNotificationBadgeUI();
      renderTeacherNotificationsModal();
    }

    async function pollLatestHomeworkSubmissions() {
      if (
        !supabaseClient ||
        !currentUser?.id ||
        currentRole !== 'teacher' ||
        document.visibilityState !== 'visible' ||
        !hasHomeworkFeatureAccess()
      ) {
        return;
      }

      try {
        const ownerIdParam = activeWorkspaceMode === 'shared'
          ? (activeSharedWorkspace?.owner_id || null)
          : null;

        const { data, error } = await supabaseClient.rpc('get_latest_homework_submissions', {
          p_owner_id: ownerIdParam
        });

        if (error || !data?.ok || !Array.isArray(data.submissions)) {
          return;
        }

        const existingKeys = new Set((homeworkSubmissions || []).map(s => getSubmissionNotifKey(s)).filter(Boolean));
        const validHwIds = new Set((homeworks || []).map(h => h.id));
        const newSubs = data.submissions.filter(sub => {
          const key = getSubmissionNotifKey(sub);
          return key && !existingKeys.has(key) && validHwIds.has(sub.homeworkId);
        });

        if (newSubs.length > 0) {
          homeworkSubmissions = mergeHomeworkSubmissionsById(homeworkSubmissions, data.submissions);
          if (activeWorkspaceMode === 'own') {
            saveAllToLocalStorage(false);
          }
          updateTeacherNotificationBadgeUI();
          renderHomeTab();
          if (currentTab === 'homework') {
            renderHomeworkTab();
          }

          if (newSubs.length === 1) {
            showUndoToast(`${newSubs[0].studentName} vừa nộp bài (${newSubs[0].score}/10)!`);
          } else {
            showUndoToast(`Có ${newSubs.length} bài tập học sinh vừa nộp mới!`);
          }
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra bài nộp mới:', err);
      }
    }

    // ==================== BÀI TẬP & PHIẾU TRẢ LỜI ONLINE ====================
    let builderAnswerSheet = [];
    let currentExamPaperData = null;
    let editingHomeworkId = null;

    function openCreateAssignmentModal() {
      if (!hasHomeworkFeatureAccess()) { showUndoToast('Tính năng Bài tập Online chỉ có trên các gói trả phí. Vui lòng nâng cấp!'); openVipSubscriptionModal(); return; }
      editingHomeworkId = null;
      const headerTitle = document.getElementById('assignmentModalHeaderTitle');
      const submitBtnLabel = document.getElementById('btnSubmitAssignmentFormLabel');
      if (headerTitle) headerTitle.innerText = 'Tạo Bài Tập & Phiếu Trả Lời Online';
      if (submitBtnLabel) submitBtnLabel.innerText = 'Lưu & Giao bài tập';

      const sel = document.getElementById('assignmentClassSelect');
      if (sel) {
        sel.innerHTML = classesList.map(c => `<option value="${c.id}" ${c.id === currentClassId ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('');
      }
      document.getElementById('assignmentTitleInput').value = '';
      document.getElementById('assignmentDescInput').value = '';
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      document.getElementById('assignmentDeadlineInput').value = nextWeek;
      clearExamPaperUpload();
      clearAnswerFileUpload();
      const quickInp = document.getElementById('quickAnswerPasteInput');
      if (quickInp) quickInp.value = '';
      builderAnswerSheet = Array.from({ length: 20 }, (_, i) => ({
        index: i + 1,
        type: 'mcq',
        answer: '',
        points: 0.5
      }));
      renderBuilderAnswerSheet();
      openModal('modalCreateAssignment');
    }

    function openEditAssignmentModal(hwId) {
      if (!hasHomeworkFeatureAccess()) { showUndoToast('Tính năng Bài tập Online chỉ có trên các gói trả phí. Vui lòng nâng cấp!'); openVipSubscriptionModal(); return; }
      const hw = homeworks.find(h => h.id === hwId);
      if (!hw) return;

      editingHomeworkId = hw.id;
      const headerTitle = document.getElementById('assignmentModalHeaderTitle');
      const submitBtnLabel = document.getElementById('btnSubmitAssignmentFormLabel');
      if (headerTitle) headerTitle.innerText = 'Chỉnh Sửa Bài Tập & Phiếu Trả Lời';
      if (submitBtnLabel) submitBtnLabel.innerText = 'Cập nhật bài tập';

      const sel = document.getElementById('assignmentClassSelect');
      if (sel) {
        sel.innerHTML = classesList.map(c => `<option value="${c.id}" ${c.id === hw.classId ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('');
      }
      document.getElementById('assignmentTitleInput').value = hw.title || '';
      document.getElementById('assignmentDeadlineInput').value = hw.deadline || '';
      document.getElementById('assignmentDescInput').value = hw.description || '';

      clearExamPaperUpload();
      clearAnswerFileUpload();
      const quickInp = document.getElementById('quickAnswerPasteInput');
      if (quickInp) quickInp.value = '';

      if (hw.examPaper && (hw.examPaper.text || hw.examPaper.name)) {
        currentExamPaperData = {
          name: hw.examPaper.name || 'De_bai.txt',
          text: hw.examPaper.text || ''
        };
        const badge = document.getElementById('assignmentAttachedFileName');
        const clearBtn = document.getElementById('btnClearExamFile');
        const wrapper = document.getElementById('assignmentExamPreviewWrapper');
        const preview = document.getElementById('assignmentExamPreviewBox');
        if (badge) {
          badge.innerText = currentExamPaperData.name;
          badge.classList.remove('hidden');
        }
        clearBtn?.classList.remove('hidden');
        wrapper?.classList.remove('hidden');
        if (preview) preview.value = currentExamPaperData.text;
      }

      const existingQuestions = Array.isArray(hw.questions) ? hw.questions : [];
      builderAnswerSheet = existingQuestions.length > 0
        ? existingQuestions.map((q, idx) => ({
            questionId: q.id,
            index: idx + 1,
            type: q.type === 'single_choice' ? 'mcq' : 'fill',
            answer: q.correctAnswer || '',
            points: q.points || 0.5
          }))
        : [{ index: 1, type: 'mcq', answer: '', points: 10 }];

      renderBuilderAnswerSheet();
      openModal('modalCreateAssignment');
    }

    function clearAllQuickAnswers() {
      const quickInp = document.getElementById('quickAnswerPasteInput');
      if (quickInp) quickInp.value = '';
      clearAnswerFileUpload();
      builderAnswerSheet.forEach(item => {
        item.answer = '';
      });
      renderBuilderAnswerSheet();
      showUndoToast('Đã xóa hết đáp án!');
    }

    function renderBuilderAnswerSheet() {
      const container = document.getElementById('answerSheetQuestionsContainer');
      const countLbl = document.getElementById('sheetQuestionCountLabel');
      const scoreBadge = document.getElementById('assignmentTotalScoreBadge');
      if (countLbl) countLbl.innerText = builderAnswerSheet.length;
      if (scoreBadge) scoreBadge.innerText = 'Tổng: 10 điểm';
      if (!container) return;

      container.innerHTML = builderAnswerSheet.map((q, idx) => {
        const isMcq = q.type === 'mcq';
        return `
          <div class="bg-white rounded-xl border border-slate-200 px-2.5 py-2 flex items-center justify-between gap-2 shadow-sm">
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="font-extrabold text-xs text-slate-800 w-12">Câu ${idx + 1}:</span>
              <button
                type="button"
                onclick="toggleSingleSheetQuestionType(${idx})"
                class="px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                  isMcq
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }"
                title="Đổi giữa Trắc nghiệm và Điền từ"
              >
                ${isMcq ? '⇄ Điền từ' : '⇄ Trắc nghiệm'}
              </button>
            </div>

            <div class="flex items-center gap-1 flex-1 justify-end">
              ${isMcq ? ['A', 'B', 'C', 'D'].map(opt => `
                <button
                  type="button"
                  onclick="setBuilderSheetMcqAnswer(${idx}, '${opt}')"
                  class="w-7 h-7 rounded-lg text-xs font-extrabold transition ${
                    q.answer === opt
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }"
                >
                  ${opt}
                </button>
              `).join('') : `
                <input
                  type="text"
                  value="${escapeHtml(q.answer || '')}"
                  oninput="builderAnswerSheet[${idx}].answer = this.value"
                  placeholder="Nhập từ/đáp án..."
                  class="w-full max-w-[150px] px-2 py-1 text-xs rounded-lg border border-emerald-300 font-bold text-emerald-900 bg-emerald-50/30 focus:outline-none"
                >
              `}
            </div>
          </div>
        `;
      }).join('');
    }

    function toggleSingleSheetQuestionType(idx) {
      const item = builderAnswerSheet[idx];
      if (!item) return;
      item.type = item.type === 'mcq' ? 'fill' : 'mcq';
      item.answer = '';
      renderBuilderAnswerSheet();
    }

    function setBuilderSheetMcqAnswer(idx, opt) {
      if (!builderAnswerSheet[idx]) return;
      builderAnswerSheet[idx].answer = (builderAnswerSheet[idx].answer === opt) ? '' : opt;
      renderBuilderAnswerSheet();
    }

    function setAllSheetQuestionsType(targetType) {
      builderAnswerSheet.forEach(q => {
        q.type = targetType;
        q.answer = '';
      });
      renderBuilderAnswerSheet();
    }

    function adjustSheetQuestionCount(delta, defaultType = 'mcq') {
      if (delta > 0) {
        builderAnswerSheet.push({ index: builderAnswerSheet.length + 1, type: defaultType, answer: '', points: 0.5 });
      } else if (delta < 0 && builderAnswerSheet.length > 1) {
        builderAnswerSheet.pop();
      }
      renderBuilderAnswerSheet();
    }

    function fillAllMcqAnswers(letter) {
      builderAnswerSheet.forEach(q => {
        if (q.type === 'mcq') q.answer = letter;
      });
      renderBuilderAnswerSheet();
    }

    const MAX_ASSIGNMENT_FILE_BYTES = 5 * 1024 * 1024;

    async function extractFullDocumentText(file) {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') {
          showUndoToast('Thư viện đọc PDF đang tải, vui lòng thử lại sau vài giây.');
          return '';
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let pageText = '';
          let lastY = null;
          for (const item of content.items) {
            const y = Array.isArray(item.transform) ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
              pageText += '\n';
            }
            pageText += item.str || '';
            if (item.hasEOL) pageText += '\n';
            else pageText += ' ';
            if (y !== null) lastY = y;
          }
          pages.push(pageText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
        }

        const fullPdfText = pages.filter(Boolean).join('\n\n').trim();
        if (!fullPdfText) {
          showUndoToast('File PDF này là dạng ảnh scan không có chữ. Vui lòng chuyển sang PDF văn bản hoặc file .DOCX!');
          return '';
        }
        return fullPdfText;
      }

      if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
        const buf = await file.arrayBuffer();
        const h = new Uint8Array(buf.slice(0, 4));

        if (h[0] === 0x50 && h[1] === 0x4B) {
          if (typeof mammoth !== 'undefined') {
            try {
              const htmlRes = await mammoth.convertToHtml({ arrayBuffer: buf });
              if (htmlRes && htmlRes.value) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlRes.value
                  .replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '</$1>\n')
                  .replace(/<\/(td|th)>/gi, '</$1>\t');
                const extracted = (tempDiv.textContent || tempDiv.innerText || '')
                  .replace(/\t+\n/g, '\n')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();
                if (extracted) return extracted;
              }
            } catch (err) {
              console.warn('Fallback extractRawText:', err);
            }
            const rawRes = await mammoth.extractRawText({ arrayBuffer: buf });
            return (rawRes.value || '').trim();
          }
        }

        if (h[0] === 0xD0 && h[1] === 0xCF && h[2] === 0x11 && h[3] === 0xE0) {
          showUndoToast('File .doc định dạng Word 97-2003 cũ chưa hỗ trợ đọc trực tiếp. Vui lòng mở file và Lưu dưới dạng .DOCX hoặc .PDF rồi tải lên!');
          return '';
        }

        const rawText = await file.text();
        if (/<[a-z][\s\S]*>/i.test(rawText)) {
          const doc = new DOMParser().parseFromString(rawText, 'text/html');
          return (doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
        }
        return (rawText || '').trim();
      }

      const txt = await file.text();
      return (txt || '').trim();
    }

    async function handleExamPaperUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_ASSIGNMENT_FILE_BYTES) {
        e.target.value = '';
        showUndoToast('File đề bài vượt quá 5MB! Vui lòng chọn file dưới 5MB.');
        return;
      }

      const text = await extractFullDocumentText(file);
      if (!text) {
        e.target.value = '';
        showUndoToast('Không đọc được nội dung văn bản từ file này.');
        return;
      }

      currentExamPaperData = { name: file.name, text };
      const badge = document.getElementById('assignmentAttachedFileName');
      const clearBtn = document.getElementById('btnClearExamFile');
      const wrapper = document.getElementById('assignmentExamPreviewWrapper');
      const preview = document.getElementById('assignmentExamPreviewBox');
      if (badge) {
        badge.innerText = `${file.name} (${Math.max(1, Math.round(file.size / 1024))}KB)`;
        badge.classList.remove('hidden');
      }
      clearBtn?.classList.remove('hidden');
      wrapper?.classList.remove('hidden');
      if (preview) preview.value = text;
      showUndoToast(`Đã nhận diện đầy đủ nội dung đề bài (${text.split(/\r?\n/).length} dòng)!`);
    }

    function handleExamPreviewTextChange(val) {
      if (!currentExamPaperData) {
        currentExamPaperData = { name: 'De_bai_soan_thao.txt', text: val };
      } else {
        currentExamPaperData.text = val;
      }
      const box = document.getElementById('assignmentExamPreviewBox');
      if (box && box.value !== val) box.value = val;
    }

    function clearExamPaperUpload() {
      currentExamPaperData = null;
      const inp = document.getElementById('assignmentExamFileInput');
      if (inp) inp.value = '';
      document.getElementById('assignmentAttachedFileName')?.classList.add('hidden');
      document.getElementById('btnClearExamFile')?.classList.add('hidden');
      document.getElementById('assignmentExamPreviewWrapper')?.classList.add('hidden');
      const preview = document.getElementById('assignmentExamPreviewBox');
      if (preview) preview.value = '';
    }

    async function handleAnswerFileUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_ASSIGNMENT_FILE_BYTES) {
        e.target.value = '';
        showUndoToast('File đáp án vượt quá 5MB! Vui lòng chọn file dưới 5MB.');
        return;
      }

      const lower = file.name.toLowerCase();
      let extracted = '';
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        extracted = rows
          .map(r => r.map(c => String(c ?? '').trim()).filter(Boolean))
          .filter(r => r.length > 0)
          .map(r => (r.length >= 2 && /^(?:câu\s*)?\d+[\.\:\)]?$/i.test(r[0])) ? `${r[0].replace(/[\.\:\)]$/, '')}. ${r.slice(1).join(' ')}` : r.join(' '))
          .join('\n');
      } else {
        extracted = await extractFullDocumentText(file);
      }
      document.getElementById('quickAnswerPasteInput').value = extracted;
      document.getElementById('btnClearAnswerFile')?.classList.remove('hidden');
      const statusEl = document.getElementById('answerFileStatusText');
      if (statusEl) statusEl.innerText = `Đã nạp: ${file.name}`;
      handleQuickAnswerInputApply();
    }

    function clearAnswerFileUpload() {
      const inp = document.getElementById('assignmentAnswerFileInput');
      if (inp) inp.value = '';
      document.getElementById('btnClearAnswerFile')?.classList.add('hidden');
      const statusEl = document.getElementById('answerFileStatusText');
      if (statusEl) statusEl.innerText = 'File dưới 5MB (.PDF, .DOCX, .XLSX, .TXT) hoặc gõ chuỗi';
    }

    function handleQuickAnswerInputApply() {
      const raw = document.getElementById('quickAnswerPasteInput')?.value || '';
      const mode = document.getElementById('quickAnswerTargetMode')?.value || 'auto';
      if (!raw.trim()) return;

      const rawLines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const normalizedLines = [];
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/^(?:stt|câu|question)\b[\s\t\|]*(?:đáp án|answer|key)?$/i.test(line)) continue;

        const tabMatch = line.match(/^(?:câu\s*)?(\d+)\s*[\.\:\)\-]?\t+(.+)$/i);
        if (tabMatch) {
          normalizedLines.push(`${tabMatch[1]}. ${tabMatch[2].trim()}`);
          continue;
        }

        if (/^(?:câu\s*)?\d+[\.\:\)]?$/i.test(line) && i + 1 < rawLines.length) {
          const nextLine = rawLines[i + 1];
          if (!/^(?:câu\s*)?\d+[\.\:\)\-\t]/i.test(nextLine)) {
            normalizedLines.push(`${line.replace(/[\.\:\)]$/, '')}. ${nextLine}`);
            i++;
            continue;
          }
        }
        normalizedLines.push(line);
      }

      const numberedPairs = [];
      normalizedLines.forEach(line => {
        const regex = /(?:câu\s*)?(\d+)\s*[\.\:\)\-]\s*([^\d\n]+?)(?=(?:\s+(?:câu\s*)?\d+\s*[\.\:\)\-])|$)/gi;
        let m;
        while ((m = regex.exec(line)) !== null) {
          const qNum = parseInt(m[1], 10);
          const ansVal = m[2].trim();
          if (qNum > 0 && ansVal) {
            numberedPairs.push({ qNum, ansVal });
          }
        }
      });

      if (numberedPairs.length > 0) {
        const maxQ = Math.max(...numberedPairs.map(p => p.qNum));
        while (builderAnswerSheet.length < maxQ) {
          builderAnswerSheet.push({ index: builderAnswerSheet.length + 1, type: 'mcq', answer: '', points: 0.5 });
        }
        numberedPairs.forEach(({ qNum, ansVal }) => {
          const slot = builderAnswerSheet[qNum - 1];
          if (!slot) return;
          const cleanUpper = ansVal.toUpperCase().replace(/[\.\)]$/, '');
          const isSingleMcq = /^[A-D]$/.test(cleanUpper);
          if (mode === 'mcq' || (mode === 'auto' && isSingleMcq)) {
            slot.type = 'mcq';
            slot.answer = /^[A-D]$/.test(cleanUpper) ? cleanUpper : cleanUpper.charAt(0);
          } else {
            slot.type = 'fill';
            slot.answer = ansVal;
          }
        });
        renderBuilderAnswerSheet();
        showUndoToast(`Đã điền ${numberedPairs.length} đáp án vào phiếu!`);
        return;
      }

      const compact = raw.replace(/\s+/g, '').toUpperCase();
      if (/^[A-D]+$/.test(compact) && mode !== 'short') {
        while (builderAnswerSheet.length < compact.length) {
          builderAnswerSheet.push({ index: builderAnswerSheet.length + 1, type: 'mcq', answer: '', points: 0.5 });
        }
        for (let i = 0; i < compact.length; i++) {
          builderAnswerSheet[i].type = 'mcq';
          builderAnswerSheet[i].answer = compact[i];
        }
        renderBuilderAnswerSheet();
        showUndoToast(`Đã điền chuỗi ${compact.length} đáp án trắc nghiệm!`);
        return;
      }

      if (normalizedLines.length > 0) {
        while (builderAnswerSheet.length < normalizedLines.length) {
          builderAnswerSheet.push({ index: builderAnswerSheet.length + 1, type: 'fill', answer: '', points: 0.5 });
        }
        normalizedLines.forEach((ansVal, idx) => {
          const cleanUpper = ansVal.toUpperCase();
          const isSingleMcq = /^[A-D]$/.test(cleanUpper);
          if (mode === 'mcq' || (mode === 'auto' && isSingleMcq)) {
            builderAnswerSheet[idx].type = 'mcq';
            builderAnswerSheet[idx].answer = cleanUpper.charAt(0);
          } else {
            builderAnswerSheet[idx].type = 'fill';
            builderAnswerSheet[idx].answer = ansVal;
          }
        });
        renderBuilderAnswerSheet();
        showUndoToast(`Đã điền ${normalizedLines.length} dòng đáp án!`);
      }
    }

    async function handleSaveAssignment(e) {
      e.preventDefault();
      if (!hasHomeworkFeatureAccess()) { showUndoToast('Tính năng Bài tập Online chỉ có trên các gói trả phí. Vui lòng nâng cấp!'); openVipSubscriptionModal(); return; }
      const classId = document.getElementById('assignmentClassSelect')?.value || classesList[0]?.id;
      const title = document.getElementById('assignmentTitleInput')?.value.trim();
      const deadline = document.getElementById('assignmentDeadlineInput')?.value;
      const description = document.getElementById('assignmentDescInput')?.value.trim();
      const perPoint = builderAnswerSheet.length > 0 ? +(10 / builderAnswerSheet.length).toFixed(2) : 0.5;

      const questions = builderAnswerSheet.map((item, idx) => ({
        id: item.questionId || `q_${Date.now()}_${idx}`,
        type: item.type === 'mcq' ? 'single_choice' : 'fill_blank',
        title: `Câu ${idx + 1}`,
        prompt: `Câu ${idx + 1}`,
        options: item.type === 'mcq' ? [
          { letter: 'A', label: 'A' },
          { letter: 'B', label: 'B' },
          { letter: 'C', label: 'C' },
          { letter: 'D', label: 'D' }
        ] : [],
        correctAnswer: item.answer || '',
        points: perPoint
      }));

      if (activeWorkspaceMode === 'shared') {
        if (!supabaseClient || !activeSharedWorkspace?.owner_id) {
          showUndoToast('Không xác định được không gian chia sẻ để lưu bài tập.');
          return;
        }
        const isUpdate = Boolean(editingHomeworkId);
        const existingHw = isUpdate ? homeworks.find(h => h.id === editingHomeworkId) : null;
        const hwPayload = {
          ...(existingHw || {}),
          id: isUpdate ? editingHomeworkId : `HW_${Date.now()}`,
          classId,
          title,
          deadline,
          description,
          totalPoints: 10,
          examPaper: currentExamPaperData,
          questions
        };

        try {
          const { data, error } = await supabaseClient.rpc('member_manage_homework', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_action: isUpdate ? 'update' : 'create',
            p_homework: hwPayload,
            p_homework_id: hwPayload.id
          });

          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Không thể lưu bài tập lên máy chủ.');
            return;
          }

          if (isUpdate) {
            const idx = homeworks.findIndex(h => h.id === editingHomeworkId);
            if (idx >= 0) homeworks[idx] = hwPayload;
          } else {
            homeworks.unshift(hwPayload);
          }
          editingHomeworkId = null;
          closeModal('modalCreateAssignment');
          renderHomeworkTab();
          renderHomeTab();
          showUndoToast(isUpdate ? `Đã cập nhật bài tập "${title}"!` : `Đã giao bài tập "${title}"!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi lưu bài tập.');
        }
        return;
      }

      if (editingHomeworkId) {
        const existingIdx = homeworks.findIndex(h => h.id === editingHomeworkId);
        if (existingIdx >= 0) {
          homeworks[existingIdx] = {
            ...homeworks[existingIdx],
            classId,
            title,
            deadline,
            description,
            totalPoints: 10,
            examPaper: currentExamPaperData,
            questions
          };
        }
        editingHomeworkId = null;
        saveAllToLocalStorage(true);
        closeModal('modalCreateAssignment');
        renderHomeworkTab();
        showUndoToast(`Đã cập nhật bài tập "${title}"!`);
        return;
      }

      homeworks.unshift({
        id: `HW_${Date.now()}`,
        classId,
        title,
        deadline,
        description,
        totalPoints: 10,
        examPaper: currentExamPaperData,
        questions
      });

      saveAllToLocalStorage(true);
      closeModal('modalCreateAssignment');
      renderHomeworkTab();
      showUndoToast(`Đã giao bài tập "${title}"!`);
    }

    function renderHomeworkTab() {
      const container = document.getElementById('homeworkCardsContainer');
      const createBtn = document.querySelector('#contentTabHomework button[onclick="openCreateAssignmentModal()"]');
      if (!container) return;

      if (!hasHomeworkFeatureAccess()) {
        createBtn?.classList.add('hidden');
        container.innerHTML = `
          <div class="bg-white rounded-3xl border border-amber-200/90 p-6 sm:p-8 text-center shadow-sm space-y-3 max-w-lg mx-auto my-2">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mx-auto flex items-center justify-center shadow-md shadow-orange-500/20">
              <i data-lucide="lock" class="w-6 h-6"></i>
            </div>
            <div class="space-y-1">
              <h4 class="font-extrabold text-sm sm:text-base text-slate-900">
                Tính năng Bài tập &amp; Phiếu trả lời Online dành riêng cho gói VIP
              </h4>
              <p class="text-xs text-slate-500 font-medium leading-relaxed">
                Giao đề bài trực tuyến, tạo phiếu trả lời trắc nghiệm &amp; điền từ tự động chấm điểm cho học sinh khi nâng cấp lên các gói trả phí.
              </p>
            </div>
            <div class="pt-1">
              <button
                type="button"
                onclick="openVipSubscriptionModal()"
                class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs sm:text-sm font-extrabold shadow-sm transition active:scale-95 inline-flex items-center gap-1.5"
              >
                <i data-lucide="crown" class="w-4 h-4"></i>
                <span>Nâng cấp gói ngay</span>
              </button>
            </div>
          </div>
        `;
        safeCreateIcons();
        return;
      }

      createBtn?.classList.remove('hidden');

      const filtered = (currentClassId && currentClassId !== ALL_CLASSES_ID)
        ? homeworks.filter(h => !h.classId || h.classId === currentClassId)
        : homeworks;

      if (filtered.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Chưa có bài tập nào. Bấm "Tạo bài tập mới" để giao bài.</div>`;
        return;
      }

      container.innerHTML = filtered.map(hw => {
        const cls = classesList.find(c => c.id === hw.classId);
        const subCount = homeworkSubmissions.filter(s => s.homeworkId === hw.id).length;
        return `
          <div class="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${escapeHtml(cls?.class_name || 'Tất cả lớp')}</span>
                <h4 class="font-extrabold text-xs sm:text-sm text-slate-900">${escapeHtml(hw.title)}</h4>
              </div>
              <div class="text-[11px] text-slate-500 font-medium">
                Hạn nộp: <strong class="text-rose-600">${escapeHtml(hw.deadline)}</strong> • ${hw.questions?.length || 0} câu hỏi • Đã nộp: <strong class="text-emerald-700">${subCount} bài</strong>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button type="button" onclick="openEditAssignmentModal('${hw.id}')" class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition inline-flex items-center gap-1" title="Sửa bài tập & đáp án">
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                <span>Sửa</span>
              </button>
              <button type="button" onclick="openTakeHomeworkModal('${hw.id}', true)" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition">Xem thử</button>
              <button type="button" onclick="openGradeHomeworkModal('${hw.id}')" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm">Chấm bài (${subCount})</button>
              <button type="button" onclick="deleteHomeworkItem('${hw.id}')" class="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition" title="Xóa bài tập">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
      safeCreateIcons();
    }

    function deleteHomeworkItem(hwId) {
      openConfirmModal('Xóa bài tập này?', 'Toàn bộ phiếu câu hỏi của bài tập này sẽ bị xóa.', async () => {
        if (activeWorkspaceMode === 'shared') {
          if (!supabaseClient || !activeSharedWorkspace?.owner_id) {
            showUndoToast('Không xác định được không gian chia sẻ để xóa bài tập.');
            return;
          }
          try {
            const { data, error } = await supabaseClient.rpc('member_manage_homework', {
              p_owner_id: activeSharedWorkspace.owner_id,
              p_action: 'delete',
              p_homework: null,
              p_homework_id: hwId
            });
            if (error || !data?.ok) {
              showUndoToast(data?.message || error?.message || 'Không thể xóa bài tập trên máy chủ.');
              return;
            }
            homeworks = homeworks.filter(h => h.id !== hwId);
            renderHomeworkTab();
            renderHomeTab();
            showUndoToast('Đã xóa bài tập!');
          } catch (err) {
            showUndoToast('Lỗi kết nối khi xóa bài tập.');
          }
          return;
        }

        homeworks = homeworks.filter(h => h.id !== hwId);
        saveAllToLocalStorage(true);
        renderHomeworkTab();
        showUndoToast('Đã xóa bài tập!');
      });
    }

    async function openGradeHomeworkModal(hwId) {
      if (!hasHomeworkFeatureAccess()) { showUndoToast('Tính năng Bài tập Online chỉ có trên các gói trả phí. Vui lòng nâng cấp!'); openVipSubscriptionModal(); return; }
      const hw = homeworks.find(h => h.id === hwId);
      const container = document.getElementById('gradeSubmissionsContainer');
      if (!hw || !container) return;

      document.getElementById('gradeHomeworkModalTitle').innerText = `Chấm bài: ${hw.title}`;
      container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">Đang tải danh sách bài nộp mới nhất...</div>`;
      openModal('modalGradeHomework');

      if (supabaseClient && currentUser?.id && activeWorkspaceMode === 'own') {
        try {
          const { data: row } = await supabaseClient
            .from('user_app_data')
            .select('data')
            .eq('user_id', currentUser.id)
            .maybeSingle();
          const remoteSubs = row?.data?.homeworkSubmissions;
          if (Array.isArray(remoteSubs)) {
            homeworkSubmissions = mergeHomeworkSubmissionsById(remoteSubs, homeworkSubmissions);
            saveAllToLocalStorage(false);
          }
        } catch (err) {}
      } else if (activeWorkspaceMode === 'shared' && activeSharedWorkspace?.owner_id) {
        await reloadActiveSharedWorkspaceQuietly();
      }

      const subs = homeworkSubmissions.filter(s => s.homeworkId === hwId);
      if (subs.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Chưa có học sinh nào nộp bài tập này.</div>`;
        return;
      }

      container.innerHTML = subs.map((sub, idx) => `
        <div class="bg-slate-50/90 rounded-2xl border border-slate-200 p-3.5 space-y-2.5 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
            <div>
              <span class="font-extrabold text-sm text-slate-900">${escapeHtml(sub.studentName || 'Học sinh')}</span>
              <span class="text-[11px] text-slate-500 ml-2">Nộp lúc: ${escapeHtml(sub.submittedAt || '--')}</span>
            </div>
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">Điểm: ${sub.score}/10</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div class="sm:col-span-3">
              <label class="block text-[10.5px] font-bold text-slate-600 mb-1">Chỉnh điểm (0–10)</label>
              <input
                type="number"
                id="gradeScoreInput_${idx}"
                step="0.1"
                min="0"
                max="10"
                value="${sub.score ?? 0}"
                class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-extrabold text-indigo-700"
              >
            </div>
            <div class="sm:col-span-7">
              <label class="block text-[10.5px] font-bold text-slate-600 mb-1">Lời phê / Nhận xét của giáo viên</label>
              <input
                type="text"
                id="gradeCommentInput_${idx}"
                value="${escapeHtml(sub.teacherComment || '')}"
                placeholder="Nhập nhận xét cho học sinh..."
                class="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-medium"
              >
            </div>
            <div class="sm:col-span-2">
              <button
                type="button"
                onclick="saveTeacherGrade('${escapeHtml(sub.id)}', ${idx})"
                class="w-full py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold shadow-sm transition active:scale-95"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

    async function saveTeacherGrade(subId, idx) {
      const sub = homeworkSubmissions.find(s => s.id === subId);
      if (!sub) return;
      const scoreVal = Number(document.getElementById(`gradeScoreInput_${idx}`)?.value);
      const commentVal = document.getElementById(`gradeCommentInput_${idx}`)?.value || '';

      if (activeWorkspaceMode === 'shared') {
        if (!supabaseClient || !activeSharedWorkspace?.owner_id) {
          showUndoToast('Không xác định được không gian chia sẻ để lưu điểm.');
          return;
        }
        const finalScore = !Number.isNaN(scoreVal) ? scoreVal : sub.score;
        try {
          const { data, error } = await supabaseClient.rpc('member_grade_submission', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_submission_id: subId,
            p_score: finalScore,
            p_comment: commentVal
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi lưu điểm & nhận xét bài nộp.');
            return;
          }
          sub.score = finalScore;
          sub.teacherComment = commentVal;
          showUndoToast(`Đã lưu điểm & nhận xét cho ${sub.studentName}!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi lưu điểm bài nộp.');
        }
        return;
      }

      if (!Number.isNaN(scoreVal)) sub.score = scoreVal;
      sub.teacherComment = commentVal;
      saveAllToLocalStorage(true);
      showUndoToast(`Đã lưu điểm & nhận xét cho ${sub.studentName}!`);
    }

