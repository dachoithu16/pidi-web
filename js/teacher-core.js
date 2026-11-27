    // ==================== RENDER TRANG CHỦ TỐI GIẢN VỚI DỮ LIỆU THẬT ====================
    function renderHomeTab() {
      const todayInfo = getCurrentDayOfWeekInfo();
      const todayFullStr = getTodayFullDateString();
      const plan = getActiveVipPlan();
      const planStyle = getOwnedPlanBadgeStyle(plan.id);
      const totalSt = getTotalUniqueStudentsCount();
      const maxSt = Math.max(1, Number(plan.maxStudents) || 15);

      const greetingEl = document.getElementById('homeHeroGreeting');
      const heroVipPillEl = document.getElementById('homeHeroVipPill');
      const vipLabelEl = document.getElementById('homeHeroVipPlanLabel');
      const summaryEl = document.getElementById('homeHeroSummary');

      if (greetingEl) {
        const displayName = currentUser?.full_name ? currentUser.full_name : 'Thầy/Cô';
        greetingEl.innerText = `Xin chào, ${displayName}`;
      }
      if (heroVipPillEl) {
        if (activeWorkspaceMode === 'shared') {
          heroVipPillEl.className = 'hidden';
        } else {
          heroVipPillEl.className = `inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full ${planStyle.bg} ${planStyle.hover} border border-white/25 text-[11px] sm:text-xs font-extrabold text-white transition active:scale-95 shrink-0 shadow-sm`;
          const crownEl = heroVipPillEl.querySelector('svg, [data-lucide="crown"]');
          if (crownEl) {
            crownEl.classList.remove('text-amber-400');
            crownEl.classList.add('text-white');
          }
        }
      }
      if (vipLabelEl) {
        vipLabelEl.innerText = plan.name;
      }

      // Đếm số ca dạy hôm nay và lọc các lớp có lịch hôm nay
      let todaySessionsCount = 0;
      const todayClassIds = new Set();
      classesList.forEach(cls => {
        if (Array.isArray(cls.schedules)) {
          cls.schedules.forEach(s => {
            if (s.day === todayInfo.dayName) {
              todaySessionsCount++;
              todayClassIds.add(cls.id);
            }
          });
        }
      });

      if (summaryEl) {
        summaryEl.innerText = activeWorkspaceMode === 'shared'
          ? `Hôm nay ${todaySessionsCount} ca dạy • ${totalSt} học sinh (${activeSharedWorkspace?.owner_name || 'Lớp chia sẻ'})`
          : `Hôm nay ${todaySessionsCount} ca dạy • ${totalSt} / ${maxSt} học sinh`;
      }

      // 1. Thẻ chỉ số Bài Tập (chỉ tính những học sinh thuộc lớp ĐÃ CÓ ít nhất 1 bài tập được giao)
      const evaluateHomeworkStats = (studentsList) => {
        let total = 0;
        let submitted = 0;
        studentsList.forEach(st => {
          const stStatus = getStudentHomeworkCompletionStatus(st);
          if (stStatus.total > 0) {
            total++;
            if (stStatus.isCompleted) {
              submitted++;
            }
          }
        });
        return { total, submitted };
      };

      let todayStudents = [];
      if (todayClassIds.size > 0) {
        todayClassIds.forEach(cid => {
          const list = classStudentsMap[cid] || [];
          list.forEach(st => {
            todayStudents.push(Object.assign({}, st, { _classId: cid }));
          });
        });
      }

      let hwStats = todayStudents.length > 0 ? evaluateHomeworkStats(todayStudents) : { total: 0, submitted: 0 };
      if (hwStats.total === 0) {
        hwStats = evaluateHomeworkStats(getStudentsForClass(ALL_CLASSES_ID));
      }

      const hwTotalCount = hwStats.total;
      const hwSubmittedCount = hwStats.submitted;
      const hwNotSubmitted = Math.max(0, hwTotalCount - hwSubmittedCount);
      const hwPct = hwTotalCount > 0 ? Math.round((hwSubmittedCount / hwTotalCount) * 100) : 0;

      const hwSubEl = document.getElementById('homeStatHwSubmitted');
      const hwTotEl = document.getElementById('homeStatHwTotal');
      const hwPctEl = document.getElementById('homeStatHwPercent');
      const hwSubTextEl = document.getElementById('homeStatHwSub');
      const hwBarEl = document.getElementById('homeStatHwBar');

      if (hwSubEl) hwSubEl.innerText = String(hwSubmittedCount);
      if (hwTotEl) hwTotEl.innerText = String(hwTotalCount);
      if (hwPctEl) hwPctEl.innerText = `${hwPct}%`;
      if (hwSubTextEl) {
        hwSubTextEl.innerText = hwTotalCount === 0
          ? 'Chưa có bài tập nào được giao'
          : `Đã nộp • Còn ${hwNotSubmitted} em chưa nộp`;
      }
      if (hwBarEl) hwBarEl.style.width = `${hwPct}%`;

      // 2. Thẻ chỉ số Doanh Thu tháng hiện tại
      const now = new Date();
      const curMonthNum = now.getMonth() + 1;
      const curMonthTag = `/${String(curMonthNum).padStart(2, '0')}/${now.getFullYear()}`;
      let monthCollected = 0;
      let monthUnpaid = 0;

      Object.values(classStudentsMap || {}).forEach(list => {
        (list || []).forEach(st => {
          const price = Number(st.pricePerSession) || 40000;
          const history = st.attendanceHistory || {};
          const paidList = Array.isArray(st.paidSessions) ? st.paidSessions : [];
          Object.entries(history).forEach(([dateStr, status]) => {
            if (status === 'present' && dateStr.includes(curMonthTag)) {
              if (paidList.includes(dateStr)) {
                monthCollected += price;
              } else {
                monthUnpaid += price;
              }
            }
          });
        });
      });

      const monthTotalRev = monthCollected + monthUnpaid;
      const revPct = monthTotalRev > 0 ? Math.round((monthCollected / monthTotalRev) * 100) : 0;

      const revTitleEl = document.getElementById('homeStatRevTitle');
      const revColEl = document.getElementById('homeStatRevCollected');
      const revSubEl = document.getElementById('homeStatRevSub');
      const revBarEl = document.getElementById('homeStatRevBar');

      if (revTitleEl) revTitleEl.innerText = `Doanh Thu T${curMonthNum}`;
      if (revColEl) revColEl.innerText = formatMoneyK(monthCollected);
      if (revSubEl) revSubEl.innerText = `Đã thu • Chưa thu ${formatMoneyK(monthUnpaid)}`;
      if (revBarEl) revBarEl.style.width = `${revPct}%`;

      applySharedWorkspaceUiRestrictions();
    }

    function openScheduleFromHome(mode = 'today') {
      isClassSelected = false;
      saveUiNavigationState();
      switchTab('attendance');
      toggleScheduleViewMode(mode === 'week' ? 'week' : 'today');
      renderAll();
    }

    function openHomeFinanceOverview() {
      const now = new Date();
      financeFilterMode = 'month';
      currentFinanceMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      const monthBtn = document.getElementById('filterModeMonthBtn');
      const rangeBtn = document.getElementById('filterModeRangeBtn');
      const monthBox = document.getElementById('filterMonthBox');
      const rangeBox = document.getElementById('filterRangeBox');
      monthBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
      monthBtn?.classList.remove('text-slate-600');
      rangeBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
      rangeBtn?.classList.add('text-slate-600');
      monthBox?.classList.remove('hidden');
      rangeBox?.classList.add('hidden');

      currentClassId = ALL_CLASSES_ID;
      students = getStudentsForClass(ALL_CLASSES_ID);

      renderClassSelectOptions();
      saveUiNavigationState();
      switchTab('finance');
    }

    // ==================== CHỌN LỚP & THỜI KHÓA BIỂU ====================
    function renderClassSelectOptions() {
      const select = document.getElementById('classListSelect');
      const editBtn = document.getElementById('btnOpenEditClass');
      if (!select) return;

      const totalStudentsAll = getStudentsForClass(ALL_CLASSES_ID).length;
      if (classesList.length === 0) {
        select.innerHTML = `<option value="">(Chưa có lớp học)</option>`;
        return;
      }

      select.innerHTML = `
        <option value="${ALL_CLASSES_ID}" ${currentClassId === ALL_CLASSES_ID ? 'selected' : ''}>
          Tổng Lớp (${totalStudentsAll} HS)
        </option>
        ${classesList.map(c => `
          <option value="${c.id}" ${c.id === currentClassId ? 'selected' : ''}>
            ${escapeHtml(c.class_name)}
          </option>
        `).join('')}
      `;

      if (editBtn) {
        editBtn.classList.toggle('hidden', currentClassId === ALL_CLASSES_ID || activeWorkspaceMode === 'shared');
      }
    }

    function onClassChange(newClassId) {
      currentClassId = newClassId;
      isClassSelected = true;
      students = getStudentsForClass(currentClassId);
      saveUiNavigationState();
      syncActiveAttendanceDateForCurrentClass();
      syncFinanceDatesForCurrentClass();
      renderAll();
    }

    function selectClassFromSchedule(clsId) {
      currentClassId = clsId;
      isClassSelected = true;
      students = getStudentsForClass(currentClassId);
      saveUiNavigationState();
      syncActiveAttendanceDateForCurrentClass();
      syncFinanceDatesForCurrentClass();
      renderAll();
    }

    function closeStudentListAndShowSchedule() {
      isClassSelected = false;
      saveUiNavigationState();
      renderAll();
    }

    function toggleScheduleViewMode(mode) {
      currentScheduleViewMode = mode;
      const todayCards = document.getElementById('todayMobileCardsWrapper');
      const matrixWrapper = document.getElementById('matrixScheduleTableWrapper');
      const todayBtn = document.getElementById('viewTodayMobileBtn');
      const weekBtn = document.getElementById('viewAllWeekMobileBtn');

      if (mode === 'today') {
        todayCards?.classList.remove('hidden');
        matrixWrapper?.classList.add('hidden');
        todayBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        todayBtn?.classList.remove('text-slate-600');
        weekBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        weekBtn?.classList.add('text-slate-600');
      } else {
        todayCards?.classList.add('hidden');
        matrixWrapper?.classList.remove('hidden');
        weekBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        weekBtn?.classList.remove('text-slate-600');
        todayBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        todayBtn?.classList.add('text-slate-600');
      }
    }

    function renderWeeklyScheduleGrid() {
      const todayInfo = getCurrentDayOfWeekInfo();
      const mobileTodayLabel = document.getElementById('mobileTodayBtnLabel');
      if (mobileTodayLabel) mobileTodayLabel.innerText = `Hôm nay ${todayInfo.dayName}`;

      const dayColMap = {
        'Thứ 2': 'scheduleCol_T2', 'Thứ 3': 'scheduleCol_T3', 'Thứ 4': 'scheduleCol_T4',
        'Thứ 5': 'scheduleCol_T5', 'Thứ 6': 'scheduleCol_T6', 'Thứ 7': 'scheduleCol_T7', 'Chủ Nhật': 'scheduleCol_CN'
      };
      const todayCardsContainer = document.getElementById('todayMobileCardsWrapper');
      const todayClasses = [];

      if (classesList.length === 0 && todayCardsContainer) {
        if (activeWorkspaceMode === 'shared') {
          todayCardsContainer.innerHTML = `
            <div class="p-6 rounded-2xl border-2 border-dashed border-slate-200 text-center bg-slate-50/70">
              <h4 class="font-extrabold text-sm text-slate-700">Chủ lớp chưa phân công lớp nào cho bạn</h4>
            </div>
          `;
        } else {
          todayCardsContainer.innerHTML = `
            <div class="p-6 rounded-2xl border-2 border-dashed border-indigo-200 text-center bg-indigo-50/40 space-y-2">
              <h4 class="font-extrabold text-sm text-slate-900">Chưa có lớp học nào</h4>
              <button type="button" onclick="openCreateClassModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm">
                + Tạo lớp học đầu tiên
              </button>
            </div>
          `;
        }
      }

      DAYS_OF_WEEK.forEach(day => {
        const colEl = document.getElementById(dayColMap[day]);
        if (!colEl) return;
        const isToday = day === todayInfo.dayName;
        const classesInDay = [];

        classesList.forEach(cls => {
          if (Array.isArray(cls.schedules)) {
            cls.schedules.forEach(s => {
              if (s.day === day) {
                const slot = `${s.startTime.replace(':', 'h')} - ${s.endTime.replace(':', 'h')}`;
                classesInDay.push({ cls, startTime: s.startTime, timeSlot: slot });
                if (isToday) todayClasses.push({ cls, startTime: s.startTime, timeSlot: slot });
              }
            });
          }
        });

        classesInDay.sort((a, b) => a.startTime.localeCompare(b.startTime));
        colEl.className = `flex flex-col min-h-[220px] ${isToday ? 'bg-amber-50/40 border-l border-r border-amber-300' : 'bg-white'}`;
        colEl.innerHTML = `
          <div class="py-2 px-1 text-center border-b border-slate-200 ${isToday ? 'bg-amber-500 text-slate-950 font-black' : 'bg-[#0f172a] text-slate-100 font-bold'}">
            <div class="text-[11px] sm:text-xs uppercase">${day}</div>
            ${isToday ? `<div class="bg-black text-white text-[9px] px-1.5 py-0.5 rounded-full uppercase mt-0.5 inline-block">Hôm nay</div>` : ''}
          </div>
          <div class="p-1.5 flex-1 flex flex-col space-y-1.5">
            ${classesInDay.length === 0
              ? `<div class="flex-1 flex items-center justify-center text-slate-300 text-[11px] italic">Nghỉ</div>`
              : classesInDay.map(item => {
                  const count = (classStudentsMap[item.cls.id] || []).length;
                  return `
                    <div onclick="selectClassFromSchedule('${item.cls.id}')" class="p-2 rounded-xl border text-left cursor-pointer transition shadow-sm hover:shadow active:scale-95 ${item.cls.colorBg}">
                      <div class="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
                        <span class="font-mono text-indigo-700">${escapeHtml(item.timeSlot)}</span>
                        <span class="px-1 rounded bg-white/80 font-mono text-[9px]">${escapeHtml(item.cls.room || 'P.101')}</span>
                      </div>
                      <div class="font-extrabold text-xs text-slate-900 leading-tight">${escapeHtml(item.cls.class_name)}</div>
                      <div class="flex items-center justify-between mt-1 pt-1 border-t border-black/5 text-[9.5px]">
                        <span class="px-1 rounded ${item.cls.badgeColor} font-bold">${escapeHtml(item.cls.code || 'TA')}</span>
                        <span class="font-semibold text-slate-600">${count} HS</span>
                      </div>
                    </div>
                  `;
                }).join('')}
          </div>
        `;
      });

      if (todayCardsContainer && classesList.length > 0) {
        todayClasses.sort((a, b) => a.startTime.localeCompare(b.startTime));
        if (todayClasses.length === 0) {
          todayCardsContainer.innerHTML = `<div class="p-4 rounded-2xl border border-dashed border-slate-200 text-center bg-white text-xs text-slate-400">Hôm nay (${todayInfo.dayName}) không có ca học nào.</div>`;
        } else {
          todayCardsContainer.innerHTML = todayClasses.map(({ cls, timeSlot }) => {
            const count = (classStudentsMap[cls.id] || []).length;
            return `
              <div class="p-3 rounded-2xl border ${cls.colorBg} flex items-center justify-between gap-2 shadow-sm">
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded ${cls.badgeColor}">${escapeHtml(cls.code || 'TA')}</span>
                    <span class="text-xs sm:text-sm font-bold text-slate-900">${escapeHtml(cls.class_name)}</span>
                  </div>
                  <div class="text-[11px] text-slate-600 mt-1 font-medium">${escapeHtml(cls.room || 'P.101')} • <span class="text-indigo-700 font-semibold">${escapeHtml(timeSlot)}</span> (${count} HS)</div>
                </div>
                <button type="button" onclick="selectClassFromSchedule('${cls.id}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 shadow-sm active:scale-95">Điểm danh</button>
              </div>
            `;
          }).join('');
        }
      }
    }

    // ==================== ĐIỂM DANH HỌC SINH ====================
    function renderActiveAttendanceDateSelect() {
      const sel = document.getElementById('activeAttendanceDateSelect');
      if (!sel) return;
      const classDates = getCurrentClassSessionDates(currentClassId);
      const todayStr = getTodayFullDateString();
      if (classDates.length === 0) {
        sel.innerHTML = `<option value="${todayStr}">Hôm nay (${todayStr})</option>`;
        activeAttendanceDate = todayStr;
        return;
      }
      if (!classDates.includes(activeAttendanceDate)) {
        activeAttendanceDate = classDates.includes(todayStr) ? todayStr : classDates[0];
      }
      const sessionsByMonth = {};
      classDates.forEach(d => {
        const parts = d.split('/');
        const mKey = `${parts[1]}/${parts[2]}`;
        if (!sessionsByMonth[mKey]) sessionsByMonth[mKey] = [];
        sessionsByMonth[mKey].push(d);
      });
      const opts = [];
      Object.keys(sessionsByMonth).forEach(mKey => {
        sessionsByMonth[mKey].forEach((dateStr, idx) => {
          const isAct = dateStr === activeAttendanceDate;
          const labelToday = dateStr === todayStr ? ' • Hôm nay' : '';
          opts.push(`<option value="${dateStr}" ${isAct ? 'selected' : ''}>Buổi ${idx + 1} - ${dateStr}${labelToday}</option>`);
        });
      });
      sel.innerHTML = opts.join('');
    }

    function onChangeActiveAttendanceDate(newDate) {
      activeAttendanceDate = newDate;
      if (newDate && newDate.includes('/')) {
        const parts = newDate.split('/');
        if (parts.length === 3) {
          currentFinanceMonth = `${parts[1]}/${parts[2]}`;
          syncFinanceDatesForCurrentClass();
        }
      }
      renderAttendanceTab();
      renderFinanceTab();
    }

    function getStudentAttendanceCounts(student) {
      let presentCount = 0;
      let absentCount = 0;
      if (student.attendanceHistory) {
        Object.values(student.attendanceHistory).forEach(st => {
          if (st === 'present') presentCount++;
          if (st === 'absent') absentCount++;
        });
      }
      return { presentCount, absentCount };
    }

    function getStudentHomeworkCompletionStatus(student) {
      const targetClassId = student._classId || currentClassId;
      const classHomeworks = homeworks.filter(hw => !hw.classId || hw.classId === targetClassId);
      const total = classHomeworks.length;
      if (total === 0) {
        return { total: 0, submitted: 0, percent: 0, isCompleted: false };
      }
      let submitted = 0;
      classHomeworks.forEach(hw => {
        const hasSub = homeworkSubmissions.some(sub => sub.homeworkId === hw.id && sub.studentId === student.id);
        if (hasSub) submitted++;
      });
      const percent = Math.round((submitted / total) * 100);
      return {
        total,
        submitted,
        percent,
        isCompleted: submitted >= total
      };
    }

    function renderAttendanceTab() {
      renderActiveAttendanceDateSelect();
      let presentCount = 0;
      let absentCount = 0;
      students.forEach(s => {
        const st = s.attendanceHistory?.[activeAttendanceDate];
        if (st === 'present') presentCount++;
        else if (st === 'absent') absentCount++;
      });
      const total = students.length;
      const statTotal = document.getElementById('statTotalStudents');
      const statPresent = document.getElementById('statPresentStudents');
      const statAbsent = document.getElementById('statAbsentStudents');
      if (statTotal) statTotal.innerText = `${total} HS`;
      if (statPresent) statPresent.innerText = `${presentCount} em`;
      if (statAbsent) statAbsent.innerText = `${absentCount} em`;

      const listEl = document.getElementById('studentAttendanceList');
      const isSharedMode = activeWorkspaceMode === 'shared';
      const canViewContacts = !isSharedMode || activeSharedWorkspace?.can_view_contacts === true;
      const selectAllCb = document.getElementById('selectAllAttendanceCheckbox');
      if (selectAllCb) {
        selectAllCb.classList.toggle('hidden', isSharedMode);
        if (isSharedMode) selectAllCb.checked = false;
      }
      if (!listEl) return;

      if (students.length === 0) {
        listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">Chưa có học sinh nào trong lớp này.</div>`;
        updateAttendanceBulkActionBar();
        return;
      }

      listEl.innerHTML = students.map((s, idx) => {
        const curStatus = s.attendanceHistory?.[activeAttendanceDate] || 'unrecorded';
        const isPresent = curStatus === 'present';
        const isAbsent = curStatus === 'absent';
        const isChecked = !isSharedMode && selectedAttendanceStudentIds.includes(s.id);
        const counts = getStudentAttendanceCounts(s);
        const hwStat = getStudentHomeworkCompletionStatus(s);
        const displayName = getShortName(s.name);
        const classTag = (currentClassId === ALL_CLASSES_ID && s._className)
          ? `<span class="text-[9.5px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">${escapeHtml(s._className)}</span>`
          : '';
        const phoneTag = (canViewContacts && s.parentPhone)
          ? `<span class="font-mono text-slate-500">• ${escapeHtml(s.parentPhone)}</span>`
          : '';

        return `
          <div class="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2 hover:bg-slate-50/90 transition ${isChecked ? 'bg-indigo-50/40' : 'bg-white'}">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              ${isSharedMode ? '' : `
                <input
                  type="checkbox"
                  ${isChecked ? 'checked' : ''}
                  onchange="toggleStudentAttendanceSelection('${s.id}', this.checked)"
                  class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer shrink-0"
                >
              `}
              <span class="w-6 text-center text-xs font-extrabold text-slate-400 shrink-0">${idx + 1}</span>
              <div onclick="openStudentDetailModal('${s.id}')" class="min-w-0 flex-1 cursor-pointer group">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-extrabold text-xs sm:text-sm text-slate-900 group-hover:text-indigo-600 transition truncate" title="${escapeHtml(s.name)}">${escapeHtml(displayName)}</span>
                  ${classTag}
                </div>
                <div class="text-[10px] sm:text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
                  <span class="text-emerald-600 font-bold">Có mặt: ${counts.presentCount}</span>
                  <span>•</span>
                  <span class="text-rose-500 font-bold">Vắng: ${counts.absentCount}</span>
                  ${phoneTag}
                  <span class="sm:hidden">• BT: <strong class="${hwStat.isCompleted ? 'text-emerald-600' : 'text-amber-600'}">${hwStat.submitted}/${hwStat.total}</strong></span>
                </div>
              </div>
            </div>

            <div class="hidden sm:flex w-36 md:w-44 justify-center items-center shrink-0 border-x border-slate-100 px-2">
              ${hwStat.total === 0
                ? `<span class="text-[11px] text-slate-400 italic">Chưa giao BT</span>`
                : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                    hwStat.isCompleted
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }">${hwStat.submitted}/${hwStat.total} bài (${hwStat.percent}%)</span>`
              }
            </div>

            <div class="flex items-center justify-center gap-1.5 w-32 sm:w-36 shrink-0">
              <button
                type="button"
                onclick="toggleStudentAttendance('${s.id}', 'present')"
                class="px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold border transition active:scale-95 ${
                  isPresent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200'
                }"
              >
                Đi học
              </button>
              <button
                type="button"
                onclick="toggleStudentAttendance('${s.id}', 'absent')"
                class="px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold border transition active:scale-95 ${
                  isAbsent
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                    : 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-slate-200'
                }"
              >
                Vắng
              </button>
            </div>

            <div onclick="openStudentDetailModal('${s.id}')" class="hidden sm:flex w-40 md:w-48 pl-3 border-l border-slate-100 items-center justify-between gap-1 shrink-0 cursor-pointer group">
              <span class="text-xs font-extrabold text-slate-800 group-hover:text-indigo-600 truncate">${escapeHtml(displayName)}</span>
              <span class="text-[10px] font-mono text-slate-400">${escapeHtml(s.studentCode || '')}</span>
            </div>
          </div>
        `;
      }).join('');

      updateAttendanceBulkActionBar();
      safeCreateIcons();
    }

    async function toggleStudentAttendance(studentId, targetStatus) {
      const found = findStudentAndClassById(studentId);
      const s = found ? found.student : students.find(x => x.id === studentId);
      if (!s) return;
      if (!s.attendanceHistory) s.attendanceHistory = {};
      const cur = s.attendanceHistory[activeAttendanceDate] || 'unrecorded';
      const nextStatus = cur === targetStatus ? 'unrecorded' : targetStatus;

      if (activeWorkspaceMode === 'shared') {
        const targetClassId = found?.classId || s._classId || currentClassId;
        if (!supabaseClient || !activeSharedWorkspace?.owner_id || !targetClassId) {
          showUndoToast('Không xác định được không gian chia sẻ để lưu điểm danh.');
          return;
        }
        try {
          const { data, error } = await supabaseClient.rpc('member_update_attendance', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: [{
              class_id: targetClassId,
              student_id: s.id,
              date: activeAttendanceDate,
              status: nextStatus
            }]
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi lưu điểm danh lên máy chủ.');
            await reloadActiveSharedWorkspaceQuietly();
            return;
          }
          s.attendanceHistory[activeAttendanceDate] = nextStatus;
          if (nextStatus !== 'present' && Array.isArray(s.paidSessions)) {
            s.paidSessions = s.paidSessions.filter(d => d !== activeAttendanceDate);
          }
          students = getStudentsForClass(currentClassId);
          syncFinanceDatesForCurrentClass();
          if (nextStatus === 'present' && activeAttendanceDate && !selectedFinanceDates.includes(activeAttendanceDate)) {
            selectedFinanceDates.push(activeAttendanceDate);
            updateFinanceDateBadge();
          }
          renderAttendanceTab();
          renderFinanceTab();
          renderHomeTab();
        } catch (err) {
          showUndoToast('Lỗi kết nối khi lưu điểm danh.');
          await reloadActiveSharedWorkspaceQuietly();
        }
        return;
      }

      s.attendanceHistory[activeAttendanceDate] = nextStatus;

      if (nextStatus !== 'present' && Array.isArray(s.paidSessions)) {
        s.paidSessions = s.paidSessions.filter(d => d !== activeAttendanceDate);
      }

      students = getStudentsForClass(currentClassId);
      syncFinanceDatesForCurrentClass();
      if (nextStatus === 'present' && activeAttendanceDate && !selectedFinanceDates.includes(activeAttendanceDate)) {
        selectedFinanceDates.push(activeAttendanceDate);
        updateFinanceDateBadge();
      }
      saveAllToLocalStorage(true);
      renderAttendanceTab();
      renderFinanceTab();
    }

    async function markAllAttendance(targetStatus) {
      if (students.length === 0) return;

      if (activeWorkspaceMode === 'shared') {
        if (!supabaseClient || !activeSharedWorkspace?.owner_id) {
          showUndoToast('Không xác định được không gian chia sẻ để điểm danh.');
          return;
        }
        const updates = students.map(s => {
          const found = findStudentAndClassById(s.id);
          return {
            class_id: found?.classId || s._classId || currentClassId,
            student_id: s.id,
            date: activeAttendanceDate,
            status: targetStatus
          };
        }).filter(u => Boolean(u.class_id));

        try {
          const { data, error } = await supabaseClient.rpc('member_update_attendance', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: updates
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi lưu điểm danh hàng loạt.');
            await reloadActiveSharedWorkspaceQuietly();
            return;
          }
          students.forEach(s => {
            if (!s.attendanceHistory) s.attendanceHistory = {};
            s.attendanceHistory[activeAttendanceDate] = targetStatus;
            if (targetStatus !== 'present' && Array.isArray(s.paidSessions)) {
              s.paidSessions = s.paidSessions.filter(d => d !== activeAttendanceDate);
            }
          });
          students = getStudentsForClass(currentClassId);
          syncFinanceDatesForCurrentClass();
          if (targetStatus === 'present' && activeAttendanceDate && !selectedFinanceDates.includes(activeAttendanceDate)) {
            selectedFinanceDates.push(activeAttendanceDate);
            updateFinanceDateBadge();
          }
          renderAttendanceTab();
          renderFinanceTab();
          renderHomeTab();
          showUndoToast(`Đã điểm danh tất cả đi học buổi ${activeAttendanceDate}!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi lưu điểm danh.');
          await reloadActiveSharedWorkspaceQuietly();
        }
        return;
      }

      students.forEach(s => {
        if (!s.attendanceHistory) s.attendanceHistory = {};
        s.attendanceHistory[activeAttendanceDate] = targetStatus;
        if (targetStatus !== 'present' && Array.isArray(s.paidSessions)) {
          s.paidSessions = s.paidSessions.filter(d => d !== activeAttendanceDate);
        }
      });
      students = getStudentsForClass(currentClassId);
      syncFinanceDatesForCurrentClass();
      if (targetStatus === 'present' && activeAttendanceDate && !selectedFinanceDates.includes(activeAttendanceDate)) {
        selectedFinanceDates.push(activeAttendanceDate);
        updateFinanceDateBadge();
      }
      saveAllToLocalStorage(true);
      renderAttendanceTab();
      renderFinanceTab();
      showUndoToast(`Đã điểm danh tất cả đi học buổi ${activeAttendanceDate}!`);
    }

    function toggleStudentAttendanceSelection(studentId, checked) {
      if (checked) {
        if (!selectedAttendanceStudentIds.includes(studentId)) selectedAttendanceStudentIds.push(studentId);
      } else {
        selectedAttendanceStudentIds = selectedAttendanceStudentIds.filter(id => id !== studentId);
      }
      updateAttendanceBulkActionBar();
    }

    function toggleSelectAllAttendance(checked) {
      selectedAttendanceStudentIds = checked ? students.map(s => s.id) : [];
      renderAttendanceTab();
    }

    function clearAttendanceSelection() {
      selectedAttendanceStudentIds = [];
      const masterCb = document.getElementById('selectAllAttendanceCheckbox');
      if (masterCb) masterCb.checked = false;
      renderAttendanceTab();
    }

    function updateAttendanceBulkActionBar() {
      const bar = document.getElementById('attendanceBulkActionBar');
      const countText = document.getElementById('bulkSelectedCountText');
      const masterCb = document.getElementById('selectAllAttendanceCheckbox');
      if (masterCb) {
        masterCb.checked = students.length > 0 && selectedAttendanceStudentIds.length === students.length;
      }
      if (!bar) return;
      if (activeWorkspaceMode === 'shared') {
        bar.classList.add('hidden');
        return;
      }
      if (selectedAttendanceStudentIds.length > 0) {
        bar.classList.remove('hidden');
        if (countText) countText.innerText = `Đã chọn ${selectedAttendanceStudentIds.length} HS`;
      } else {
        bar.classList.add('hidden');
      }
    }

    function openConfirmBulkDeleteModal() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const count = selectedAttendanceStudentIds.length;
      if (count === 0) return;
      openConfirmModal(`Xóa ${count} học sinh đã chọn?`, 'Dữ liệu của các học sinh này sẽ bị xóa khỏi lớp.', () => {
        const toDelete = new Set(selectedAttendanceStudentIds);
        Object.keys(classStudentsMap).forEach(cId => {
          classStudentsMap[cId] = (classStudentsMap[cId] || []).filter(s => !toDelete.has(s.id));
        });
        selectedAttendanceStudentIds = [];
        students = getStudentsForClass(currentClassId);
        saveAllToLocalStorage(true);
        renderAll();
        showUndoToast(`Đã xóa ${count} học sinh.`);
      });
    }

    // ==================== QUẢN LÝ LỚP HỌC ====================
    let formSchedulesState = { new: [], edit: [] };
    let activeYtDropdownTarget = null;

    const CLASS_THEME_PALETTES = [
      { colorBg: 'bg-[#e8fbf0] hover:bg-[#d5f8e3] border-[#6ee7b7] text-slate-900', badgeColor: 'bg-[#10b981] text-white' },
      { colorBg: 'bg-[#fef9c3]/70 hover:bg-[#fef08a] border-[#facc15] text-slate-900', badgeColor: 'bg-[#f59e0b] text-white' },
      { colorBg: 'bg-[#e0f2fe]/80 hover:bg-[#bae6fd] border-[#38bdf8] text-slate-900', badgeColor: 'bg-[#0284c7] text-white' },
      { colorBg: 'bg-[#ffedd5]/80 hover:bg-[#fed7aa] border-[#fb923c] text-slate-900', badgeColor: 'bg-[#ea580c] text-white' },
      { colorBg: 'bg-[#f3e8ff]/80 hover:bg-[#e9d5ff] border-[#c084fc] text-slate-900', badgeColor: 'bg-[#9333ea] text-white' }
    ];

    function renderDayPills(prefix) {
      const container = document.getElementById(`${prefix}ClassDayPills`);
      if (!container) return;
      const selectedDays = formSchedulesState[prefix].map(s => s.day);
      container.innerHTML = DAYS_OF_WEEK.map(day => {
        const isSelected = selectedDays.includes(day);
        return `
          <button
            type="button"
            onclick="toggleScheduleDay('${prefix}', '${day}')"
            class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
              isSelected
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }"
          >
            ${day}
          </button>
        `;
      }).join('');
      renderScheduleSlotCards(prefix);
    }

    function openCreateClassModal() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      document.getElementById('newClassNameInput').value = '';
      document.getElementById('newClassFeeInput').value = 40000;
      document.getElementById('newClassRoomInput').value = 'P.101';
      document.getElementById('newClassCodeInput').value = '';
      document.getElementById('newClassPasswordInput').value = '';
      formSchedulesState.new = [{ day: 'Thứ 3', startTime: '18:00', endTime: '19:30' }];
      renderDayPills('new');
      openModal('modalCreateClass');
    }

    function handleCreateClass(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const name = document.getElementById('newClassNameInput')?.value.trim();
      const fee = Number(document.getElementById('newClassFeeInput')?.value) || 40000;
      const room = document.getElementById('newClassRoomInput')?.value.trim() || 'P.101';
      const code = document.getElementById('newClassCodeInput')?.value.trim().toUpperCase() || 'TA';
      const classPassword = document.getElementById('newClassPasswordInput')?.value.trim() || '';
      const schedules = JSON.parse(JSON.stringify(formSchedulesState.new));
      if (schedules.length === 0) {
        showUndoToast('Vui lòng chọn ít nhất 1 ngày học!');
        return;
      }

      const palette = CLASS_THEME_PALETTES[classesList.length % CLASS_THEME_PALETTES.length];
      const firstSlot = schedules[0];
      const newClass = {
        id: `class_${Date.now()}`,
        class_name: name,
        code,
        room,
        classPassword,
        schedules,
        days: schedules.map(s => s.day),
        timeSlot: `${firstSlot.startTime.replace(':', 'h')} - ${firstSlot.endTime.replace(':', 'h')}`,
        colorBg: palette.colorBg,
        badgeColor: palette.badgeColor,
        fee_per_session: fee
      };

      classesList.push(newClass);
      classStudentsMap[newClass.id] = [];
      currentClassId = newClass.id;
      isClassSelected = true;
      students = [];
      saveUiNavigationState();
      saveAllToLocalStorage(true);
      closeModal('modalCreateClass');
      renderAll();
      showUndoToast(`Đã tạo lớp ${name}!`);
    }

    function openEditClassModal(targetClsId = null) {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      if (targetClsId) {
        currentClassId = targetClsId;
      }
      const cls = classesList.find(c => c.id === currentClassId);
      if (!cls) return;
      document.getElementById('editClassNameInput').value = cls.class_name || '';
      document.getElementById('editClassFeeInput').value = cls.fee_per_session || 40000;
      document.getElementById('editClassRoomInput').value = cls.room || 'P.101';
      document.getElementById('editClassCodeInput').value = cls.code || '';
      document.getElementById('editClassPasswordInput').value = cls.classPassword || '';
      formSchedulesState.edit = Array.isArray(cls.schedules) && cls.schedules.length > 0
        ? JSON.parse(JSON.stringify(cls.schedules))
        : [{ day: 'Thứ 3', startTime: '18:00', endTime: '19:30' }];
      renderDayPills('edit');
      openModal('modalEditClass');
    }

    function handleEditClass(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const cls = classesList.find(c => c.id === currentClassId);
      if (!cls) return;
      const schedules = JSON.parse(JSON.stringify(formSchedulesState.edit));
      if (schedules.length === 0) {
        showUndoToast('Vui lòng chọn ít nhất 1 ngày học!');
        return;
      }
      cls.class_name = document.getElementById('editClassNameInput')?.value.trim() || cls.class_name;
      cls.fee_per_session = Number(document.getElementById('editClassFeeInput')?.value) || 40000;
      cls.room = document.getElementById('editClassRoomInput')?.value.trim() || 'P.101';
      cls.code = document.getElementById('editClassCodeInput')?.value.trim().toUpperCase() || 'TA';
      cls.classPassword = document.getElementById('editClassPasswordInput')?.value.trim() || '';
      cls.schedules = schedules;
      cls.days = schedules.map(s => s.day);
      cls.timeSlot = `${schedules[0].startTime.replace(':', 'h')} - ${schedules[0].endTime.replace(':', 'h')}`;

      saveAllToLocalStorage(true);
      closeModal('modalEditClass');
      renderAll();
      showUndoToast(`Đã cập nhật thông tin lớp ${cls.class_name}!`);
    }

    function handleDeleteCurrentClass() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const cls = classesList.find(c => c.id === currentClassId);
      if (!cls) return;
      openConfirmModal(`Xóa lớp ${cls.class_name}?`, 'Toàn bộ danh sách học sinh của lớp này cũng sẽ bị xóa.', () => {
        classesList = classesList.filter(c => c.id !== cls.id);
        delete classStudentsMap[cls.id];
        currentClassId = classesList.length > 0 ? classesList[0].id : null;
        isClassSelected = false;
        students = getStudentsForClass(currentClassId);
        saveUiNavigationState();
        saveAllToLocalStorage(true);
        closeModal('modalEditClass');
        renderAll();
        showUndoToast(`Đã xóa lớp ${cls.class_name}.`);
      });
    }

    function toggleScheduleDay(prefix, day) {
      const idx = formSchedulesState[prefix].findIndex(s => s.day === day);
      if (idx >= 0) formSchedulesState[prefix].splice(idx, 1);
      else {
        const sample = formSchedulesState[prefix][0] || { startTime: '18:00', endTime: '19:30' };
        formSchedulesState[prefix].push({ day, startTime: sample.startTime, endTime: sample.endTime });
        formSchedulesState[prefix].sort((a, b) => DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day));
      }
      renderDayPills(prefix);
    }

    function renderScheduleSlotCards(prefix) {
      const container = document.getElementById(`${prefix}ClassDayScheduleSlots`);
      if (!container) return;
      if (formSchedulesState[prefix].length === 0) {
        container.innerHTML = `<div class="p-3 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">Chưa chọn ngày học nào.</div>`;
        return;
      }
      container.innerHTML = formSchedulesState[prefix].map((item, idx) => `
        <div class="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-sm">
          <div class="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-xs sm:text-sm text-slate-900">${item.day}</span>
              ${formSchedulesState[prefix].length > 1 ? `<button type="button" onclick="copyScheduleTimeToAll('${prefix}', ${idx})" class="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/80">Áp dụng tất cả</button>` : ''}
            </div>
            <button type="button" onclick="toggleScheduleDay('${prefix}', '${item.day}')" class="w-6 h-6 rounded-md text-slate-400 hover:text-rose-500 flex items-center justify-center"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
          </div>
          <div class="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span class="text-slate-500">Từ:</span>
            <div id="yt_time_box_${prefix}_${idx}_startTime" class="relative flex items-center bg-white border border-slate-300 rounded-xl">
              <input type="text" value="${item.startTime}" maxlength="5" oninput="formSchedulesState['${prefix}'][${idx}].startTime=this.value" class="w-16 px-2 py-1.5 text-sm font-extrabold text-slate-900 text-center font-mono bg-transparent focus:outline-none">
              <button type="button" onclick="openYtDropdown(event, '${prefix}', ${idx}, 'startTime')" class="pr-2 py-1.5 text-slate-400 hover:text-slate-700"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            </div>
            <span>đến</span>
            <div id="yt_time_box_${prefix}_${idx}_endTime" class="relative flex items-center bg-white border border-slate-300 rounded-xl">
              <input type="text" value="${item.endTime}" maxlength="5" oninput="formSchedulesState['${prefix}'][${idx}].endTime=this.value" class="w-16 px-2 py-1.5 text-sm font-extrabold text-slate-900 text-center font-mono bg-transparent focus:outline-none">
              <button type="button" onclick="openYtDropdown(event, '${prefix}', ${idx}, 'endTime')" class="pr-2 py-1.5 text-slate-400 hover:text-slate-700"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            </div>
          </div>
        </div>
      `).join('');
      safeCreateIcons();
    }

    function openYtDropdown(event, prefix, slotIdx, field) {
      event.stopPropagation();
      const dropdown = document.getElementById('ytTimeDropdown');
      const listEl = document.getElementById('ytTimeOptionsList');
      if (!dropdown || !listEl) return;
      activeYtDropdownTarget = { prefix, slotIdx, field };
      const currentVal = formSchedulesState[prefix][slotIdx][field] || '18:00';
      listEl.innerHTML = YT_TIME_OPTIONS.map(t => `<button type="button" onclick="selectYtTimeOption('${t}')" class="w-full text-center px-2 py-2 text-sm font-mono font-extrabold hover:bg-indigo-50 ${t === currentVal ? 'bg-indigo-100 text-indigo-700' : 'text-slate-800'}">${t}</button>`).join('');
      const box = document.getElementById(`yt_time_box_${prefix}_${slotIdx}_${field}`);
      const rect = box ? box.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
      dropdown.classList.remove('hidden');
      dropdown.style.width = `${rect.width}px`;
      dropdown.style.top = `${Math.min(window.innerHeight - 250, rect.bottom + 4)}px`;
      dropdown.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, rect.left))}px`;
    }

    function selectYtTimeOption(timeVal) {
      if (!activeYtDropdownTarget) return;
      const { prefix, slotIdx, field } = activeYtDropdownTarget;
      formSchedulesState[prefix][slotIdx][field] = timeVal;
      if (field === 'startTime') {
        const [sh, sm] = timeVal.split(':').map(Number);
        const totalMin = Math.min(1435, sh * 60 + sm + 90);
        formSchedulesState[prefix][slotIdx].endTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      }
      renderScheduleSlotCards(prefix);
      closeYtDropdown();
    }

    function closeYtDropdown() {
      document.getElementById('ytTimeDropdown')?.classList.add('hidden');
      activeYtDropdownTarget = null;
    }

    function handleGlobalClick(e) {
      const dropdown = document.getElementById('ytTimeDropdown');
      if (dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target)) {
        closeYtDropdown();
      }
    }

    function copyScheduleTimeToAll(prefix, sourceIdx) {
      const src = formSchedulesState[prefix][sourceIdx];
      if (!src) return;
      formSchedulesState[prefix].forEach((item, idx) => {
        if (idx !== sourceIdx) { item.startTime = src.startTime; item.endTime = src.endTime; }
      });
      renderScheduleSlotCards(prefix);
    }

    // ==================== THÊM HỌC SINH (1 EM & NẠP EXCEL/WORD) ====================
    let parsedBatchStudents = [];

    function switchAddStudentTab(mode) {
      const singleForm = document.getElementById('formAddSingleStudent');
      const batchForm = document.getElementById('formAddBatchStudent');
      const singleBtn = document.getElementById('tabBtnAddSingle');
      const batchBtn = document.getElementById('tabBtnAddBatch');
      if (mode === 'single') {
        singleForm?.classList.remove('hidden');
        batchForm?.classList.add('hidden');
        singleBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        batchBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
      } else {
        singleForm?.classList.add('hidden');
        batchForm?.classList.remove('hidden');
        batchBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        singleBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        const batchSel = document.getElementById('batchStudentTargetClassSelect');
        if (batchSel) {
          batchSel.innerHTML = classesList.map(c => `<option value="${c.id}" ${c.id === currentClassId ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('');
          onBatchClassChanged(batchSel.value);
        }
      }
      safeCreateIcons();
    }

    function onBatchClassChanged(targetClassId) {
      const cls = classesList.find(c => c.id === targetClassId);
      const feeInput = document.getElementById('batchStudentFeeInput');
      if (cls && feeInput) feeInput.value = cls.fee_per_session || 40000;
    }

    function onNewStudentClassChanged(targetClassId) {
      const cls = classesList.find(c => c.id === targetClassId);
      const feeInput = document.getElementById('newStudentFeePerSession');
      if (cls && feeInput) feeInput.value = cls.fee_per_session || 40000;
    }

    function openAddStudentModal(initialTab = 'single') {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      if (classesList.length === 0) {
        showUndoToast('Vui lòng tạo lớp học trước khi thêm học sinh!');
        openCreateClassModal();
        return;
      }
      const sel = document.getElementById('newStudentClassSelect');
      if (sel) {
        sel.innerHTML = classesList.map(c => `<option value="${c.id}" ${c.id === currentClassId ? 'selected' : ''}>${escapeHtml(c.class_name)}</option>`).join('');
      }
      const curCls = classesList.find(c => c.id === currentClassId) || classesList[0];
      document.getElementById('newStudentName').value = '';
      document.getElementById('newStudentFeePerSession').value = curCls?.fee_per_session || 40000;
      document.getElementById('newStudentParentPhone').value = '';
      document.getElementById('newStudentParentName').value = '';
      document.getElementById('newStudentDob').value = '';
      document.getElementById('newStudentSchool').value = '';
      parsedBatchStudents = [];
      renderBatchPreviewTable();
      switchAddStudentTab(initialTab);
      openModal('modalAddStudent');
    }

    function handleCreateStudent(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      if (!checkCanAddStudents(1)) return;

      const targetClassId = document.getElementById('newStudentClassSelect')?.value || classesList[0]?.id;
      const name = document.getElementById('newStudentName')?.value.trim();
      const fee = Number(document.getElementById('newStudentFeePerSession')?.value) || 40000;
      const parentPhone = document.getElementById('newStudentParentPhone')?.value.trim() || '';
      const parentName = document.getElementById('newStudentParentName')?.value.trim() || '';
      const dob = document.getElementById('newStudentDob')?.value.trim() || '';
      const school = document.getElementById('newStudentSchool')?.value.trim() || '';

      const initHist = {};
      getCurrentClassSessionDates(targetClassId).forEach(d => { initHist[d] = 'unrecorded'; });

      if (!classStudentsMap[targetClassId]) classStudentsMap[targetClassId] = [];
      classStudentsMap[targetClassId].push({
        id: `HS_${Date.now()}`,
        studentCode: generateUniqueStudentCode(),
        name,
        pricePerSession: fee,
        parentPhone,
        parentName,
        dob,
        school,
        status: 'unrecorded',
        paidSessions: [],
        attendanceHistory: initHist
      });

      if (currentClassId !== ALL_CLASSES_ID) currentClassId = targetClassId;
      isClassSelected = true;
      students = getStudentsForClass(currentClassId);
      saveUiNavigationState();
      saveAllToLocalStorage(true);
      closeModal('modalAddStudent');
      renderAll();
      showUndoToast(`Đã thêm học sinh ${name}!`);
      checkAndNotifyQuotaThreshold();
    }

    function downloadStudentExcelTemplate() {
      if (typeof XLSX === 'undefined') return;
      const ws = XLSX.utils.aoa_to_sheet([
        ['STT', 'Họ và tên', 'SĐT Phụ huynh', 'Tên phụ huynh', 'Ngày sinh', 'Trường học'],
        [1, 'Nguyễn Văn An', '0912345678', 'Anh Tuấn', '12/05/2012', 'THCS Chu Văn An']
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'HocSinh');
      XLSX.writeFile(wb, 'Mau_Danh_Sach_Hoc_Sinh.xlsx');
    }

    async function handleStudentFileUpload(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

        const norm = (s) => String(s ?? '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd').replace(/Đ/g, 'D')
          .toLowerCase().replace(/\s+/g, ' ').trim();

        const isNameHeader = (t) =>
          !/(phu huynh|truong|lop)/.test(t) &&
          (/(ho va ten|ho ten|ten hoc sinh|hoc sinh|full name)/.test(t) || t === 'ten' || t === 'name');

        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const cells = (rows[i] || []).map(norm);
          const hasFull = cells.some(isNameHeader);
          const hasSplit = cells.some(t => ['ho', 'ho dem', 'ho va ten dem'].includes(t)) &&
                           cells.some(t => ['ten', 'ten goi', 'ten hs'].includes(t));
          if (hasFull || hasSplit) { headerRowIdx = i; break; }
        }

        const skipNames = new Set(['ho va ten', 'ho ten', 'lop', 'stt', 'tong', 'tong cong', 'cong']);

        if (headerRowIdx >= 0) {
          const hdr = (rows[headerRowIdx] || []).map(norm);
          const nameIdx = hdr.findIndex(isNameHeader);
          const hoIdx = nameIdx === -1 ? hdr.findIndex(t => ['ho', 'ho dem', 'ho va ten dem'].includes(t)) : -1;
          const tenIdx = nameIdx === -1 ? hdr.findIndex(t => ['ten', 'ten goi', 'ten hs'].includes(t)) : -1;
          const phoneIdx = hdr.findIndex(t => /(sdt|so dien thoai|dien thoai|phone|zalo|lien he)/.test(t));
          const parentIdx = hdr.findIndex(t => /(phu huynh|bo me|cha me|parent)/.test(t));
          const dobIdx = hdr.findIndex(t => /(ngay sinh|nam sinh|sinh nhat|dob)/.test(t));
          const schoolIdx = hdr.findIndex(t => /(truong|ghi chu|note|school)/.test(t));

          parsedBatchStudents = rows.slice(headerRowIdx + 1).map(r => {
            const rawName = nameIdx >= 0
              ? String(r[nameIdx] ?? '').trim()
              : `${String(r[hoIdx] ?? '').trim()} ${String(r[tenIdx] ?? '').trim()}`.trim();
            return {
              selected: true,
              name: rawName,
              phone: phoneIdx >= 0 ? String(r[phoneIdx] ?? '').trim() : '',
              parentName: parentIdx >= 0 ? String(r[parentIdx] ?? '').trim() : '',
              dob: dobIdx >= 0 ? String(r[dobIdx] ?? '').trim() : '',
              school: schoolIdx >= 0 ? String(r[schoolIdx] ?? '').trim() : ''
            };
          });
        } else {
          parsedBatchStudents = rows.map(r => {
            const cells = (r || []).map(c => String(c ?? '').trim()).filter(Boolean);
            const phone = cells.find(c => /^(0|84)\d{8,10}$/.test(c.replace(/[\s.\-]/g, ''))) || '';
            const name = cells.find(c => c !== phone && isNaN(Number(c.replace(/[\s.,]/g, '')))) || '';
            return { selected: true, name, phone, parentName: '', dob: '', school: '' };
          });
        }

        parsedBatchStudents = parsedBatchStudents.filter(x => {
          const n = norm(x.name);
          return x.name && !skipNames.has(n) && !/^\d+$/.test(x.name.replace(/[\s.,]/g, ''));
        });

        renderBatchPreviewTable();
      } else if (fileName.endsWith('.docx') && typeof mammoth !== 'undefined') {
        const buf = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        document.getElementById('batchStudentPasteTextarea').value = res.value || '';
        handleStudentPasteInput();
      }

      e.target.value = '';
    }

    function handleStudentPasteInput() {
      const raw = document.getElementById('batchStudentPasteTextarea')?.value || '';
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      parsedBatchStudents = lines.map(line => {
        const parts = line.split(/[\t\-]+/).map(p => p.trim()).filter(Boolean);
        const cleanName = (parts[0] || '').replace(/^\d+[\.\)\-\s]+/, '').trim();
        return { selected: true, name: cleanName, phone: parts[1] || '', parentName: parts[2] || '', dob: '', school: parts[3] || '' };
      }).filter(x => x.name.length >= 2);
      renderBatchPreviewTable();
    }

    function renderBatchPreviewTable() {
      const wrapper = document.getElementById('batchPreviewWrapper');
      const tbody = document.getElementById('batchPreviewTableBody');
      const badge = document.getElementById('batchPreviewCountBadge');
      const btn = document.getElementById('btnConfirmBatchImport');
      if (!wrapper || !tbody) return;
      if (parsedBatchStudents.length === 0) {
        wrapper.classList.add('hidden');
        if (btn) btn.disabled = true;
        return;
      }
      wrapper.classList.remove('hidden');
      const count = parsedBatchStudents.filter(s => s.selected).length;
      if (badge) badge.innerText = `Đã nhận diện ${parsedBatchStudents.length} học sinh (chọn ${count} em)`;
      if (btn) btn.disabled = count === 0;
      tbody.innerHTML = parsedBatchStudents.map((s, idx) => `
        <tr>
          <td class="py-1 px-2 text-center"><input type="checkbox" ${s.selected ? 'checked' : ''} onchange="parsedBatchStudents[${idx}].selected=this.checked;renderBatchPreviewTable()"></td>
          <td class="py-1 px-2 font-bold">${escapeHtml(s.name)}</td>
          <td class="py-1 px-2 font-mono">${escapeHtml(s.phone || '--')}</td>
          <td class="py-1 px-2">${escapeHtml(s.parentName || '--')}</td>
          <td class="py-1 px-2">${escapeHtml(s.school || '--')}</td>
          <td class="py-1 px-1 text-center"><button type="button" onclick="parsedBatchStudents.splice(${idx},1);renderBatchPreviewTable()" class="text-rose-500">×</button></td>
        </tr>
      `).join('');
    }

    function toggleSelectAllBatchPreview(checked) {
      parsedBatchStudents.forEach(s => { s.selected = checked; });
      renderBatchPreviewTable();
    }

    function handleConfirmBatchImport() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const targetClassId = document.getElementById('batchStudentTargetClassSelect')?.value || classesList[0]?.id;
      const fee = Number(document.getElementById('batchStudentFeeInput')?.value) || 40000;
      const selected = parsedBatchStudents.filter(s => s.selected && s.name);
      if (selected.length === 0) return;
      if (!checkCanAddStudents(selected.length)) return;

      if (!classStudentsMap[targetClassId]) classStudentsMap[targetClassId] = [];
      const dates = getCurrentClassSessionDates(targetClassId);

      selected.forEach((item, i) => {
        const hist = {};
        dates.forEach(d => { hist[d] = 'unrecorded'; });
        classStudentsMap[targetClassId].push({
          id: `HS_${Date.now()}_${i}`,
          studentCode: generateUniqueStudentCode(),
          name: item.name,
          pricePerSession: fee,
          parentPhone: item.phone || '',
          parentName: item.parentName || '',
          dob: item.dob || '',
          school: item.school || '',
          status: 'unrecorded',
          paidSessions: [],
          attendanceHistory: hist
        });
      });

      if (currentClassId !== ALL_CLASSES_ID) currentClassId = targetClassId;
      isClassSelected = true;
      students = getStudentsForClass(currentClassId);
      saveUiNavigationState();
      saveAllToLocalStorage(true);
      closeModal('modalAddStudent');
      renderAll();
      showUndoToast(`Đã nạp ${selected.length} học sinh vào lớp!`);
      checkAndNotifyQuotaThreshold();
    }

    let activeDetailStudent = null;

    function openStudentDetailModal(studentId) {
      const found = findStudentAndClassById(studentId);
      const s = found ? found.student : students.find(x => x.id === studentId);
      if (!s) return;
      activeDetailStudent = s;

      const isShared = activeWorkspaceMode === 'shared';
      const canViewContacts = !isShared || activeSharedWorkspace?.can_view_contacts === true;

      document.getElementById('detailStudentHeaderTitle').innerText = `Hồ sơ: ${s.name}`;
      document.getElementById('detailStudentCodeBadge').innerText = s.studentCode || '--';
      document.getElementById('editStudentName').value = s.name || '';
      document.getElementById('editStudentFeePerSession').value = s.pricePerSession || 40000;
      document.getElementById('editStudentParentPhone').value = canViewContacts ? (s.parentPhone || '') : '';
      document.getElementById('editStudentParentName').value = canViewContacts ? (s.parentName || '') : '';

      document.getElementById('editStudentName').disabled = isShared;
      document.getElementById('editStudentFeePerSession').disabled = isShared;
      document.getElementById('editStudentParentPhone').disabled = isShared;
      document.getElementById('editStudentParentName').disabled = isShared;
      document.querySelector('#modalStudentDetail form button[type="submit"]')?.classList.toggle('hidden', isShared);

      const grid = document.getElementById('detailSessionHistoryGrid');
      const targetClassId = found ? found.classId : (s._classId || currentClassId);
      const classDates = getCurrentClassSessionDates(targetClassId);
      const hist = s.attendanceHistory || {};

      if (grid) {
        if (classDates.length === 0) {
          grid.innerHTML = `<div class="col-span-full text-xs text-slate-400 italic">Chưa có buổi học nào trong lịch.</div>`;
        } else {
          grid.innerHTML = classDates.slice(-16).map(d => {
            const st = hist[d] || 'unrecorded';
            const clsStyle = st === 'present'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : (st === 'absent' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-500');
            const label = st === 'present' ? '✓ Đi học' : (st === 'absent' ? '✗ Vắng' : 'Chưa ghi');
            return `
              <button
                type="button"
                onclick="toggleDetailStudentHistory('${d}')"
                class="p-2 rounded-xl border text-center text-xs transition hover:scale-[1.02] active:scale-95 ${clsStyle}"
              >
                <div class="font-mono font-bold">${d.slice(0, 5)}</div>
                <div class="font-extrabold text-[11px] mt-0.5">${label}</div>
              </button>
            `;
          }).join('');
        }
      }

      applySharedWorkspaceUiRestrictions();
      openModal('modalStudentDetail');
    }

    function copyDetailStudentCode() {
      const code = document.getElementById('detailStudentCodeBadge')?.innerText || '';
      if (!code || code === '--') return;
      copyTextToClipboardFallback(code, `Đã sao chép mã học sinh: ${code}`);
    }

    async function toggleDetailStudentHistory(dateStr) {
      if (!activeDetailStudent) return;
      if (!activeDetailStudent.attendanceHistory) activeDetailStudent.attendanceHistory = {};
      const cur = activeDetailStudent.attendanceHistory[dateStr] || 'unrecorded';
      const nextStatus = cur === 'unrecorded' ? 'present' : (cur === 'present' ? 'absent' : 'unrecorded');

      if (activeWorkspaceMode === 'shared') {
        const found = findStudentAndClassById(activeDetailStudent.id);
        const targetClassId = found?.classId || activeDetailStudent._classId || currentClassId;
        if (!supabaseClient || !activeSharedWorkspace?.owner_id || !targetClassId) return;
        try {
          const { data, error } = await supabaseClient.rpc('member_update_attendance', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: [{
              class_id: targetClassId,
              student_id: activeDetailStudent.id,
              date: dateStr,
              status: nextStatus
            }]
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi cập nhật điểm danh.');
            await reloadActiveSharedWorkspaceQuietly();
            return;
          }
          activeDetailStudent.attendanceHistory[dateStr] = nextStatus;
          if (nextStatus !== 'present' && Array.isArray(activeDetailStudent.paidSessions)) {
            activeDetailStudent.paidSessions = activeDetailStudent.paidSessions.filter(d => d !== dateStr);
          }
          students = getStudentsForClass(currentClassId);
          syncFinanceDatesForCurrentClass();
          if (nextStatus === 'present' && !selectedFinanceDates.includes(dateStr)) {
            selectedFinanceDates.push(dateStr);
            updateFinanceDateBadge();
          }
          openStudentDetailModal(activeDetailStudent.id);
          renderAttendanceTab();
          renderFinanceTab();
          renderHomeTab();
        } catch (err) {
          showUndoToast('Lỗi kết nối khi cập nhật điểm danh.');
          await reloadActiveSharedWorkspaceQuietly();
        }
        return;
      }

      activeDetailStudent.attendanceHistory[dateStr] = nextStatus;
      if (nextStatus !== 'present' && Array.isArray(activeDetailStudent.paidSessions)) {
        activeDetailStudent.paidSessions = activeDetailStudent.paidSessions.filter(d => d !== dateStr);
      }
      students = getStudentsForClass(currentClassId);
      syncFinanceDatesForCurrentClass();
      if (nextStatus === 'present' && !selectedFinanceDates.includes(dateStr)) {
        selectedFinanceDates.push(dateStr);
        updateFinanceDateBadge();
      }
      saveAllToLocalStorage(true);
      openStudentDetailModal(activeDetailStudent.id);
      renderAttendanceTab();
      renderFinanceTab();
    }

    function handleSaveStudentProfile(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') {
        showUndoToast('Thành viên phụ không có quyền chỉnh sửa hồ sơ học sinh.');
        return;
      }
      if (!activeDetailStudent) return;
      activeDetailStudent.name = document.getElementById('editStudentName').value.trim();
      activeDetailStudent.pricePerSession = Number(document.getElementById('editStudentFeePerSession').value) || 40000;
      activeDetailStudent.parentPhone = document.getElementById('editStudentParentPhone').value.trim();
      activeDetailStudent.parentName = document.getElementById('editStudentParentName').value.trim();
      students = getStudentsForClass(currentClassId);
      saveAllToLocalStorage(true);
      closeModal('modalStudentDetail');
      renderAll();
      showUndoToast('Đã lưu thông tin học sinh!');
    }

    function openConfirmSingleDeleteModal() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      if (!activeDetailStudent) return;
      const target = activeDetailStudent;
      openConfirmModal(`Xóa học sinh ${target.name}?`, 'Học sinh này sẽ bị xóa khỏi lớp hiện tại.', () => {
        Object.keys(classStudentsMap).forEach(cId => {
          classStudentsMap[cId] = (classStudentsMap[cId] || []).filter(s => s.id !== target.id);
        });
        students = getStudentsForClass(currentClassId);
        saveAllToLocalStorage(true);
        closeModal('modalStudentDetail');
        renderAll();
        showUndoToast(`Đã xóa học sinh ${target.name}.`);
      });
    }

    function renderClassesManagementTab() {
      const btnWsMembers = document.getElementById('btnOpenWorkspaceMembers');
      if (btnWsMembers) {
        const canShowMembersBtn = Boolean(currentUser && currentUser.id && activeWorkspaceMode === 'own');
        btnWsMembers.classList.toggle('hidden', !canShowMembersBtn);
      }

      const container = document.getElementById('classesManagementList');
      if (!container) return;

      const isShared = activeWorkspaceMode === 'shared';
      const canSeeFee = !isShared || activeSharedWorkspace?.can_manage_finance === true;

      if (classesList.length === 0) {
        const emptyMsg = isShared
          ? 'Chủ lớp chưa phân công lớp nào cho bạn'
          : "Chưa có lớp học nào. Bấm 'Tạo lớp' để thêm mới.";
        container.innerHTML = `
          <div class="col-span-full bg-white rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center space-y-2.5">
            <div class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <i data-lucide="layout-grid" class="w-5 h-5"></i>
            </div>
            <p class="text-xs sm:text-sm font-bold text-slate-500">${escapeHtml(emptyMsg)}</p>
            ${isShared ? '' : `
              <button
                type="button"
                onclick="openCreateClassModal()"
                class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition active:scale-95 inline-flex items-center gap-1.5"
              >
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Tạo lớp đầu tiên</span>
              </button>
            `}
          </div>
        `;
        applySharedWorkspaceUiRestrictions();
        safeCreateIcons();
        return;
      }

      container.innerHTML = [...classesList].sort((a, b) => String(a.class_name || '').localeCompare(String(b.class_name || ''), 'vi', { numeric: true, sensitivity: 'base' })).map(cls => {
        const count = (classStudentsMap[cls.id] || []).length;
        const schedules = Array.isArray(cls.schedules) && cls.schedules.length > 0
          ? cls.schedules
          : [];
        const scheduleText = schedules.length > 0
          ? schedules.map(s => `${s.day} (${String(s.startTime || '').replace(':', 'h')} - ${String(s.endTime || '').replace(':', 'h')})`).join(' • ')
          : (cls.timeSlot || 'Chưa xếp lịch');

        return `
          <div
            onclick="onClassChange('${escapeHtml(cls.id)}'); switchTab('attendance');"
            class="rounded-2xl border p-3.5 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between gap-3 ${cls.colorBg || 'bg-white border-slate-200'}"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <h4 class="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                ${escapeHtml(cls.class_name)}
              </h4>
              <div class="text-xs font-semibold text-slate-700 truncate">
                ${escapeHtml(scheduleText)}
              </div>
              <div class="text-[11px] font-bold text-slate-500">
                ${count} học sinh${cls.room ? ` • ${escapeHtml(cls.room)}` : ''}
              </div>
            </div>

            ${isShared ? '' : `
              <button
                type="button"
                onclick="event.stopPropagation(); openEditClassModal('${escapeHtml(cls.id)}');"
                class="px-3 py-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-800 border border-black/15 text-xs font-extrabold inline-flex items-center gap-1 shadow-2xs transition active:scale-95 shrink-0"
                title="Chỉnh sửa lớp học"
              >
                <i data-lucide="pencil" class="w-3 h-3 text-violet-600"></i>
                <span>Sửa</span>
              </button>
            `}
          </div>
        `;
      }).join('');

      applySharedWorkspaceUiRestrictions();
      safeCreateIcons();
    }

    // ==================== SỔ TAY GHI CHÚ NHANH ====================
    function openNotebookModal() {
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      editingNotebookNoteId = null;
      const titleInp = document.getElementById('notebookNoteTitleInput');
      const contentInp = document.getElementById('notebookNoteContentInput');
      const cancelBtn = document.getElementById('btnCancelNotebookEdit');
      const saveLbl = document.getElementById('btnSaveNotebookNoteLabel');
      if (titleInp) titleInp.value = '';
      if (contentInp) contentInp.value = '';
      cancelBtn?.classList.add('hidden');
      if (saveLbl) saveLbl.innerText = 'Lưu ghi chú';
      renderNotebookNotesList();
      openModal('modalNotebook');
    }

    function renderNotebookNotesList() {
      const container = document.getElementById('notebookNotesListContainer');
      if (!container) return;

      if (!Array.isArray(teacherNotebookNotes) || teacherNotebookNotes.length === 0) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Chưa có ghi chú nào. Nhập nội dung phía trên để lưu ghi chú đầu tiên.
          </div>
        `;
        return;
      }

      const sortedNotes = [...teacherNotebookNotes].sort((a, b) => {
        const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        if (pinDiff !== 0) return pinDiff;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });

      container.innerHTML = sortedNotes.map(note => {
        const timeStr = note.updatedAt
          ? new Date(note.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
          : '';
        return `
          <div class="rounded-2xl border p-3 space-y-1.5 transition ${note.pinned ? 'bg-amber-50/70 border-amber-300 shadow-sm' : 'bg-white border-slate-200/90'}">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                ${note.title ? `<h5 class="font-extrabold text-xs text-slate-900 truncate">${escapeHtml(note.title)}</h5>` : ''}
                <p class="text-xs text-slate-700 whitespace-pre-line break-words leading-relaxed ${note.title ? 'mt-0.5' : ''}">${escapeHtml(note.content || '')}</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onclick="togglePinNotebookNote('${escapeHtml(note.id)}')"
                  class="px-2 py-1 rounded-lg text-[10.5px] font-bold border transition ${note.pinned ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 hover:bg-amber-50 text-slate-600 border-slate-200'}"
                  title="${note.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}"
                >
                  ${note.pinned ? 'Bỏ ghim' : 'Ghim'}
                </button>
                <button
                  type="button"
                  onclick="editNotebookNote('${escapeHtml(note.id)}')"
                  class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10.5px] font-bold transition"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onclick="deleteNotebookNote('${escapeHtml(note.id)}')"
                  class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10.5px] font-bold transition"
                >
                  Xóa
                </button>
              </div>
            </div>
            ${timeStr ? `<div class="text-[10px] text-slate-400 font-medium">Cập nhật: ${escapeHtml(timeStr)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    function handleSaveNotebookNote(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') { showUndoToast('Chỉ chủ lớp mới có quyền thực hiện thao tác này.'); return; }
      const titleInp = document.getElementById('notebookNoteTitleInput');
      const contentInp = document.getElementById('notebookNoteContentInput');
      const title = String(titleInp?.value || '').trim();
      const content = String(contentInp?.value || '').trim();
      if (!content) return;

      const nowIso = new Date().toISOString();
      if (editingNotebookNoteId) {
        const target = teacherNotebookNotes.find(n => n.id === editingNotebookNoteId);
        if (target) {
          target.title = title;
          target.content = content;
          target.updatedAt = nowIso;
        }
        editingNotebookNoteId = null;
        showUndoToast('Đã cập nhật ghi chú!');
      } else {
        teacherNotebookNotes.unshift({
          id: `NOTE_${Date.now()}`,
          title,
          content,
          updatedAt: nowIso,
          pinned: false
        });
        showUndoToast('Đã lưu ghi chú mới!');
      }

      if (titleInp) titleInp.value = '';
      if (contentInp) contentInp.value = '';
      document.getElementById('btnCancelNotebookEdit')?.classList.add('hidden');
      const saveLbl = document.getElementById('btnSaveNotebookNoteLabel');
      if (saveLbl) saveLbl.innerText = 'Lưu ghi chú';

      saveAllToLocalStorage(true);
      renderNotebookNotesList();
    }

    function editNotebookNote(noteId) {
      const note = teacherNotebookNotes.find(n => n.id === noteId);
      if (!note) return;
      editingNotebookNoteId = note.id;
      const titleInp = document.getElementById('notebookNoteTitleInput');
      const contentInp = document.getElementById('notebookNoteContentInput');
      const cancelBtn = document.getElementById('btnCancelNotebookEdit');
      const saveLbl = document.getElementById('btnSaveNotebookNoteLabel');
      if (titleInp) titleInp.value = note.title || '';
      if (contentInp) {
        contentInp.value = note.content || '';
        contentInp.focus();
      }
      cancelBtn?.classList.remove('hidden');
      if (saveLbl) saveLbl.innerText = 'Cập nhật ghi chú';
    }

    function cancelEditNotebookNote() {
      editingNotebookNoteId = null;
      const titleInp = document.getElementById('notebookNoteTitleInput');
      const contentInp = document.getElementById('notebookNoteContentInput');
      const cancelBtn = document.getElementById('btnCancelNotebookEdit');
      const saveLbl = document.getElementById('btnSaveNotebookNoteLabel');
      if (titleInp) titleInp.value = '';
      if (contentInp) contentInp.value = '';
      cancelBtn?.classList.add('hidden');
      if (saveLbl) saveLbl.innerText = 'Lưu ghi chú';
    }

    function togglePinNotebookNote(noteId) {
      const note = teacherNotebookNotes.find(n => n.id === noteId);
      if (!note) return;
      note.pinned = !note.pinned;
      saveAllToLocalStorage(true);
      renderNotebookNotesList();
    }

    function deleteNotebookNote(noteId) {
      const note = teacherNotebookNotes.find(n => n.id === noteId);
      if (!note) return;
      openConfirmModal('Xóa ghi chú này?', 'Ghi chú sẽ bị xóa vĩnh viễn khỏi sổ tay của bạn.', () => {
        teacherNotebookNotes = teacherNotebookNotes.filter(n => n.id !== noteId);
        if (editingNotebookNoteId === noteId) {
          cancelEditNotebookNote();
        }
        saveAllToLocalStorage(true);
        renderNotebookNotesList();
        showUndoToast('Đã xóa ghi chú.');
      });
    }

