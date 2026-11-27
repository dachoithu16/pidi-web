    function openExportExcelModal() {
      if (activeWorkspaceMode === 'shared' && !activeSharedWorkspace?.can_view_contacts) { showUndoToast('Bạn không có quyền xuất dữ liệu ở không gian này.'); return; }
      const previewEl = document.getElementById('exportClassPreviewName');
      const monthSel = document.getElementById('exportMonthSelect');
      if (previewEl) {
        if (currentClassId === ALL_CLASSES_ID) {
          previewEl.innerText = `Tổng Lớp (${students.length} HS)`;
        } else {
          const cls = classesList.find(c => c.id === currentClassId);
          previewEl.innerText = cls ? cls.class_name : 'Lớp học';
        }
      }
      if (monthSel) {
        const months = new Set();
        getAllKnownDatesForCurrentScope().forEach(d => {
          const p = d.split('/');
          if (p.length === 3) months.add(`${p[1]}/${p[2]}`);
        });
        const now = new Date();
        const curM = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        if (months.size === 0) months.add(curM);
        monthSel.innerHTML = Array.from(months).map(m => `<option value="${m}" ${m === curM ? 'selected' : ''}>Tháng ${m}</option>`).join('');
      }
      openModal('modalExportExcel');
    }

    function handleExportAttendanceExcel() {
      if (activeWorkspaceMode === 'shared' && !activeSharedWorkspace?.can_view_contacts) { showUndoToast('Bạn không có quyền xuất dữ liệu ở không gian này.'); return; }
      if (typeof XLSX === 'undefined') {
        showUndoToast('Thư viện xuất Excel đang tải, vui lòng thử lại!');
        return;
      }
      const targetMonth = document.getElementById('exportMonthSelect')?.value || '';
      const monthDates = getAllKnownDatesForCurrentScope().filter(d => !targetMonth || d.includes(`/${targetMonth}`));
      const headerRow = ['STT', 'Mã HS', 'Họ và tên', 'Lớp', ...monthDates, 'Tổng buổi đi học', 'Học phí/buổi', 'Tổng học phí'];
      const dataRows = students.map((s, idx) => {
        let presentCount = 0;
        const dateCells = monthDates.map(d => {
          const st = s.attendanceHistory?.[d];
          if (st === 'present') { presentCount++; return 'X'; }
          if (st === 'absent') return 'V';
          return '';
        });
        const price = Number(s.pricePerSession) || 40000;
        return [idx + 1, s.studentCode || '', s.name, s._className || '', ...dateCells, presentCount, price, presentCount * price];
      });
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DiemDanh_HocPhi');
      XLSX.writeFile(wb, `Diem_Danh_Hoc_Phi_${targetMonth.replace('/', '-') || 'All'}.xlsx`);
      closeModal('modalExportExcel');
      showUndoToast('Đã xuất file Excel thành công!');
    }

    // ==================== HỌC PHÍ ====================
    function parseLocalDateInput(yyyyMmDd) {
      if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return null;
      const parts = yyyyMmDd.split('-').map(Number);
      if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function getAllKnownDatesForCurrentScope() {
      const dateSet = new Set(getCurrentClassSessionDates(currentClassId));
      students.forEach(s => {
        if (s.attendanceHistory) {
          Object.keys(s.attendanceHistory).forEach(d => {
            if (s.attendanceHistory[d] === 'present' || s.attendanceHistory[d] === 'absent') {
              dateSet.add(d);
            }
          });
        }
      });
      return Array.from(dateSet).sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
      });
    }

    function syncFinanceDatesForCurrentClass() {
      renderFinanceMonthOptions();
      const classDates = getAllKnownDatesForCurrentScope();
      if (financeFilterMode === 'month') {
        selectedFinanceDates = currentFinanceMonth === 'all'
          ? [...classDates]
          : classDates.filter(d => d.includes(`/${currentFinanceMonth}`));
      } else {
        const fromVal = document.getElementById('financeDateFromInput')?.value;
        const toVal = document.getElementById('financeDateToInput')?.value;
        const fromDate = parseLocalDateInput(fromVal);
        const toDate = parseLocalDateInput(toVal);
        if (fromDate && toDate) {
          toDate.setHours(23, 59, 59, 999);
          selectedFinanceDates = classDates.filter(d => {
            const [day, month, year] = d.split('/').map(Number);
            const cur = new Date(year, month - 1, day);
            return cur >= fromDate && cur <= toDate;
          });
        } else {
          selectedFinanceDates = classDates.filter(d => d.includes(`/${currentFinanceMonth}`));
        }
      }
      updateFinanceDateBadge();
    }

    function renderFinanceMonthOptions() {
      const selectEl = document.getElementById('financeMonthFilterSelect');
      if (!selectEl) return;
      const classDates = getAllKnownDatesForCurrentScope();
      const monthSet = new Set();
      classDates.forEach(d => {
        const parts = d.split('/');
        if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
      });
      const now = new Date();
      const thisMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      if (monthSet.size === 0) monthSet.add(thisMonth);
      const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const [m1, y1] = a.split('/').map(Number);
        const [m2, y2] = b.split('/').map(Number);
        return (y1 * 12 + m1) - (y2 * 12 + m2);
      });
      if (!sortedMonths.includes(currentFinanceMonth) && currentFinanceMonth !== 'all') {
        currentFinanceMonth = sortedMonths.includes(thisMonth) ? thisMonth : sortedMonths[sortedMonths.length - 1];
      }
      selectEl.innerHTML = `
        <option value="all" ${currentFinanceMonth === 'all' ? 'selected' : ''}>Tất cả các tháng</option>
        ${sortedMonths.map(m => `<option value="${m}" ${m === currentFinanceMonth ? 'selected' : ''}>Tháng ${m}</option>`).join('')}
      `;
    }

    function switchFinanceFilterMode(mode) {
      financeFilterMode = mode;
      const monthBtn = document.getElementById('filterModeMonthBtn');
      const rangeBtn = document.getElementById('filterModeRangeBtn');
      const monthBox = document.getElementById('filterMonthBox');
      const rangeBox = document.getElementById('filterRangeBox');
      if (mode === 'month') {
        monthBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        monthBtn?.classList.remove('text-slate-600');
        rangeBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        rangeBtn?.classList.add('text-slate-600');
        monthBox?.classList.remove('hidden');
        rangeBox?.classList.add('hidden');
        onFinanceMonthFilterChange(currentFinanceMonth);
      } else {
        rangeBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        rangeBtn?.classList.remove('text-slate-600');
        monthBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'font-bold');
        monthBtn?.classList.add('text-slate-600');
        rangeBox?.classList.remove('hidden');
        monthBox?.classList.add('hidden');
        applyQuickRangeThisMonth();
      }
    }

    function onFinanceMonthFilterChange(val) {
      currentFinanceMonth = val;
      const classDates = getAllKnownDatesForCurrentScope();
      selectedFinanceDates = val === 'all' ? [...classDates] : classDates.filter(d => d.includes(`/${val}`));
      updateFinanceDateBadge();
      renderFinanceTab();
    }

    function onFinanceDateRangeChange() {
      const fromVal = document.getElementById('financeDateFromInput')?.value;
      const toVal = document.getElementById('financeDateToInput')?.value;
      const fromDate = parseLocalDateInput(fromVal);
      const toDate = parseLocalDateInput(toVal);
      if (!fromDate || !toDate) return;
      toDate.setHours(23, 59, 59, 999);
      selectedFinanceDates = getAllKnownDatesForCurrentScope().filter(d => {
        const [day, month, year] = d.split('/').map(Number);
        const cur = new Date(year, month - 1, day);
        return cur >= fromDate && cur <= toDate;
      });
      updateFinanceDateBadge();
      renderFinanceTab();
    }

    function applyQuickRangeThisMonth() {
      const fromInput = document.getElementById('financeDateFromInput');
      const toInput = document.getElementById('financeDateToInput');
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      if (fromInput) fromInput.value = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`;
      if (toInput) toInput.value = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      onFinanceDateRangeChange();
    }

    function updateFinanceDateBadge() {
      const badge = document.getElementById('customDatesCountBadge');
      if (badge) badge.innerText = `Chọn buổi (${selectedFinanceDates.length} buổi)`;
    }

    function renderFinanceDatesModalList() {
      const container = document.getElementById('financeDatesListContainer');
      if (!container) return;
      const classDates = getAllKnownDatesForCurrentScope();
      container.innerHTML = classDates.map(d => {
        const isChecked = tempSelectedFinanceDates.includes(d);
        const parts = d.split('/');
        return `
          <label class="flex items-center justify-between p-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs">
            <div class="flex items-center gap-2">
              <input type="checkbox" class="rounded text-indigo-600" ${isChecked ? 'checked' : ''} onchange="toggleTempFinanceDate('${d}', this.checked)">
              <span class="font-bold text-slate-800">${d}</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">T.${parts[1]}</span>
          </label>
        `;
      }).join('');
    }

    function openSelectFinanceDatesModal() {
      tempSelectedFinanceDates = [...selectedFinanceDates];
      renderFinanceDatesModalList();
      openModal('modalSelectFinanceDates');
    }

    function toggleTempFinanceDate(dateStr, checked) {
      if (checked) {
        if (!tempSelectedFinanceDates.includes(dateStr)) tempSelectedFinanceDates.push(dateStr);
      } else {
        tempSelectedFinanceDates = tempSelectedFinanceDates.filter(d => d !== dateStr);
      }
    }

    function selectAllFinanceDatesModal(val) {
      tempSelectedFinanceDates = val ? [...getAllKnownDatesForCurrentScope()] : [];
      renderFinanceDatesModalList();
    }

    function applyCustomFinanceDates() {
      if (tempSelectedFinanceDates.length === 0) {
        showUndoToast('Vui lòng chọn ít nhất 1 buổi để tính tiền...');
        return;
      }
      selectedFinanceDates = [...tempSelectedFinanceDates];
      updateFinanceDateBadge();
      closeModal('modalSelectFinanceDates');
      renderFinanceTab();
    }

    function getActiveFinancePeriodKey() {
      if (financeFilterMode === 'month') {
        return currentFinanceMonth || 'all';
      }
      const f = document.getElementById('financeDateFromInput')?.value || '';
      const t = document.getElementById('financeDateToInput')?.value || '';
      return (f && t) ? `${f}_${t}` : 'custom';
    }

    function calculateStudentFeeForSelectedDates(student) {
      const price = Number(student.pricePerSession) || 40000;
      const history = student.attendanceHistory || {};
      const paidList = Array.isArray(student.paidSessions) ? student.paidSessions : [];
      const paidPeriods = Array.isArray(student.paidPeriods) ? student.paidPeriods : [];
      const periodKey = getActiveFinancePeriodKey();

      let presentSessionsCount = 0;
      let attendedDateLabels = [];
      let unpaidPresentSessions = [];

      selectedFinanceDates.forEach(d => {
        if (history[d] === 'present') {
          presentSessionsCount++;
          attendedDateLabels.push(d.slice(0, 5));
          if (!paidList.includes(d)) {
            unpaidPresentSessions.push(d);
          }
        }
      });

      const finalAmount = presentSessionsCount * price;
      const remaining = unpaidPresentSessions.length * price;
      const paid = Math.max(0, finalAmount - remaining);
      const isFullyPaid = presentSessionsCount > 0
        ? (unpaidPresentSessions.length === 0)
        : (paidPeriods.includes(periodKey) || (selectedFinanceDates.length > 0 && selectedFinanceDates.every(d => paidList.includes(d))));

      return {
        presentCount: presentSessionsCount,
        attendedDateLabels,
        price,
        finalAmount,
        paid,
        remaining,
        isFullyPaid
      };
    }

    function renderFinanceTab() {
      let totalExpected = 0;
      let totalCollected = 0;
      let totalDebt = 0;

      students.forEach(s => {
        const fee = calculateStudentFeeForSelectedDates(s);
        totalExpected += fee.finalAmount;
        totalCollected += fee.paid;
        totalDebt += fee.remaining;
      });

      const expEl = document.getElementById('totalExpectedFeeDisplay');
      const colEl = document.getElementById('totalCollectedFeeDisplay');
      const debtEl = document.getElementById('totalDebtFeeDisplay');
      if (expEl) expEl.innerText = formatMoneyK(totalExpected);
      if (colEl) colEl.innerText = formatMoneyK(totalCollected);
      if (debtEl) debtEl.innerText = formatMoneyK(totalDebt);

      const tbody = document.getElementById('financeTableBody');
      if (!tbody) return;

      if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="p-6 text-center text-xs text-slate-500 bg-white">Chưa có dữ liệu học sinh.</td></tr>`;
        return;
      }

      tbody.innerHTML = students.map((s, idx) => {
        const fee = calculateStudentFeeForSelectedDates(s);
        const isChecked = selectedStudentIds.includes(s.id);
        const displayName = getShortName(s.name);
        const classTag = (currentClassId === ALL_CLASSES_ID && s._className)
          ? `<div class="text-[9.5px] font-bold text-indigo-600 truncate max-w-[110px]">${escapeHtml(s._className)}</div>`
          : '';

        return `
          <tr class="hover:bg-slate-50 transition group/row bg-white text-slate-900 ${isChecked ? 'bg-indigo-50/40' : ''}">
            <td class="py-2.5 sm:py-3 px-2 sm:px-3 text-center">
              <input
                type="checkbox"
                ${isChecked ? 'checked' : ''}
                onchange="toggleSelectStudent('${s.id}', this.checked)"
                class="rounded text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
              >
            </td>
            <td class="py-2.5 sm:py-3 px-1 sm:px-2 text-center font-extrabold text-slate-500 text-xs">${idx + 1}</td>
            <td class="py-2.5 sm:py-3 px-2.5 sm:px-3.5 font-bold text-slate-900 cursor-pointer whitespace-nowrap sticky-student-col bg-white group-hover/row:bg-slate-50 transition-colors" onclick="openStudentDetailModal('${s.id}')">
              <div class="hover:text-indigo-600 transition text-xs sm:text-base font-extrabold text-slate-900" title="${escapeHtml(s.name)}">${escapeHtml(displayName)}</div>
              ${classTag}
            </td>
            <td onclick="openStudentDetailModal('${s.id}')" class="py-2.5 sm:py-3 px-1.5 sm:px-2 text-center bg-indigo-50/40 rounded cursor-pointer hover:bg-indigo-100/70 transition" title="Bấm để xem hoặc chỉnh sửa điểm danh từng buổi">
              <div class="font-extrabold text-indigo-700 text-xs sm:text-sm">${fee.presentCount}</div>
              ${fee.attendedDateLabels.length > 0 ? `<div class="text-[9.5px] font-mono text-indigo-600/80 leading-tight max-w-[90px] mx-auto truncate">${fee.attendedDateLabels.join(', ')}</div>` : ''}
            </td>
            <td class="py-2.5 sm:py-3 px-1.5 sm:px-3 text-right">
              ${activeWorkspaceMode === 'shared'
                ? `<span class="text-slate-700 font-mono text-[11px] sm:text-sm font-semibold">${formatMoneyK(fee.price)}</span>`
                : `<button type="button" onclick="openEditFeePriceModal('${s.id}')" class="text-slate-800 hover:text-indigo-700 font-mono text-[11px] sm:text-sm font-semibold inline-flex items-center gap-1">
                    <span>${formatMoneyK(fee.price)}</span>
                    <i data-lucide="pencil" class="w-2.5 h-2.5 text-slate-400"></i>
                  </button>`}
            </td>
            <td class="py-2.5 sm:py-3 px-1.5 sm:px-3 text-right font-extrabold text-slate-900 font-mono text-xs sm:text-[15px]">${formatMoneyK(fee.finalAmount)}</td>
            <td class="py-2.5 sm:py-3 px-1.5 sm:px-3 text-right font-bold text-emerald-600 font-mono text-xs sm:text-[15px]">${formatMoneyK(fee.paid)}</td>
            <td class="py-2.5 sm:py-3 px-1.5 sm:px-3 text-right font-bold text-rose-600 font-mono text-xs sm:text-[15px]">${formatMoneyK(fee.remaining)}</td>
            <td class="py-2.5 sm:py-3 px-1.5 sm:px-2 text-center">
              <span class="inline-block px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${
                fee.isFullyPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
              }">
                ${fee.isFullyPaid ? 'Đã thu' : 'Chưa thu'}
              </span>
            </td>
            <td class="py-2.5 sm:py-3 px-2 sm:px-4 text-right">
              <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                <button
                  type="button"
                  onclick="openTuitionNoticeModal('${s.id}')"
                  class="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 font-bold text-[10.5px] sm:text-xs transition shadow-sm shrink-0"
                  title="Tạo phiếu báo học phí gửi phụ huynh"
                >
                  Báo thu
                </button>
                ${fee.isFullyPaid ? `
                  <button type="button" onclick="resetPaidSessionsForStudent('${s.id}')" class="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10.5px] sm:text-xs transition shrink-0">Hủy thu</button>
                ` : `
                  <button type="button" onclick="markFullyPaidForStudent('${s.id}')" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] sm:text-xs transition shadow-sm shrink-0">Thu đủ</button>
                `}
              </div>
            </td>
            <td class="hidden sm:table-cell py-2.5 sm:py-3 px-3 sm:px-4 text-left border-l border-slate-100 whitespace-nowrap bg-white" onclick="openStudentDetailModal('${s.id}')">
              <div class="text-xs sm:text-sm font-extrabold text-slate-900 hover:text-indigo-600 transition cursor-pointer flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full ${fee.isFullyPaid ? 'bg-emerald-500' : 'bg-rose-400'}"></span>
                <span>${escapeHtml(displayName)}</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      updateFinanceBulkActionBar();
      applySharedWorkspaceUiRestrictions();
      safeCreateIcons();
    }

    function updateFinanceBulkActionBar() {
      const bar = document.getElementById('financeBulkActionBar');
      const countText = document.getElementById('financeBulkSelectedCountText');
      const masterCb = document.getElementById('selectAllStudentsCheckbox');

      if (masterCb) {
        masterCb.checked = students.length > 0 && selectedStudentIds.length === students.length;
      }
      if (!bar) return;

      if (selectedStudentIds.length > 0) {
        bar.classList.remove('hidden');
        if (countText) countText.innerText = `Đã chọn ${selectedStudentIds.length} HS`;
      } else {
        bar.classList.add('hidden');
        if (countText) countText.innerText = 'Đã chọn 0 HS';
      }
    }

    function clearFinanceSelection() {
      selectedStudentIds = [];
      const masterCb = document.getElementById('selectAllStudentsCheckbox');
      if (masterCb) masterCb.checked = false;
      renderFinanceTab();
    }

    function openConfirmBulkFinancePayModal() {
      const count = selectedStudentIds.length;
      if (count === 0) return;

      openConfirmModal(
        `Thu đủ học phí hàng loạt (${count} học sinh)?`,
        `Xác nhận đánh dấu ĐÃ THU ĐỦ học phí kỳ đang chọn cho ${count} học sinh đã tích chọn?`,
        async () => {
          const targetDates = selectedFinanceDates.length > 0 ? selectedFinanceDates : getAllKnownDatesForCurrentScope();

          if (activeWorkspaceMode === 'shared') {
            if (!activeSharedWorkspace?.can_manage_finance) {
              showUndoToast('Bạn không có quyền quản lý học phí ở không gian này.');
              return;
            }
            const updates = [];
            const affectedStudents = [];
            selectedStudentIds.forEach(studentId => {
              const found = findStudentAndClassById(studentId);
              const s = found ? found.student : students.find(x => x.id === studentId);
              if (!s) return;
              const history = s.attendanceHistory || {};
              const presentDatesToPay = targetDates.filter(d => history[d] === 'present');
              if (presentDatesToPay.length === 0) return;
              const clsId = found?.classId || s._classId || currentClassId;
              if (!clsId) return;
              updates.push({
                class_id: clsId,
                student_id: s.id,
                add_dates: presentDatesToPay,
                remove_dates: []
              });
              affectedStudents.push({ student: s, dates: presentDatesToPay });
            });

            if (updates.length === 0) {
              clearFinanceSelection();
              renderFinanceTab();
              showUndoToast('Chưa có buổi đi học nào để thu');
              return;
            }

            try {
              const { data, error } = await supabaseClient.rpc('member_update_tuition', {
                p_owner_id: activeSharedWorkspace.owner_id,
                p_updates: updates,
                p_remark_updates: {}
              });
              if (error || !data?.ok) {
                showUndoToast(data?.message || error?.message || 'Lỗi cập nhật thu học phí hàng loạt.');
                await reloadActiveSharedWorkspaceQuietly();
                return;
              }
              affectedStudents.forEach(({ student, dates }) => {
                if (!Array.isArray(student.paidSessions)) student.paidSessions = [];
                dates.forEach(d => {
                  if (!student.paidSessions.includes(d)) student.paidSessions.push(d);
                });
              });
              students = getStudentsForClass(currentClassId);
              clearFinanceSelection();
              renderFinanceTab();
              renderHomeTab();
              showUndoToast(`Đã đánh dấu thu đủ học phí cho ${affectedStudents.length} học sinh!`);
            } catch (err) {
              showUndoToast('Lỗi kết nối khi thu học phí hàng loạt.');
              await reloadActiveSharedWorkspaceQuietly();
            }
            return;
          }

          let updatedStudentsCount = 0;

          selectedStudentIds.forEach(studentId => {
            const found = findStudentAndClassById(studentId);
            const s = found ? found.student : students.find(x => x.id === studentId);
            if (!s) return;
            const history = s.attendanceHistory || {};
            const presentDatesToPay = targetDates.filter(d => history[d] === 'present');
            if (presentDatesToPay.length === 0) return;

            if (!Array.isArray(s.paidSessions)) s.paidSessions = [];
            presentDatesToPay.forEach(d => {
              if (!s.paidSessions.includes(d)) s.paidSessions.push(d);
            });
            updatedStudentsCount++;
          });

          students = getStudentsForClass(currentClassId);
          clearFinanceSelection();
          if (updatedStudentsCount === 0) {
            renderFinanceTab();
            showUndoToast('Chưa có buổi đi học nào để thu');
            return;
          }
          saveAllToLocalStorage(true);
          renderFinanceTab();
          renderHomeTab();
          showUndoToast(`Đã đánh dấu thu đủ học phí cho ${updatedStudentsCount} học sinh!`);
        }
      );
    }

    function openConfirmBulkFinanceResetModal() {
      const count = selectedStudentIds.length;
      if (count === 0) return;

      openConfirmModal(
        `Hủy thu học phí hàng loạt (${count} học sinh)?`,
        `Xác nhận hủy trạng thái đã đóng học phí kỳ đang chọn cho ${count} học sinh đã tích chọn?`,
        async () => {
          const periodKey = getActiveFinancePeriodKey();
          const datesToClear = selectedFinanceDates.length > 0 ? selectedFinanceDates : getAllKnownDatesForCurrentScope();

          if (activeWorkspaceMode === 'shared') {
            if (!activeSharedWorkspace?.can_manage_finance) {
              showUndoToast('Bạn không có quyền quản lý học phí ở không gian này.');
              return;
            }
            const updates = [];
            const targetStudents = [];
            selectedStudentIds.forEach(studentId => {
              const found = findStudentAndClassById(studentId);
              const s = found ? found.student : students.find(x => x.id === studentId);
              const clsId = found?.classId || s?._classId || currentClassId;
              if (!s || !clsId) return;
              updates.push({
                class_id: clsId,
                student_id: s.id,
                add_dates: [],
                remove_dates: datesToClear
              });
              targetStudents.push(s);
            });

            if (updates.length === 0) {
              clearFinanceSelection();
              return;
            }

            try {
              const { data, error } = await supabaseClient.rpc('member_update_tuition', {
                p_owner_id: activeSharedWorkspace.owner_id,
                p_updates: updates,
                p_remark_updates: {}
              });
              if (error || !data?.ok) {
                showUndoToast(data?.message || error?.message || 'Lỗi hủy thu học phí hàng loạt.');
                await reloadActiveSharedWorkspaceQuietly();
                return;
              }
              targetStudents.forEach(s => {
                s.paidPeriods = (s.paidPeriods || []).filter(p => p !== periodKey);
                s.paidSessions = (s.paidSessions || []).filter(d => !datesToClear.includes(d));
              });
              students = getStudentsForClass(currentClassId);
              clearFinanceSelection();
              renderFinanceTab();
              renderHomeTab();
              showUndoToast(`Đã hủy thu học phí kỳ đang chọn cho ${targetStudents.length} học sinh!`);
            } catch (err) {
              showUndoToast('Lỗi kết nối khi hủy thu học phí.');
              await reloadActiveSharedWorkspaceQuietly();
            }
            return;
          }

          selectedStudentIds.forEach(studentId => {
            const found = findStudentAndClassById(studentId);
            const s = found ? found.student : students.find(x => x.id === studentId);
            if (!s) return;
            s.paidPeriods = (s.paidPeriods || []).filter(p => p !== periodKey);
            s.paidSessions = (s.paidSessions || []).filter(d => !datesToClear.includes(d));
          });

          students = getStudentsForClass(currentClassId);
          clearFinanceSelection();
          saveAllToLocalStorage(true);
          renderFinanceTab();
          renderHomeTab();
          showUndoToast(`Đã hủy thu học phí kỳ đang chọn cho ${count} học sinh!`);
        }
      );
    }

    function toggleSelectStudent(id, checked) {
      if (checked) { if (!selectedStudentIds.includes(id)) selectedStudentIds.push(id); }
      else { selectedStudentIds = selectedStudentIds.filter(x => x !== id); }
      updateFinanceBulkActionBar();
    }

    function toggleSelectAllStudents(checked) {
      selectedStudentIds = checked ? students.map(s => s.id) : [];
      renderFinanceTab();
    }

    async function markFullyPaidForStudent(studentId) {
      const found = findStudentAndClassById(studentId);
      const s = found ? found.student : students.find(x => x.id === studentId);
      if (!s) return;
      const history = s.attendanceHistory || {};
      const targetDates = selectedFinanceDates.length > 0 ? selectedFinanceDates : getAllKnownDatesForCurrentScope();
      const presentDatesToPay = targetDates.filter(d => history[d] === 'present');
      if (presentDatesToPay.length === 0) {
        showUndoToast('Chưa có buổi đi học nào để thu');
        return;
      }

      if (activeWorkspaceMode === 'shared') {
        if (!activeSharedWorkspace?.can_manage_finance) {
          showUndoToast('Bạn không có quyền quản lý học phí ở không gian này.');
          return;
        }
        const clsId = found?.classId || s._classId || currentClassId;
        if (!supabaseClient || !activeSharedWorkspace?.owner_id || !clsId) return;
        try {
          const { data, error } = await supabaseClient.rpc('member_update_tuition', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: [{
              class_id: clsId,
              student_id: s.id,
              add_dates: presentDatesToPay,
              remove_dates: []
            }],
            p_remark_updates: {}
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi lưu trạng thái thu học phí.');
            await reloadActiveSharedWorkspaceQuietly();
            return;
          }
          if (!Array.isArray(s.paidSessions)) s.paidSessions = [];
          presentDatesToPay.forEach(d => {
            if (!s.paidSessions.includes(d)) s.paidSessions.push(d);
          });
          students = getStudentsForClass(currentClassId);
          renderFinanceTab();
          renderHomeTab();
          showUndoToast(`Đã thu tiền học phí của ${s.name}!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi thu học phí.');
          await reloadActiveSharedWorkspaceQuietly();
        }
        return;
      }

      if (!Array.isArray(s.paidSessions)) s.paidSessions = [];
      presentDatesToPay.forEach(d => {
        if (!s.paidSessions.includes(d)) s.paidSessions.push(d);
      });
      students = getStudentsForClass(currentClassId);
      saveAllToLocalStorage(true);
      renderFinanceTab();
      showUndoToast(`Đã thu tiền học phí của ${s.name}!`);
    }

    async function resetPaidSessionsForStudent(studentId) {
      const found = findStudentAndClassById(studentId);
      const s = found ? found.student : students.find(x => x.id === studentId);
      if (!s) return;
      const periodKey = getActiveFinancePeriodKey();
      const datesToClear = selectedFinanceDates.length > 0 ? selectedFinanceDates : getAllKnownDatesForCurrentScope();

      if (activeWorkspaceMode === 'shared') {
        if (!activeSharedWorkspace?.can_manage_finance) {
          showUndoToast('Bạn không có quyền quản lý học phí ở không gian này.');
          return;
        }
        const clsId = found?.classId || s._classId || currentClassId;
        if (!supabaseClient || !activeSharedWorkspace?.owner_id || !clsId) return;
        try {
          const { data, error } = await supabaseClient.rpc('member_update_tuition', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: [{
              class_id: clsId,
              student_id: s.id,
              add_dates: [],
              remove_dates: datesToClear
            }],
            p_remark_updates: {}
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi hủy thu học phí.');
            await reloadActiveSharedWorkspaceQuietly();
            return;
          }
          s.paidPeriods = (s.paidPeriods || []).filter(p => p !== periodKey);
          s.paidSessions = (s.paidSessions || []).filter(d => !datesToClear.includes(d));
          students = getStudentsForClass(currentClassId);
          renderFinanceTab();
          renderHomeTab();
          showUndoToast(`Đã hủy thu tiền học phí của ${s.name}!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi hủy thu học phí.');
          await reloadActiveSharedWorkspaceQuietly();
        }
        return;
      }

      s.paidPeriods = (s.paidPeriods || []).filter(p => p !== periodKey);
      s.paidSessions = (s.paidSessions || []).filter(d => !datesToClear.includes(d));
      students = getStudentsForClass(currentClassId);
      saveAllToLocalStorage(true);
      renderFinanceTab();
      showUndoToast(`Đã hủy thu tiền học phí của ${s.name}!`);
    }

    function openEditFeePriceModal(studentId = null) {
      if (activeWorkspaceMode === 'shared') {
        showUndoToast('Thành viên phụ không có quyền sửa đơn giá học phí.');
        return;
      }
      activePriceEditTarget = studentId;
      const title = document.getElementById('editFeePriceModalTitle');
      const input = document.getElementById('modalCustomFeePriceInput');
      const found = studentId ? findStudentAndClassById(studentId) : null;
      const s = found ? found.student : students.find(x => x.id === studentId);
      if (title) title.innerText = s ? `Đổi đơn giá: ${s.name}` : 'Đổi đơn giá học phí';
      if (input) input.value = s?.pricePerSession || 40000;
      openModal('modalEditFeePrice');
    }

    function setModalPricePreset(val) {
      const input = document.getElementById('modalCustomFeePriceInput');
      if (input) input.value = val;
    }

    function handleSaveCustomFeePrice(e) {
      e.preventDefault();
      if (activeWorkspaceMode === 'shared') {
        showUndoToast('Thành viên phụ không có quyền sửa đơn giá học phí.');
        return;
      }
      const newPrice = Number(document.getElementById('modalCustomFeePriceInput')?.value) || 40000;
      if (activePriceEditTarget) {
        const found = findStudentAndClassById(activePriceEditTarget);
        const s = found ? found.student : students.find(x => x.id === activePriceEditTarget);
        if (s) s.pricePerSession = newPrice;
      }
      students = getStudentsForClass(currentClassId);
      saveAllToLocalStorage(true);
      closeModal('modalEditFeePrice');
      renderFinanceTab();
      showUndoToast(`Đã cập nhật đơn giá mới: ${formatMoneyK(newPrice)}/buổi!`);
    }

    // ==================== PHIẾU BÁO HỌC PHÍ (BÁO THU) ====================
    let activeTuitionStudentId = null;
    let currentTuitionThemeId = localStorage.getItem('dipi_tuition_theme') || 'sakura';

    const TUITION_THEMES = {
      sakura: {
        name: 'Đào',
        dotColor: 'bg-[#f29cb5]',
        cardBg: '#fffafb',
        cardBorder: '#fbcfe8',
        bannerGrad: 'linear-gradient(90deg, #f4a2b8 0%, #f7b89c 50%, #f29cb5 100%)',
        decorSvg: `
          <defs><radialGradient id="gSakura" cx="65%" cy="55%" r="45%"><stop offset="0%" stop-color="#fffbeb" stop-opacity="0.95"/><stop offset="100%" stop-color="#f472b6" stop-opacity="0"/></radialGradient></defs>
          <rect width="400" height="60" fill="url(#gSakura)"/>
          <circle cx="18" cy="14" r="10" fill="#ffe4e6"/><circle cx="36" cy="22" r="8" fill="#fecdd3"/><circle cx="14" cy="36" r="9" fill="#fda4af"/>
          <circle cx="382" cy="16" r="11" fill="#ffe4e6"/><circle cx="362" cy="26" r="9" fill="#fecdd3"/><circle cx="388" cy="40" r="8" fill="#fda4af"/>
        `,
        dividerColor: '#fce7f3',
        iconBg: '#fce7f3',
        iconText: '#ec4899',
        totalBg: '#fceef2',
        totalBorder: '#f3b6c8',
        totalTitle: '#9f586e',
        totalAmount: '#a61c4c',
        pillBg: '#fdf0f3',
        pillBorder: '#e8a8bc',
        pillText: '#7a2942',
        remarkHeading: '#948b48',
        remarkBg: '#f9ecee',
        remarkBorder: '#fce7f3',
        qrBorder: '#69c2c9',
        qrTitle: '#2d8a91'
      },
      sunset: {
        name: 'Nắng',
        dotColor: 'bg-[#f59e0b]',
        cardBg: '#fffdf7',
        cardBorder: '#fde68a',
        bannerGrad: 'linear-gradient(90deg, #ea580c 0%, #f59e0b 55%, #fbbf24 100%)',
        decorSvg: `<circle cx="345" cy="30" r="26" fill="#fef3c7" opacity="0.35"/><circle cx="345" cy="30" r="16" fill="#ffffff" opacity="0.4"/>`,
        dividerColor: '#fef3c7',
        iconBg: '#fef3c7',
        iconText: '#d97706',
        totalBg: '#fffbeb',
        totalBorder: '#fcd34d',
        totalTitle: '#b45309',
        totalAmount: '#92400e',
        pillBg: '#fef3c7',
        pillBorder: '#fcd34d',
        pillText: '#92400e',
        remarkHeading: '#b45309',
        remarkBg: '#fffbeb',
        remarkBorder: '#fde68a',
        qrBorder: '#f59e0b',
        qrTitle: '#b45309'
      },
      green: {
        name: 'Mầm',
        dotColor: 'bg-[#16a34a]',
        cardBg: '#f6fdf8',
        cardBorder: '#bbf7d0',
        bannerGrad: 'linear-gradient(90deg, #15803d 0%, #16a34a 52%, #4ade80 100%)',
        decorSvg: `<circle cx="32" cy="14" r="20" fill="#ffffff" opacity="0.15"/><circle cx="368" cy="46" r="26" fill="#ffffff" opacity="0.18"/>`,
        dividerColor: '#dcfce7',
        iconBg: '#dcfce7',
        iconText: '#16a34a',
        totalBg: '#f0fdf4',
        totalBorder: '#86efac',
        totalTitle: '#15803d',
        totalAmount: '#14532d',
        pillBg: '#f0fdf4',
        pillBorder: '#86efac',
        pillText: '#166534',
        remarkHeading: '#15803d',
        remarkBg: '#f0fdf4',
        remarkBorder: '#bbf7d0',
        qrBorder: '#16a34a',
        qrTitle: '#15803d'
      },
      blue: {
        name: 'Sóng',
        dotColor: 'bg-[#2563eb]',
        cardBg: '#f6faff',
        cardBorder: '#bfdbfe',
        bannerGrad: 'linear-gradient(90deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)',
        decorSvg: `<circle cx="42" cy="18" r="12" fill="#ffffff" opacity="0.16"/><circle cx="358" cy="22" r="16" fill="#ffffff" opacity="0.18"/>`,
        dividerColor: '#dbeafe',
        iconBg: '#dbeafe',
        iconText: '#2563eb',
        totalBg: '#eff6ff',
        totalBorder: '#93c5fd',
        totalTitle: '#1d4ed8',
        totalAmount: '#1e3a8a',
        pillBg: '#eff6ff',
        pillBorder: '#93c5fd',
        pillText: '#1e40af',
        remarkHeading: '#1d4ed8',
        remarkBg: '#eff6ff',
        remarkBorder: '#bfdbfe',
        qrBorder: '#2563eb',
        qrTitle: '#1d4ed8'
      },
      purple: {
        name: 'Mơ',
        dotColor: 'bg-[#7c3aed]',
        cardBg: '#faf8ff',
        cardBorder: '#ddd6fe',
        bannerGrad: 'linear-gradient(90deg, #6d28d9 0%, #7c3aed 52%, #a78bfa 100%)',
        decorSvg: `<circle cx="28" cy="18" r="14" fill="#ffffff" opacity="0.18"/><circle cx="364" cy="20" r="18" fill="#ffffff" opacity="0.18"/>`,
        dividerColor: '#ede9fe',
        iconBg: '#ede9fe',
        iconText: '#7c3aed',
        totalBg: '#f5f3ff',
        totalBorder: '#c4b5fd',
        totalTitle: '#6d28d9',
        totalAmount: '#4c1d95',
        pillBg: '#f5f3ff',
        pillBorder: '#c4b5fd',
        pillText: '#5b21b6',
        remarkHeading: '#6d28d9',
        remarkBg: '#f5f3ff',
        remarkBorder: '#ddd6fe',
        qrBorder: '#7c3aed',
        qrTitle: '#6d28d9'
      }
    };

    function renderTuitionThemeSelector() {
      const container = document.getElementById('tuitionThemeSelectorList');
      if (!container) return;
      if (!TUITION_THEMES[currentTuitionThemeId]) currentTuitionThemeId = 'sakura';
      container.innerHTML = Object.entries(TUITION_THEMES).map(([key, th]) => {
        const isAct = key === currentTuitionThemeId;
        return `
          <button
            type="button"
            onclick="selectTuitionTheme('${key}')"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-bold whitespace-nowrap shrink-0 transition ${
              isAct
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }"
          >
            <span class="w-2 h-2 rounded-full ${th.dotColor} shrink-0"></span>
            <span>${th.name}</span>
          </button>
        `;
      }).join('');
    }

    function selectTuitionTheme(themeKey) {
      if (!TUITION_THEMES[themeKey]) return;
      currentTuitionThemeId = themeKey;
      localStorage.setItem('dipi_tuition_theme', themeKey);
      renderTuitionThemeSelector();
      applyTuitionThemeStyles();
    }

    function applyTuitionThemeStyles() {
      const th = TUITION_THEMES[currentTuitionThemeId] || TUITION_THEMES.sakura;
      const card = document.getElementById('tuitionNoticeCaptureArea');
      const banner = document.getElementById('tuitionBannerHeader');
      const decorSvg = document.getElementById('tuitionBannerDecorSvg');
      const infoRows = document.getElementById('tuitionInfoRowsContainer');
      const totalBox = document.getElementById('tuitionTotalBox');
      const totalTitle = document.getElementById('tuitionTotalTitle');
      const totalAmount = document.getElementById('tuitionTotalAmount');
      const remarkHeading = document.getElementById('tuitionRemarkHeading');
      const remarkDisplay = document.getElementById('tuitionRemarkDisplay');
      const qrOuter = document.getElementById('tuitionQrOuterBox');
      const qrTitle = document.getElementById('tuitionQrTitle');

      if (card) {
        card.style.backgroundColor = th.cardBg;
        card.style.borderColor = th.cardBorder;
      }
      if (banner) banner.style.background = th.bannerGrad;
      if (decorSvg) decorSvg.innerHTML = th.decorSvg;
      if (infoRows) {
        Array.from(infoRows.children).forEach((row, idx) => {
          row.style.borderTopColor = idx > 0 ? th.dividerColor : 'transparent';
        });
      }
      document.querySelectorAll('[data-tuition-icon-badge]').forEach(el => {
        el.style.backgroundColor = th.iconBg;
        el.style.color = th.iconText;
      });
      if (totalBox) {
        totalBox.style.backgroundColor = th.totalBg;
        totalBox.style.borderColor = th.totalBorder;
      }
      if (totalTitle) totalTitle.style.color = th.totalTitle;
      if (totalAmount) totalAmount.style.color = th.totalAmount;
      if (remarkHeading) remarkHeading.style.color = th.remarkHeading;
      if (remarkDisplay) {
        remarkDisplay.style.backgroundColor = th.remarkBg;
        remarkDisplay.style.borderColor = th.remarkBorder;
      }
      if (qrOuter) qrOuter.style.borderColor = th.qrBorder;
      if (qrTitle) qrTitle.style.color = th.qrTitle;

      document.querySelectorAll('#tuitionAttendedDatesContainer span[data-date-pill]').forEach(pill => {
        pill.style.backgroundColor = th.pillBg;
        pill.style.borderColor = th.pillBorder;
        pill.style.color = th.pillText;
      });
    }

    function formatFullVnd(amount) {
      return `${(Number(amount) || 0).toLocaleString('vi-VN')} đ`;
    }

    function getTuitionMonthTitle() {
      if (currentRole === 'parent' && parentPortalSession?.student) {
        return `Tháng ${new Date().getMonth() + 1}`;
      }
      if (financeFilterMode === 'month' && currentFinanceMonth && currentFinanceMonth !== 'all') {
        const mNum = parseInt(currentFinanceMonth.split('/')[0], 10);
        return `Tháng ${mNum}`;
      }
      if (selectedFinanceDates.length > 0) {
        const parts = selectedFinanceDates[0].split('/');
        if (parts.length >= 2) return `Tháng ${parseInt(parts[1], 10)}`;
      }
      return `Tháng ${new Date().getMonth() + 1}`;
    }

    function getTuitionRemarkStorageKey(studentId) {
      const period = getActiveFinancePeriodKey();
      return `${studentId}_${period}`;
    }

    function updateTuitionRemarkSectionVisibility(rawText) {
      const section = document.getElementById('tuitionRemarkSection');
      const display = document.getElementById('tuitionRemarkDisplay');
      const trimmed = String(rawText || '').trim();
      if (!section || !display) return;
      if (!trimmed) {
        display.innerText = '';
        section.classList.add('hidden');
      } else {
        display.innerText = rawText;
        section.classList.remove('hidden');
      }
    }

    function openTuitionNoticeModal(studentId) {
      if (currentRole === 'teacher' && activeWorkspaceMode === 'shared' && !activeSharedWorkspace?.can_manage_finance) { showUndoToast('Bạn không có quyền xem phiếu báo thu ở không gian này.'); return; }
      const isParentView = currentRole === 'parent' && Boolean(parentPortalSession?.student);
      const found = isParentView ? null : findStudentAndClassById(studentId);
      const s = isParentView
        ? parentPortalSession.student
        : (found ? found.student : students.find(x => x.id === studentId));
      if (!s) return;

      const toggleEditBtn = document.getElementById('btnToggleTuitionEdit');
      if (toggleEditBtn) {
        toggleEditBtn.classList.toggle('hidden', currentRole === 'parent');
      }

      activeTuitionStudentId = s.id;
      let targetDates = [];
      let remarksSource = tuitionRemarksMap;
      let remarkKey = getTuitionRemarkStorageKey(s.id);

      if (isParentView) {
        const now = new Date();
        const curMonthStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        targetDates = getParentCurrentMonthSessionDates(parentPortalSession.classObj, s);
        remarksSource = parentPortalSession.tuitionRemarks || {};
        remarkKey = `${s.id}_${curMonthStr}`;
      } else if (selectedFinanceDates.length > 0) {
        targetDates = selectedFinanceDates;
      } else {
        const allClsDates = getCurrentClassSessionDates(found ? found.classId : currentClassId);
        const now = new Date();
        const fallbackMonth = (currentFinanceMonth && currentFinanceMonth !== 'all')
          ? currentFinanceMonth
          : `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        targetDates = allClsDates.filter(d => d.includes(`/${fallbackMonth}`));
      }

      const history = s.attendanceHistory || {};
      const attendedDates = targetDates.filter(d => history[d] === 'present');
      const price = Number(s.pricePerSession) || 40000;
      const sessionCount = attendedDates.length;
      const totalAmount = sessionCount * price;
      const th = TUITION_THEMES[currentTuitionThemeId] || TUITION_THEMES.sakura;

      document.getElementById('tuitionBannerMonthLabel').innerText = getTuitionMonthTitle();
      document.getElementById('tuitionStudentName').innerText = getShortName(s.name);
      document.getElementById('tuitionFeePerSession').innerText = formatFullVnd(price);
      document.getElementById('tuitionSessionCount').innerText = `${sessionCount} buổi`;
      document.getElementById('tuitionTotalAmount').innerText = formatFullVnd(totalAmount);

      const datesContainer = document.getElementById('tuitionAttendedDatesContainer');
      if (datesContainer) {
        if (attendedDates.length === 0) {
          datesContainer.innerHTML = `<span class="text-[11px] text-slate-400 italic">Chưa có buổi đi học nào trong kỳ này</span>`;
        } else {
          datesContainer.innerHTML = attendedDates.map(d => {
            const shortDate = d.slice(0, 5);
            return `<span data-date-pill="1" style="background-color:${th.pillBg};border-color:${th.pillBorder};color:${th.pillText}" class="px-2.5 py-1 rounded-lg border font-bold text-xs font-mono shadow-sm">${shortDate}</span>`;
          }).join('');
        }
      }

      const defaultRemark = `Con chăm ngoan, tích cực phát biểu và nắm vững kiến thức trọng tâm trên lớp.`;
      const currentRemark = remarksSource[remarkKey] !== undefined ? remarksSource[remarkKey] : defaultRemark;

      updateTuitionRemarkSectionVisibility(currentRemark);
      const remarkInput = document.getElementById('tuitionRemarkInput');
      if (remarkInput) remarkInput.value = currentRemark;

      renderTuitionThemeSelector();
      applyTuitionThemeStyles();
      renderTuitionQrBox();
      setTuitionEditPanelState(false);
      openModal('modalTuitionNotice');
    }

    function renderTuitionQrBox() {
      const qrWrapper = document.getElementById('tuitionQrImageWrapper');
      if (!qrWrapper) return;

      const isParentView = currentRole === 'parent' && Boolean(parentPortalSession?.student);
      const qrSource = isParentView
        ? (parentPortalSession.paymentQr || { imageData: '' })
        : teacherPaymentQr;

      if (qrSource && qrSource.imageData) {
        qrWrapper.innerHTML = `
          <div class="w-52 h-52 sm:w-56 sm:h-56 rounded-xl overflow-hidden bg-white flex items-center justify-center">
            <img src="${qrSource.imageData}" alt="Mã QR thanh toán" class="w-full h-full object-contain">
          </div>
        `;
      } else {
        const emptyQrMessage = isParentView
          ? 'Giáo viên chưa tải mã QR thanh toán'
          : (activeWorkspaceMode === 'shared'
            ? 'Chủ lớp chưa tải mã QR thanh toán'
            : 'Bấm "Sửa" ở góc trên để tải mã QR ngân hàng');
        qrWrapper.innerHTML = `
          <div class="w-36 h-36 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center p-2 text-center gap-1">
            <i data-lucide="qr-code" class="w-6 h-6 text-slate-300"></i>
            <span class="text-[10px] text-slate-400 font-semibold leading-tight">${emptyQrMessage}</span>
          </div>
        `;
      }
      safeCreateIcons();
    }

    let isTuitionEditPanelOpen = false;
    function setTuitionEditPanelState(isOpen) {
      isTuitionEditPanelOpen = Boolean(isOpen);
      const panel = document.getElementById('tuitionTeacherEditPanel');
      const label = document.getElementById('labelToggleTuitionEdit');
      if (panel) panel.classList.toggle('hidden', !isTuitionEditPanelOpen);
      if (label) label.innerText = isTuitionEditPanelOpen ? 'Xong' : 'Sửa';
    }

    function toggleTuitionEditPanel() {
      setTuitionEditPanelState(!isTuitionEditPanelOpen);
    }

    let sharedTuitionRemarkDebounceTimer = null;

    function handleTuitionRemarkChange(val) {
      if (!activeTuitionStudentId) return;
      const key = getTuitionRemarkStorageKey(activeTuitionStudentId);
      tuitionRemarksMap[key] = val;
      updateTuitionRemarkSectionVisibility(val);

      if (activeWorkspaceMode === 'shared') {
        if (!activeSharedWorkspace?.can_manage_finance) return;
        clearTimeout(sharedTuitionRemarkDebounceTimer);
        sharedTuitionRemarkDebounceTimer = setTimeout(async () => {
          if (!supabaseClient || !activeSharedWorkspace?.owner_id) return;
          try {
            const { data, error } = await supabaseClient.rpc('member_update_tuition', {
              p_owner_id: activeSharedWorkspace.owner_id,
              p_updates: [],
              p_remark_updates: { [key]: val }
            });
            if (error || !data?.ok) {
              showUndoToast(data?.message || error?.message || 'Lỗi lưu nhận xét phiếu báo thu.');
            }
          } catch (err) {
            showUndoToast('Lỗi kết nối khi lưu nhận xét.');
          }
        }, 600);
        return;
      }

      saveAllToLocalStorage();
    }

    async function applyRemarkToWholeClass() {
      const val = document.getElementById('tuitionRemarkInput')?.value || '';
      const period = getActiveFinancePeriodKey();

      if (activeWorkspaceMode === 'shared') {
        if (!activeSharedWorkspace?.can_manage_finance) {
          showUndoToast('Bạn không có quyền quản lý học phí ở không gian này.');
          return;
        }
        if (!supabaseClient || !activeSharedWorkspace?.owner_id) return;
        clearTimeout(sharedTuitionRemarkDebounceTimer);
        const remarkUpdates = {};
        students.forEach(st => {
          const k = `${st.id}_${period}`;
          remarkUpdates[k] = val;
        });

        try {
          const { data, error } = await supabaseClient.rpc('member_update_tuition', {
            p_owner_id: activeSharedWorkspace.owner_id,
            p_updates: [],
            p_remark_updates: remarkUpdates
          });
          if (error || !data?.ok) {
            showUndoToast(data?.message || error?.message || 'Lỗi áp dụng nhận xét cho cả lớp.');
            return;
          }
          Object.assign(tuitionRemarksMap, remarkUpdates);
          updateTuitionRemarkSectionVisibility(val);
          showUndoToast(`Đã áp dụng nhận xét này cho toàn bộ ${students.length} học sinh!`);
        } catch (err) {
          showUndoToast('Lỗi kết nối khi lưu nhận xét cả lớp.');
        }
        return;
      }

      students.forEach(st => {
        tuitionRemarksMap[`${st.id}_${period}`] = val;
      });
      updateTuitionRemarkSectionVisibility(val);
      saveAllToLocalStorage(true);
      showUndoToast(`Đã áp dụng nhận xét này cho toàn bộ ${students.length} học sinh!`);
    }

    function handleTeacherQrUpload(e) {
      if (activeWorkspaceMode === 'shared') {
        if (e?.target) e.target.value = '';
        showUndoToast('Thành viên phụ không có quyền thay đổi mã QR thanh toán.');
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const targetSize = 420;
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetSize, targetSize);

          const scale = Math.min(targetSize / img.width, targetSize / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (targetSize - drawW) / 2;
          const offsetY = (targetSize - drawH) / 2;
          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

          teacherPaymentQr.imageData = canvas.toDataURL('image/png');
          saveAllToLocalStorage(true);
          renderTuitionQrBox();
          showUndoToast('Đã căn chỉnh & lưu mã QR thanh toán vĩnh viễn!');
        };
        img.src = evt.target?.result || '';
      };
      reader.readAsDataURL(file);
    }

    async function copyTuitionNoticeImage() {
      const captureEl = document.getElementById('tuitionNoticeCaptureArea');
      if (!captureEl || typeof html2canvas === 'undefined') {
        showUndoToast('Đang chuẩn bị trình sao chép ảnh...');
        return;
      }
      const th = TUITION_THEMES[currentTuitionThemeId] || TUITION_THEMES.sakura;
      try {
        const canvas = await html2canvas(captureEl, { scale: 2, backgroundColor: th.cardBg, useCORS: true });
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          try {
            if (navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              showUndoToast('Đã sao chép ảnh phiếu! Bạn có thể dán ngay vào Zalo.');
            } else {
              downloadTuitionNoticeImage();
            }
          } catch (clipErr) {
            downloadTuitionNoticeImage();
          }
        }, 'image/png');
      } catch (err) {
        console.error('Lỗi sao chép ảnh phiếu:', err);
        showUndoToast('Không thể sao chép ảnh, vui lòng dùng nút Lưu ảnh!');
      }
    }

    async function downloadTuitionNoticeImage() {
      const captureEl = document.getElementById('tuitionNoticeCaptureArea');
      if (!captureEl || typeof html2canvas === 'undefined') {
        showUndoToast('Đang chuẩn bị trình xuất ảnh...');
        return;
      }
      const th = TUITION_THEMES[currentTuitionThemeId] || TUITION_THEMES.sakura;
      try {
        const canvas = await html2canvas(captureEl, { scale: 2, backgroundColor: th.cardBg, useCORS: true });
        const link = document.createElement('a');
        const stName = document.getElementById('tuitionStudentName')?.innerText || 'HocSinh';
        const monthLbl = document.getElementById('tuitionBannerMonthLabel')?.innerText || 'Thang';
        link.download = `Phieu_Hoc_Phi_${stName}_${monthLbl}.png`.replace(/\s+/g, '_');
        link.href = canvas.toDataURL('image/png');
        link.click();
        showUndoToast('Đã tải ảnh phiếu báo học phí!');
      } catch (err) {
        console.error('Lỗi xuất ảnh phiếu học phí:', err);
        showUndoToast('Không thể tạo ảnh phiếu, vui lòng thử lại!');
      }
    }

