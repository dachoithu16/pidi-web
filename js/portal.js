    let activeTakingHomeworkId = null;
    let activeTakingSessionKey = null;
    let activeStudentAnswersMap = {};
    let isPreviewingHomework = false;

    function openTakeHomeworkModal(hwId, isPreview = false) {
      isPreviewingHomework = Boolean(isPreview);
      const isParentRealMode = !isPreviewingHomework && currentRole === 'parent';

      const hw = isParentRealMode
        ? (parentPortalSession?.homeworks || []).find(h => h.id === hwId)
        : homeworks.find(h => h.id === hwId);
      if (!hw) return;

      let st = null;
      if (isParentRealMode) {
        st = parentPortalSession?.student || null;
        if (!st) return;
      } else {
        const allSt = getStudentsForClass(ALL_CLASSES_ID);
        st = allSt.find(s => s.id === selectedParentStudentId) || allSt[0] || { id: 'PREVIEW_ST', name: 'Học sinh xem thử' };
      }

      const sessionKey = `${hwId}_${st.id}_${isPreviewingHomework ? 'preview' : 'real'}`;
      const isNewSession = activeTakingSessionKey !== sessionKey;
      activeTakingHomeworkId = hwId;
      activeTakingSessionKey = sessionKey;

      document.getElementById('takeHomeworkTitle').innerText = hw.title;
      document.getElementById('takeHomeworkStudentNameBadge').innerText = isPreviewingHomework ? 'Chế độ xem thử của Giáo viên' : st.name;

      const footerActions = document.getElementById('takeHomeworkFooterActions');
      if (footerActions) {
        footerActions.classList.toggle('hidden', isPreviewingHomework);
      }

      const paperCol = document.getElementById('takeHomeworkExamPaperColumn');
      const paperContent = document.getElementById('takeHomeworkExamPaperContent');
      if (hw.examPaper && hw.examPaper.text) {
        paperCol?.classList.remove('hidden');
        if (paperContent) paperContent.innerText = hw.examPaper.text;
      } else {
        paperCol?.classList.add('hidden');
      }

      if (isNewSession) {
        const subsList = isParentRealMode ? (parentPortalSession?.submissions || []) : homeworkSubmissions;
        const existingSub = !isPreviewingHomework
          ? subsList.find(s => s.homeworkId === hwId && s.studentId === st.id)
          : null;
        activeStudentAnswersMap = existingSub ? { ...existingSub.answers } : {};
      }

      const qCol = document.getElementById('takeHomeworkQuestionsColumn');
      if (qCol) {
        qCol.innerHTML = (hw.questions || []).map((q, idx) => {
          const curAns = activeStudentAnswersMap[q.id] || '';
          const isMcq = q.type === 'single_choice';
          return `
            <div class="p-3 rounded-2xl border border-slate-200 bg-white space-y-2" data-question-card="${q.id}">
              <div class="font-extrabold text-xs text-slate-900">Câu ${idx + 1}</div>
              ${isMcq ? `
                <div class="grid grid-cols-4 gap-2">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button
                      type="button"
                      data-mcq-qid="${q.id}"
                      data-mcq-opt="${opt}"
                      onclick="recordStudentAnswer('${q.id}', '${opt}')"
                      class="py-2 rounded-xl text-xs font-extrabold border transition ${
                        curAns === opt ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }"
                    >${opt}</button>
                  `).join('')}
                </div>
              ` : `
                <input
                  type="text"
                  value="${String(curAns).replace(/"/g, '&quot;')}"
                  oninput="recordStudentAnswer('${q.id}', this.value)"
                  placeholder="Nhập câu trả lời của em..."
                  class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-bold text-slate-900"
                >
              `}
            </div>
          `;
        }).join('');
      }
      openModal('modalTakeHomework');
    }

    function recordStudentAnswer(qId, val) {
      activeStudentAnswersMap[qId] = val;
      const mcqButtons = document.querySelectorAll(`button[data-mcq-qid="${qId}"]`);
      if (mcqButtons.length > 0) {
        mcqButtons.forEach(btn => {
          const opt = btn.getAttribute('data-mcq-opt');
          if (opt === val) {
            btn.className = 'py-2 rounded-xl text-xs font-extrabold border transition bg-indigo-600 text-white border-indigo-600 shadow-xs';
          } else {
            btn.className = 'py-2 rounded-xl text-xs font-extrabold border transition bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200';
          }
        });
      }
    }

    async function handleSubmitStudentHomework() {
      if (isPreviewingHomework || currentRole === 'teacher') {
        const hw = homeworks.find(h => h.id === activeTakingHomeworkId);
        if (!hw) return;
        let previewCorrect = 0;
        const totalPreviewQ = (hw.questions || []).length;
        (hw.questions || []).forEach(q => {
          const userAns = String(activeStudentAnswersMap[q.id] || '').trim().toLowerCase();
          const rightAns = String(q.correctAnswer || '').trim().toLowerCase();
          if (rightAns && userAns === rightAns) previewCorrect++;
        });
        const previewScore = totalPreviewQ > 0 ? +((previewCorrect / totalPreviewQ) * 10).toFixed(1) : 10;
        showUndoToast(`Xem thử: Điểm đạt ${previewScore}/10 (${previewCorrect}/${totalPreviewQ} câu đúng) - Không lưu dữ liệu.`);
        return;
      }

      if (!parentPortalSession?.student) return;
      const st = parentPortalSession.student;
      const hw = (parentPortalSession.homeworks || []).find(h => h.id === activeTakingHomeworkId);
      if (!hw) return;

      if (parentPortalSession.isRemote) {
        if (!supabaseClient) {
          showUndoToast('Nộp bài thất bại, kiểm tra lại kết nối mạng');
          return;
        }
        try {
          const { data, error } = await supabaseClient.rpc('submit_student_homework_by_code', {
            p_code: parentPortalSession.studentCode,
            p_homework_id: hw.id,
            p_answers: { ...activeStudentAnswersMap },
            p_password: parentPortalSession.classPassword || null
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || 'Nộp bài thất bại, kiểm tra lại kết nối mạng');
            return;
          }
          if (!Array.isArray(parentPortalSession.submissions)) {
            parentPortalSession.submissions = [];
          }
          if (data.submission) {
            const subIdx = parentPortalSession.submissions.findIndex(s => s.homeworkId === hw.id);
            if (subIdx >= 0) parentPortalSession.submissions[subIdx] = data.submission;
            else parentPortalSession.submissions.push(data.submission);
          }
          const linkedItem = studentLinkedSessions.find(x => x.code === parentPortalSession.studentCode);
          if (linkedItem && linkedItem.session) {
            linkedItem.session.submissions = parentPortalSession.submissions;
          }
          activeTakingHomeworkId = null;
          activeTakingSessionKey = null;
          closeModal('modalTakeHomework');
          renderParentView();
          showUndoToast(`Đã nộp bài! Điểm tự chấm: ${data.score}/10 (${data.correctCount}/${data.totalQ} câu đúng)`);
        } catch (rpcErr) {
          console.warn('Lỗi ngoại lệ khi gọi RPC nộp bài:', rpcErr);
          showUndoToast('Nộp bài thất bại, kiểm tra lại kết nối mạng');
        }
        return;
      }

      let correctCount = 0;
      const totalQ = (hw.questions || []).length;
      (hw.questions || []).forEach(q => {
        const userAns = String(activeStudentAnswersMap[q.id] || '').trim().toLowerCase();
        const rightAns = String(q.correctAnswer || '').trim().toLowerCase();
        if (rightAns && userAns === rightAns) correctCount++;
      });

      const score = totalQ > 0 ? +((correctCount / totalQ) * 10).toFixed(1) : 10;
      const existingIdx = homeworkSubmissions.findIndex(s => s.homeworkId === hw.id && s.studentId === st.id);
      const subObj = {
        id: existingIdx >= 0 ? homeworkSubmissions[existingIdx].id : `SUB_${Date.now()}_${st.id}`,
        homeworkId: hw.id,
        studentId: st.id,
        studentName: st.name,
        answers: { ...activeStudentAnswersMap },
        score,
        submittedAt: new Date().toLocaleString('vi-VN'),
        teacherComment: existingIdx >= 0 ? homeworkSubmissions[existingIdx].teacherComment : ''
      };

      if (existingIdx >= 0) homeworkSubmissions[existingIdx] = subObj;
      else homeworkSubmissions.push(subObj);

      if (!Array.isArray(parentPortalSession.submissions)) {
        parentPortalSession.submissions = [];
      }
      const sessionSubIdx = parentPortalSession.submissions.findIndex(s => s.homeworkId === hw.id && s.studentId === st.id);
      if (sessionSubIdx >= 0) parentPortalSession.submissions[sessionSubIdx] = subObj;
      else parentPortalSession.submissions.push(subObj);
      const linkedItem = studentLinkedSessions.find(x => x.code === parentPortalSession.studentCode);
      if (linkedItem && linkedItem.session) {
        linkedItem.session.submissions = parentPortalSession.submissions;
      }

      saveAllToLocalStorage(false);
      activeTakingHomeworkId = null;
      activeTakingSessionKey = null;
      closeModal('modalTakeHomework');
      renderParentView();
      showUndoToast(`Đã nộp bài! Điểm tự chấm: ${score}/10 (${correctCount}/${totalQ} câu đúng)`);
    }

    function findStudentByCodeAcrossClasses(codeInput) {
      const normalized = String(codeInput || '').trim().toUpperCase();
      if (!normalized) return null;
      for (const cls of classesList) {
        const list = classStudentsMap[cls.id] || [];
        const st = list.find(s => String(s.studentCode || '').trim().toUpperCase() === normalized);
        if (st) {
          return {
            student: Object.assign({}, st, { _classId: cls.id, _className: cls.class_name }),
            classObj: cls
          };
        }
      }
      return null;
    }

    async function lookupStudentFromSupabaseByCode(codeInput, pwdInput = '') {
      const normalized = String(codeInput || '').trim().toUpperCase();
      if (!normalized || !supabaseClient) return null;
      const trimmedPwd = String(pwdInput || '').trim();
      try {
        const { data, error } = await supabaseClient.rpc('get_student_portal_by_code', {
          p_code: normalized,
          p_password: trimmedPwd || null
        });
        if (error || !data) {
          return null;
        }
        if (data.ok === false) {
          return {
            ok: false,
            need_password: Boolean(data.need_password),
            not_found: Boolean(data.not_found),
            message: data.message
          };
        }
        if (data.ok === true && data.student && data.classObj) {
          return {
            ok: true,
            isRemote: true,
            studentCode: normalized,
            classPassword: trimmedPwd,
            teacherUserId: data.teacherUserId || null,
            student: {
              ...data.student,
              _classId: data.classObj.id,
              _className: data.classObj.class_name
            },
            classObj: data.classObj,
            homeworks: Array.isArray(data.homeworks) ? data.homeworks : [],
            submissions: Array.isArray(data.submissions) ? data.submissions : [],
            paymentQr: data.teacherPaymentQr || { imageData: '', bankName: 'BIDV' },
            tuitionRemarks: data.tuitionRemarksMap || {}
          };
        }
        return null;
      } catch (err) {
        console.warn('Lỗi tra cứu RPC get_student_portal_by_code:', err);
        return null;
      }
    }

    function onParentCodeInputTyping(val) {
      const match = findStudentByCodeAcrossClasses(val);
      const pwdInp = document.getElementById('parentClassPasswordInput');
      const errBox = document.getElementById('parentCodeErrorBox');
      errBox?.classList.add('hidden');
      if (pwdInp) {
        if (match && match.classObj && match.classObj.classPassword && match.classObj.classPassword.trim() !== '') {
          pwdInp.classList.add('border-amber-300', 'bg-amber-50/30');
          pwdInp.classList.remove('border-slate-200', 'bg-slate-50/50');
        } else {
          pwdInp.classList.remove('border-amber-300', 'bg-amber-50/30');
          pwdInp.classList.add('border-slate-200', 'bg-slate-50/50');
        }
      }
    }

    // Key localStorage tách theo tài khoản: user_id riêng cho từng tài khoản, khách chưa đăng nhập dùng key guest riêng.
    function getStudentLinksStorageKey(userId = currentUser?.id) {
      return `${STUDENT_LINKS_LOCAL_KEY}_${userId ? 'user_' + userId : 'guest'}`;
    }

    // Chuyển dữ liệu key chung cũ sang key khách (một lần), rồi xóa key cũ để không đẩy chéo giữa các tài khoản.
    function migrateLegacyStudentLinksStorage() {
      try {
        const legacyRaw = localStorage.getItem(STUDENT_LINKS_LOCAL_KEY);
        if (legacyRaw === null) return;
        const guestKey = getStudentLinksStorageKey(null);
        if (localStorage.getItem(guestKey) === null) {
          localStorage.setItem(guestKey, legacyRaw);
        }
        localStorage.removeItem(STUDENT_LINKS_LOCAL_KEY);
      } catch (e) {}
    }

    function getLocalStudentLinks(userId = currentUser?.id) {
      try {
        migrateLegacyStudentLinksStorage();
        const raw = localStorage.getItem(getStudentLinksStorageKey(userId));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(x => x && x.code).map(x => ({
          code: String(x.code).trim().toUpperCase(),
          password: String(x.password || '').trim()
        })) : [];
      } catch (e) { return []; }
    }

    function saveLocalStudentLinks(links, userId = currentUser?.id) {
      try {
        localStorage.setItem(getStudentLinksStorageKey(userId), JSON.stringify(links || []));
      } catch (e) {}
    }

    async function syncStudentLinksWithCloud() {
      // Chốt tài khoản ngay từ đầu để các bước await phía sau không ghi nhầm sang tài khoản khác.
      const syncUserId = currentUser?.id || null;
      const localLinks = getLocalStudentLinks(syncUserId);
      const mergedMap = new Map();
      localLinks.forEach(l => mergedMap.set(l.code, l));

      if (supabaseClient && syncUserId) {
        try {
          const { data, error } = await supabaseClient
            .from('student_class_links')
            .select('student_code, class_password')
            .eq('user_id', syncUserId)
            .order('created_at', { ascending: true });

          if (!error && Array.isArray(data)) {
            const cloudCodes = new Set();
            data.forEach(row => {
              const c = String(row.student_code || '').trim().toUpperCase();
              if (!c) return;
              cloudCodes.add(c);
              const cloudPassword = String(row.class_password || '').trim();
              const localPassword = String(mergedMap.get(c)?.password || '').trim();
              // Cloud trả mật khẩu rỗng/null nhưng máy đang có mật khẩu hợp lệ -> giữ mật khẩu ở máy, không ghi đè rỗng.
              mergedMap.set(c, { code: c, password: (!cloudPassword && localPassword) ? localPassword : cloudPassword });
            });

            const toPush = localLinks.filter(l => !cloudCodes.has(l.code));
            if (toPush.length > 0) {
              await supabaseClient.from('student_class_links').upsert(
                toPush.map(l => ({
                  user_id: syncUserId,
                  student_code: l.code,
                  class_password: l.password || null,
                  updated_at: new Date().toISOString()
                })),
                { onConflict: 'user_id,student_code' }
              );
            }
          }
        } catch (err) {
          console.warn('Lỗi đồng bộ student_class_links:', err);
        }
      }

      // Trong lúc chờ cloud, tài khoản đã đổi/đăng xuất -> bỏ kết quả cũ, không ghi đè dữ liệu của tài khoản mới.
      if ((currentUser?.id || null) !== syncUserId) return;

      studentClassLinks = Array.from(mergedMap.values());
      saveLocalStudentLinks(studentClassLinks, syncUserId);
      await refreshAllStudentLinkedSessions();
    }

    async function refreshAllStudentLinkedSessions() {
      if (!Array.isArray(studentClassLinks) || studentClassLinks.length === 0) {
        studentLinkedSessions = [];
        activeStudentLinkCode = null;
        parentPortalSession = null;
        if (currentRole === 'parent') renderParentView();
        return;
      }

      const results = await Promise.all(studentClassLinks.map(async (item) => {
        let res = null;
        if (supabaseClient) {
          res = await lookupStudentFromSupabaseByCode(item.code, item.password);
        }

        if (res && res.ok === true) {
          return { code: item.code, password: item.password, status: 'ok', errorMessage: '', session: res };
        }
        if (res && res.need_password === true) {
          return { code: item.code, password: item.password, status: 'reauth', errorMessage: res.message || 'Giáo viên đã đổi mật khẩu lớp. Cần xác thực lại.', session: null };
        }

        const localMatch = findStudentByCodeAcrossClasses(item.code);
        if (localMatch) {
          const reqPwd = (localMatch.classObj?.classPassword || '').trim();
          if (reqPwd && item.password !== reqPwd) {
            return { code: item.code, password: item.password, status: 'reauth', errorMessage: 'Mật khẩu lớp đã thay đổi. Cần xác thực lại.', session: null };
          }
          return {
            code: item.code,
            password: item.password,
            status: 'ok',
            errorMessage: '',
            session: {
              ok: true,
              isRemote: false,
              studentCode: item.code,
              classPassword: item.password,
              teacherUserId: null,
              student: localMatch.student,
              classObj: localMatch.classObj,
              homeworks: homeworks.filter(h => !h.classId || h.classId === localMatch.classObj.id),
              submissions: homeworkSubmissions.filter(s => s.studentId === localMatch.student.id),
              paymentQr: teacherPaymentQr,
              tuitionRemarks: tuitionRemarksMap
            }
          };
        }

        return {
          code: item.code,
          password: item.password,
          status: 'reauth',
          errorMessage: (res && res.message) || 'Không tìm thấy mã học sinh (có thể giáo viên đã xóa hoặc đổi mã).',
          session: null
        };
      }));

      studentLinkedSessions = results;

      const activeEntry = studentLinkedSessions.find(x => x.code === activeStudentLinkCode && x.status === 'ok')
        || studentLinkedSessions.find(x => x.status === 'ok')
        || studentLinkedSessions[0]
        || null;

      activeStudentLinkCode = activeEntry ? activeEntry.code : null;
      parentPortalSession = (activeEntry && activeEntry.status === 'ok') ? activeEntry.session : null;
      selectedParentStudentId = parentPortalSession?.student?.id || null;

      if (currentRole === 'parent') renderParentView();
    }

    function openAddStudentLinkForm(prefillCode = '') {
      isShowingAddStudentLinkForm = true;
      const codeInp = document.getElementById('parentCodeInput');
      const pwdInp = document.getElementById('parentClassPasswordInput');
      if (codeInp) codeInp.value = prefillCode || '';
      if (pwdInp) pwdInp.value = '';
      document.getElementById('parentCodeErrorBox')?.classList.add('hidden');
      renderParentView();
      if (prefillCode) pwdInp?.focus();
      else codeInp?.focus();
    }

    function cancelAddStudentLinkForm() {
      isShowingAddStudentLinkForm = false;
      document.getElementById('parentCodeErrorBox')?.classList.add('hidden');
      renderParentView();
    }

    function selectActiveStudentLink(code) {
      const entry = studentLinkedSessions.find(x => x.code === code);
      if (!entry) return;
      if (entry.status !== 'ok') {
        openAddStudentLinkForm(entry.code);
        return;
      }
      activeStudentLinkCode = entry.code;
      parentPortalSession = entry.session;
      selectedParentStudentId = entry.session?.student?.id || null;
      renderParentView();
    }

    function removeStudentClassLink(code) {
      const entry = studentLinkedSessions.find(x => x.code === code);
      const clsName = entry?.session?.classObj?.class_name || code;
      openConfirmModal(
        `Gỡ lớp ${clsName}?`,
        `Bạn có chắc chắn muốn gỡ mã ${code} khỏi danh sách lớp đang theo dõi?`,
        async () => {
          studentClassLinks = studentClassLinks.filter(x => x.code !== code);
          saveLocalStudentLinks(studentClassLinks);

          if (supabaseClient && currentUser?.id) {
            try {
              await supabaseClient
                .from('student_class_links')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('student_code', code);
            } catch (err) {
              console.warn('Lỗi xóa student_class_links:', err);
            }
          }

          studentLinkedSessions = studentLinkedSessions.filter(x => x.code !== code);
          if (activeStudentLinkCode === code) {
            const nextOk = studentLinkedSessions.find(x => x.status === 'ok') || studentLinkedSessions[0] || null;
            activeStudentLinkCode = nextOk ? nextOk.code : null;
            parentPortalSession = (nextOk && nextOk.status === 'ok') ? nextOk.session : null;
            selectedParentStudentId = parentPortalSession?.student?.id || null;
          }
          isShowingAddStudentLinkForm = false;
          renderParentView();
          showUndoToast(`Đã gỡ lớp ${clsName}.`);
        }
      );
    }

    async function handleVerifyParentStudentCode(e) {
      e.preventDefault();
      const codeVal = String(document.getElementById('parentCodeInput')?.value || '').trim().toUpperCase();
      const pwdVal = String(document.getElementById('parentClassPasswordInput')?.value || '').trim();
      const errBox = document.getElementById('parentCodeErrorBox');

      let res = null;
      if (supabaseClient) {
        res = await lookupStudentFromSupabaseByCode(codeVal, pwdVal);
      }

      if (res && res.need_password === true) {
        if (errBox) {
          errBox.innerText = res.message || 'Mật khẩu lớp không chính xác. Vui lòng nhập đúng mật khẩu do giáo viên cung cấp.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      let verifiedSession = null;
      if (res && res.ok === true) {
        verifiedSession = res;
      } else if (!res || res.not_found === true) {
        const match = findStudentByCodeAcrossClasses(codeVal);
        if (!match) {
          if (errBox) {
            errBox.innerText = (res && res.message) || 'Không tìm thấy mã học sinh này. Vui lòng kiểm tra lại với giáo viên.';
            errBox.classList.remove('hidden');
          }
          return;
        }
        const requiredPwd = (match.classObj?.classPassword || '').trim();
        if (requiredPwd && pwdVal !== requiredPwd) {
          if (errBox) {
            errBox.innerText = 'Mật khẩu lớp không chính xác. Vui lòng nhập đúng mật khẩu do giáo viên cung cấp.';
            errBox.classList.remove('hidden');
          }
          return;
        }
        verifiedSession = {
          ok: true,
          isRemote: false,
          studentCode: codeVal,
          classPassword: pwdVal,
          teacherUserId: null,
          student: match.student,
          classObj: match.classObj,
          homeworks: homeworks.filter(h => !h.classId || h.classId === match.classObj.id),
          submissions: homeworkSubmissions.filter(s => s.studentId === match.student.id),
          paymentQr: teacherPaymentQr,
          tuitionRemarks: tuitionRemarksMap
        };
      } else {
        if (errBox) {
          errBox.innerText = res.message || 'Không thể truy cập hồ sơ học sinh. Vui lòng kiểm tra lại.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      errBox?.classList.add('hidden');

      const existingIdx = studentClassLinks.findIndex(x => x.code === codeVal);
      if (existingIdx >= 0) studentClassLinks[existingIdx] = { code: codeVal, password: pwdVal };
      else studentClassLinks.push({ code: codeVal, password: pwdVal });
      saveLocalStudentLinks(studentClassLinks);

      if (supabaseClient && currentUser?.id) {
        try {
          await supabaseClient.from('student_class_links').upsert({
            user_id: currentUser.id,
            student_code: codeVal,
            class_password: pwdVal || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,student_code' });
        } catch (err) {
          console.warn('Lỗi lưu student_class_links lên Supabase:', err);
        }
      }

      const sessIdx = studentLinkedSessions.findIndex(x => x.code === codeVal);
      const newEntry = { code: codeVal, password: pwdVal, status: 'ok', errorMessage: '', session: verifiedSession };
      if (sessIdx >= 0) studentLinkedSessions[sessIdx] = newEntry;
      else studentLinkedSessions.push(newEntry);

      activeStudentLinkCode = codeVal;
      parentPortalSession = verifiedSession;
      selectedParentStudentId = verifiedSession.student.id;
      isShowingAddStudentLinkForm = false;

      renderParentView();
      showUndoToast(`Đã liên kết lớp ${verifiedSession.classObj.class_name}!`);
    }

    function logoutParentStudentCode() {
      openAddStudentLinkForm();
    }

    function getParentCurrentMonthSessionDates(classObj, studentObj = null) {
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();
      const curMonthTag = `/${String(curMonth).padStart(2, '0')}/${curYear}`;

      const generated = generateClassSessionDates(classObj?.schedules || [], [{ month: curMonth, year: curYear }]);
      if (generated.length > 0) {
        return generated;
      }

      const hist = (studentObj || parentPortalSession?.student)?.attendanceHistory || {};
      return Object.keys(hist)
        .filter(d => d.includes(curMonthTag))
        .sort((a, b) => {
          const [d1, m1, y1] = a.split('/').map(Number);
          const [d2, m2, y2] = b.split('/').map(Number);
          return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        });
    }

    function renderStudentScheduleSection() {
      const container = document.getElementById('parentScheduleSection');
      if (!container) return;

      if (!currentUser || !currentUser.id) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
      }

      container.classList.remove('hidden');

      const okSessions = studentLinkedSessions.filter(x => x.status === 'ok' && x.session?.classObj);
      const toMin = (t) => {
        const [h, m] = String(t || '00:00').split(':').map(Number);
        return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
      };

      const allSlots = [];
      okSessions.forEach(item => {
        const cls = item.session.classObj;
        const st = item.session.student;
        (cls.schedules || []).forEach(s => {
          allSlots.push({
            code: item.code,
            className: cls.class_name || 'Lớp học',
            studentName: st?.name || '',
            room: cls.room || '',
            colorBg: cls.colorBg || 'bg-indigo-50 border-indigo-200',
            day: s.day,
            startTime: s.startTime || '00:00',
            endTime: s.endTime || '00:00',
            startMin: toMin(s.startTime),
            endMin: toMin(s.endTime)
          });
        });
      });

      if (allSlots.length === 0) {
        container.innerHTML = `
          <h4 class="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
            <i data-lucide="calendar-clock" class="w-4 h-4 text-indigo-600"></i>
            <span>Lịch học tổng hợp</span>
          </h4>
          <div class="text-xs text-slate-400 italic">Các lớp đã liên kết hiện chưa xếp lịch học hàng tuần.</div>
        `;
        return;
      }

      // 1. Phát hiện trùng lịch (chỉ báo, không xóa)
      const conflictMessages = [];
      const conflictSlotKeys = new Set();
      DAYS_OF_WEEK.forEach(day => {
        const daySlots = allSlots.filter(s => s.day === day).sort((a, b) => a.startMin - b.startMin);
        for (let i = 0; i < daySlots.length; i++) {
          for (let j = i + 1; j < daySlots.length; j++) {
            const a = daySlots[i];
            const b = daySlots[j];
            if (a.startMin < b.endMin && b.startMin < a.endMin) {
              conflictSlotKeys.add(`${day}_${a.code}_${a.startTime}`);
              conflictSlotKeys.add(`${day}_${b.code}_${b.startTime}`);
              conflictMessages.push(`${day}: "${a.className}" (${a.startTime}-${a.endTime}) trùng giờ với "${b.className}" (${b.startTime}-${b.endTime})`);
            }
          }
        }
      });

      // 2. Tính buổi học tiếp theo gần nhất
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let nextUpcoming = null;
      for (let offset = 0; offset <= 7; offset++) {
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        const jsDay = target.getDay();
        const daySlots = allSlots
          .filter(s => DAY_TO_JS_INDEX[s.day] === jsDay && (offset > 0 || s.endMin > nowMin))
          .sort((a, b) => a.startMin - b.startMin);
        if (daySlots.length > 0) {
          const dateStr = `${String(target.getDate()).padStart(2, '0')}/${String(target.getMonth() + 1).padStart(2, '0')}`;
          nextUpcoming = { slot: daySlots[0], offset, dateStr, isToday: offset === 0, isTomorrow: offset === 1 };
          break;
        }
      }

      const nextBadgeText = nextUpcoming
        ? (nextUpcoming.isToday ? 'Hôm nay' : (nextUpcoming.isTomorrow ? 'Ngày mai' : `Còn ${nextUpcoming.offset} ngày`))
        : '';

      const nextCardHtml = nextUpcoming ? `
        <div class="rounded-2xl p-3 sm:p-3.5 border ${nextUpcoming.isToday ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-sm' : 'bg-indigo-50/70 text-slate-900 border-indigo-200'} flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-0.5 min-w-0">
            <div class="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide ${nextUpcoming.isToday ? 'text-amber-300' : 'text-indigo-600'}">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 shrink-0"></i>
              <span>Buổi học tiếp theo • ${nextBadgeText}</span>
            </div>
            <div class="font-extrabold text-xs sm:text-sm truncate">${escapeHtml(nextUpcoming.slot.className)}</div>
            <div class="text-[11px] font-semibold ${nextUpcoming.isToday ? 'text-indigo-100' : 'text-slate-600'}">
              ${escapeHtml(nextUpcoming.slot.day)}, ${nextUpcoming.dateStr} • ${escapeHtml(nextUpcoming.slot.startTime.replace(':', 'h'))} - ${escapeHtml(nextUpcoming.slot.endTime.replace(':', 'h'))}${nextUpcoming.slot.room ? ` • ${escapeHtml(nextUpcoming.slot.room)}` : ''}
            </div>
          </div>
        </div>
      ` : '';

      const conflictHtml = conflictMessages.length > 0 ? `
        <div class="rounded-2xl bg-rose-50 border border-rose-200 p-3 space-y-1 text-xs text-rose-800">
          <div class="font-extrabold flex items-center gap-1.5 text-rose-700">
            <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>
            <span>Phát hiện ${conflictMessages.length} ca học bị trùng lịch:</span>
          </div>
          <ul class="list-disc pl-5 space-y-0.5 text-[11px] font-semibold">
            ${conflictMessages.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}
          </ul>
        </div>
      ` : '';

      const todayName = getCurrentDayOfWeekInfo().dayName;
      const activeDays = DAYS_OF_WEEK.filter(d => allSlots.some(s => s.day === d));

      const weeklyHtml = `
        <div class="space-y-2">
          <div class="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Lịch học cố định hàng tuần (gộp ${okSessions.length} lớp)</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            ${activeDays.map(day => {
              const isToday = day === todayName;
              const daySlots = allSlots.filter(s => s.day === day).sort((a, b) => a.startMin - b.startMin);
              return `
                <div class="rounded-2xl border p-2.5 space-y-1.5 ${isToday ? 'bg-amber-50/60 border-amber-300' : 'bg-slate-50/70 border-slate-200'}">
                  <div class="flex items-center justify-between text-xs font-extrabold ${isToday ? 'text-amber-900' : 'text-slate-700'}">
                    <span>${day}</span>
                    ${isToday ? `<span class="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9.5px]">Hôm nay</span>` : ''}
                  </div>
                  <div class="space-y-1.5">
                    ${daySlots.map(s => {
                      const isConflict = conflictSlotKeys.has(`${day}_${s.code}_${s.startTime}`);
                      return `
                        <div class="p-2 rounded-xl border text-xs ${isConflict ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300' : s.colorBg}">
                          <div class="flex items-center justify-between gap-1">
                            <span class="font-mono font-extrabold text-[11px] ${isConflict ? 'text-rose-700' : 'text-indigo-700'}">${escapeHtml(s.startTime.replace(':', 'h'))} - ${escapeHtml(s.endTime.replace(':', 'h'))}</span>
                            ${isConflict ? `<span class="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold">Trùng giờ</span>` : (s.room ? `<span class="text-[10px] font-mono text-slate-600 bg-white/80 px-1 rounded">${escapeHtml(s.room)}</span>` : '')}
                          </div>
                          <div class="font-extrabold text-slate-900 truncate mt-0.5">${escapeHtml(s.className)}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      container.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <h4 class="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
            <i data-lucide="calendar-clock" class="w-4 h-4 text-indigo-600"></i>
            <span>Lịch học tổng hợp</span>
          </h4>
          <button type="button" onclick="refreshAllStudentLinkedSessions()" class="text-[11px] font-bold text-indigo-600 hover:underline inline-flex items-center gap-1">
            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
            <span>Đồng bộ</span>
          </button>
        </div>
        ${nextCardHtml}
        ${conflictHtml}
        ${weeklyHtml}
      `;
    }

    function renderParentView() {
      const gateCard = document.getElementById('parentCodeGateCard');
      const authContent = document.getElementById('parentAuthenticatedContent');
      const bannerBadge = document.getElementById('parentActiveStudentBannerBadge');
      const cancelAddBtn = document.getElementById('btnCancelAddStudentLink');
      const linkedSec = document.getElementById('parentLinkedClassesSection');
      const hwTitle = document.getElementById('studentHomeworkSectionTitle');
      const hwList = document.getElementById('studentHomeworkCardsList');
      const attGrid = document.getElementById('parentAttendanceGrid');

      const hasAnyLink = Array.isArray(studentClassLinks) && studentClassLinks.length > 0;

      if (!hasAnyLink || isShowingAddStudentLinkForm) {
        gateCard?.classList.remove('hidden');
        authContent?.classList.add('hidden');
        cancelAddBtn?.classList.toggle('hidden', !hasAnyLink);
        if (bannerBadge) bannerBadge.innerText = hasAnyLink ? `${studentClassLinks.length} lớp đã liên kết` : 'Chưa nhập mã HS';
        safeCreateIcons();
        return;
      }

      gateCard?.classList.add('hidden');
      authContent?.classList.remove('hidden');

      const activeEntry = studentLinkedSessions.find(x => x.code === activeStudentLinkCode) || studentLinkedSessions[0] || null;
      const activeSession = (activeEntry && activeEntry.status === 'ok') ? activeEntry.session : null;
      parentPortalSession = activeSession;
      const st = activeSession?.student || null;
      const cls = activeSession?.classObj || null;

      if (bannerBadge) {
        bannerBadge.innerText = st ? `${st.name} • ${studentLinkedSessions.length} lớp` : `${studentClassLinks.length} lớp đã liên kết`;
      }

      if (linkedSec) {
        const inlineLoginCardHtml = (!currentUser || !currentUser.id) ? `
          <div class="rounded-2xl border border-amber-300/90 bg-gradient-to-r from-amber-50 via-orange-50/80 to-rose-50/70 px-4 py-3 flex items-center justify-between gap-3 flex-1 min-w-[290px] shadow-xs">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <i data-lucide="lock" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <div class="font-extrabold text-xs sm:text-[13px] text-slate-900 leading-snug">Đăng nhập để mở khóa Lịch học &amp; Đồng bộ lớp</div>
                <div class="text-[11px] text-slate-600 leading-snug mt-0.5">Xem buổi học tới, lịch tuần gộp nhiều GV &amp; cảnh báo trùng giờ.</div>
              </div>
            </div>
            <button type="button" onclick="openAuthModal('signin')" class="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 hover:from-orange-600 hover:via-rose-600 hover:to-pink-700 text-white text-xs font-extrabold shadow-md shadow-rose-500/25 ring-2 ring-orange-200/80 transition active:scale-95 inline-flex items-center gap-1.5 shrink-0">
              <i data-lucide="log-in" class="w-3.5 h-3.5"></i>
              <span>Đăng nhập ngay</span>
            </button>
          </div>
        ` : '';

        linkedSec.innerHTML = `
          <div class="flex flex-row flex-wrap items-center justify-between gap-3 py-1">
            <div class="flex flex-row flex-wrap items-center gap-2 shrink-0">
              ${studentLinkedSessions.map(item => {
                const isAct = item.code === activeStudentLinkCode;
                const isOk = item.status === 'ok';
                const label = isOk ? (item.session?.classObj?.class_name || item.code) : `Mã ${item.code} (Cần xác thực)`;
                const subName = isOk ? (item.session?.student?.name || '') : (item.errorMessage || 'Lỗi xác thực');
                return `
                  <div class="inline-flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs sm:text-sm transition shrink-0 ${
                    !isOk
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : (isAct ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-indigo-50/60 hover:bg-indigo-100/70 border-indigo-200 text-slate-800')
                  }">
                    <button type="button" onclick="selectActiveStudentLink('${escapeHtml(item.code)}')" class="flex flex-row items-center gap-2 text-left min-w-0">
                      <span class="font-extrabold whitespace-nowrap">${escapeHtml(label)}</span>
                      ${subName ? `<span class="text-xs ${!isOk ? 'text-rose-600 font-bold' : (isAct ? 'text-indigo-100' : 'text-slate-600')} truncate max-w-[180px]">• ${escapeHtml(subName)}</span>` : ''}
                    </button>
                    ${!isOk ? `<button type="button" onclick="openAddStudentLinkForm('${escapeHtml(item.code)}')" class="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-extrabold shrink-0">Xác thực lại</button>` : ''}
                    <button type="button" onclick="removeStudentClassLink('${escapeHtml(item.code)}')" class="px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 ${
                      isAct && isOk ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-rose-100 hover:bg-rose-200 text-rose-700'
                    }" title="Gỡ lớp này">Gỡ</button>
                  </div>
                `;
              }).join('')}
            </div>
            ${inlineLoginCardHtml}
            <button type="button" onclick="openAddStudentLinkForm()" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition active:scale-95 inline-flex items-center justify-center gap-1.5 shrink-0 ml-auto">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>Thêm lớp</span>
            </button>
          </div>
        `;
      }

      renderStudentScheduleSection();

      if (hwTitle) {
        hwTitle.innerText = cls ? `Bài tập Online • ${cls.class_name}` : 'Bài tập & Phiếu trả lời Online';
      }

      if (hwList) {
        if (!st || !activeSession) {
          hwList.innerHTML = `<div class="text-xs text-rose-600 font-semibold">Lớp này cần xác thực lại mã/mật khẩu để xem bài tập.</div>`;
        } else {
          const classHws = Array.isArray(activeSession.homeworks) ? activeSession.homeworks : [];
          const sessionSubs = Array.isArray(activeSession.submissions) ? activeSession.submissions : [];
          if (classHws.length === 0) {
            hwList.innerHTML = `<div class="text-xs text-slate-400 italic">Hiện chưa có bài tập online nào cho lớp này.</div>`;
          } else {
            hwList.innerHTML = classHws.map(hw => {
              const sub = sessionSubs.find(x => x.homeworkId === hw.id && x.studentId === st.id);
              return `
                <div class="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div class="font-extrabold text-slate-900">${escapeHtml(hw.title)}</div>
                    <div class="text-[11px] text-slate-500 mt-0.5">
                      ${sub ? `<span class="text-emerald-700 font-bold">Đã nộp • Điểm: ${sub.score}/10</span> ${sub.teacherComment ? `• Nhận xét: "${escapeHtml(sub.teacherComment)}"` : ''}` : `Hạn nộp: ${escapeHtml(hw.deadline)}`}
                    </div>
                  </div>
                  <button type="button" onclick="openTakeHomeworkModal('${escapeHtml(hw.id)}', false)" class="px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold shrink-0">
                    ${sub ? 'Làm lại' : 'Làm bài'}
                  </button>
                </div>
              `;
            }).join('');
          }
        }
      }

      if (attGrid) {
        if (!st) {
          attGrid.innerHTML = `<div class="col-span-full text-xs text-slate-400 italic">Chưa có dữ liệu điểm danh.</div>`;
        } else {
          const history = st.attendanceHistory || {};
          const dates = Object.keys(history).filter(d => history[d] === 'present' || history[d] === 'absent');
          attGrid.innerHTML = dates.length === 0
            ? `<div class="col-span-full text-xs text-slate-400 italic">Chưa có dữ liệu điểm danh.</div>`
            : dates.map(d => {
                const isP = history[d] === 'present';
                return `
                  <div class="p-2 rounded-xl border text-center text-xs ${isP ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}">
                    <div class="font-mono font-bold">${d}</div>
                    <div class="font-extrabold mt-0.5">${isP ? '✓ Đi học' : '✗ Vắng mặt'}</div>
                  </div>
                `;
              }).join('');
        }
      }

      safeCreateIcons();
    }
