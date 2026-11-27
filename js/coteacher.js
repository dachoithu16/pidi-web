    // ==================== CHUYỂN ĐỔI KHÔNG GIAN LÀM VIỆC (GIÁO VIÊN PHỤ) ====================
    async function loadMySharedWorkspaces() {
      if (!supabaseClient || !currentUser?.id) {
        mySharedWorkspacesList = [];
        renderWorkspaceSwitcherUI();
        return;
      }
      try {
        const { data, error } = await supabaseClient.rpc('get_my_shared_workspaces');
        if (!error && Array.isArray(data)) {
          mySharedWorkspacesList = data;
        } else {
          mySharedWorkspacesList = [];
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách không gian chia sẻ:', err);
        mySharedWorkspacesList = [];
      }
      renderWorkspaceSwitcherUI();
      applySharedWorkspaceUiRestrictions();
    }

    function confirmRespondWorkspaceInvite(ownerId, decision) {
      const ws = (mySharedWorkspacesList || []).find(w => String(w.owner_id) === String(ownerId));
      const ownerName = ws?.owner_name || ws?.owner_email || 'Chủ lớp';
      if (decision === 'accept') {
        openConfirmModal(
          'Chấp nhận lời mời giảng dạy?',
          `Bạn xác nhận tham gia vào không gian lớp học của Thầy/Cô ${ownerName}?`,
          () => respondWorkspaceInvite(ownerId, 'accept')
        );
      } else if (decision === 'decline') {
        openConfirmModal(
          'Từ chối lời mời?',
          `Bạn có chắc chắn muốn từ chối lời mời giảng dạy từ Thầy/Cô ${ownerName}?`,
          () => respondWorkspaceInvite(ownerId, 'decline')
        );
      } else if (decision === 'block') {
        openConfirmModal(
          `Chặn lời mời từ Thầy/Cô ${ownerName}?`,
          'Sau khi chặn, tài khoản này sẽ không thể gửi lời mời giảng dạy cho bạn nữa. Bạn chắc chắn muốn chặn?',
          () => respondWorkspaceInvite(ownerId, 'block')
        );
      }
    }

    async function respondWorkspaceInvite(ownerId, decision) {
      if (!supabaseClient || !currentUser?.id || !ownerId) return;
      const allowed = ['accept', 'decline', 'block', 'leave'];
      const cleanDecision = allowed.includes(decision) ? decision : 'decline';
      try {
        const { data, error } = await supabaseClient.rpc('respond_workspace_invite', {
          p_owner_id: ownerId,
          p_decision: cleanDecision
        });

        if (error || !data?.ok) {
          showUndoToast(data?.message || error?.message || 'Không thể phản hồi lời mời giảng dạy.');
          return;
        }

        await loadMySharedWorkspaces();
        showUndoToast(data?.message || (cleanDecision === 'accept' ? 'Đã chấp nhận lời mời tham gia giảng dạy!' : 'Đã từ chối lời mời.'));

        if (cleanDecision === 'accept') {
          await switchActiveWorkspace(ownerId);
        }
      } catch (err) {
        console.warn('Lỗi phản hồi lời mời không gian làm việc:', err);
        showUndoToast('Lỗi kết nối khi phản hồi lời mời.');
      }
    }

    function confirmLeaveActiveSharedWorkspace() {
      if (activeWorkspaceMode !== 'shared' || !activeSharedWorkspace?.owner_id) return;
      const ownerId = activeSharedWorkspace.owner_id;
      const ownerName = activeSharedWorkspace.owner_name || activeSharedWorkspace.owner_email || 'Chủ lớp';
      openConfirmModal(
        `Thoát khỏi lớp của ${ownerName}?`,
        `Bạn sẽ ngắt liên kết và không còn thấy các lớp của Thầy/Cô ${ownerName}. Để quay lại, chủ lớp sẽ phải gửi lời mời mới.`,
        async () => {
          if (!supabaseClient || !currentUser?.id) return;
          try {
            const { data, error } = await supabaseClient.rpc('respond_workspace_invite', {
              p_owner_id: ownerId,
              p_decision: 'leave'
            });
            if (error || !data?.ok) {
              showUndoToast(data?.message || error?.message || 'Không thể thoát khỏi liên kết lớp học.');
              return;
            }
            await loadMySharedWorkspaces();
            await switchActiveWorkspace('own', true);
            switchTab('home');
            showUndoToast(`Đã thoát khỏi liên kết với lớp của ${ownerName}.`);
          } catch (err) {
            showUndoToast('Lỗi kết nối khi thoát khỏi liên kết lớp học.');
          }
        }
      );
    }

    function renderWorkspaceSwitcherUI() {
      const box = document.getElementById('workspaceSwitcherBox');
      const select = document.getElementById('workspaceSwitcherSelect');
      const pendingBanner = document.getElementById('pendingWorkspaceInvitesBanner');
      const canLeaveShared = currentRole === 'teacher' && activeWorkspaceMode === 'shared' && Boolean(activeSharedWorkspace?.owner_id);
      document.getElementById('btnLeaveSharedWorkspace')?.classList.toggle('hidden', !canLeaveShared);

      const allWorkspaces = Array.isArray(mySharedWorkspacesList) ? mySharedWorkspacesList : [];
      const acceptedList = allWorkspaces.filter(ws => (ws.invite_status || 'accepted') === 'accepted');
      const pendingList = allWorkspaces.filter(ws => ws.invite_status === 'pending');

      if (pendingBanner) {
        const showPending = currentRole === 'teacher' && pendingList.length > 0;
        pendingBanner.classList.toggle('hidden', !showPending);
        if (showPending) {
          pendingBanner.innerHTML = pendingList.map(ws => {
            const ownerId = String(ws.owner_id || '');
            const ownerName = ws.owner_name || ws.owner_email || 'Chủ lớp';
            const perms = [];
            if (ws.can_manage_finance) perms.push('Quản lý học phí');
            if (ws.can_view_contacts) perms.push('Xem SĐT & Xuất Excel');
            const permNote = perms.length > 0
              ? ` • Quyền cấp: ${perms.join(', ')}`
              : ' • Quyền cấp: Điểm danh & Bài tập';

            return `
              <div class="bg-violet-50 border border-violet-200 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <div class="w-7 h-7 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                    <i data-lucide="mail-plus" class="w-3.5 h-3.5"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="font-extrabold text-violet-950 leading-snug">
                      Thầy/Cô ${escapeHtml(ownerName)} mời bạn tham gia giảng dạy chung
                    </div>
                    <div class="text-[11px] text-violet-700/90 font-medium truncate">
                      Lớp được phân công${escapeHtml(permNote)}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onclick="confirmRespondWorkspaceInvite('${escapeHtml(ownerId)}', 'accept')"
                    class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition active:scale-95"
                  >
                    Chấp nhận
                  </button>
                  <button
                    type="button"
                    onclick="confirmRespondWorkspaceInvite('${escapeHtml(ownerId)}', 'decline')"
                    class="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold transition active:scale-95"
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    onclick="confirmRespondWorkspaceInvite('${escapeHtml(ownerId)}', 'block')"
                    class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-600 border border-slate-200 text-xs font-bold transition active:scale-95"
                  >
                    Chặn
                  </button>
                </div>
              </div>
            `;
          }).join('');
          safeCreateIcons();
        } else {
          pendingBanner.innerHTML = '';
        }
      }

      if (!box || !select) return;

      const shouldShow = currentRole === 'teacher' && acceptedList.length > 0;
      box.classList.toggle('hidden', !shouldShow);
      if (!shouldShow) return;

      const currentVal = (activeWorkspaceMode === 'shared' && activeSharedWorkspace?.owner_id)
        ? String(activeSharedWorkspace.owner_id)
        : 'own';

      select.innerHTML = [
        `<option value="own" ${currentVal === 'own' ? 'selected' : ''}>Lớp cá nhân của tôi</option>`,
        ...acceptedList.map(ws => {
          const ownerId = String(ws.owner_id || '');
          const ownerName = ws.owner_name || ws.owner_email || 'Chủ lớp';
          const lockedTag = ws.is_owner_vip_active === false ? ' (Tạm khóa)' : '';
          return `<option value="${escapeHtml(ownerId)}" ${currentVal === ownerId ? 'selected' : ''}>Lớp của ${escapeHtml(ownerName)}${lockedTag}</option>`;
        })
      ].join('');
    }

    async function reloadActiveSharedWorkspaceQuietly() {
      if (activeWorkspaceMode !== 'shared' || !activeSharedWorkspace?.owner_id || !supabaseClient) return;
      try {
        const { data, error } = await supabaseClient.rpc('get_shared_workspace_data', {
          p_owner_id: activeSharedWorkspace.owner_id
        });
        if (!error && data && data.ok === true && data.data) {
          activeSharedWorkspace = data.workspace || activeSharedWorkspace;
          const sharedPayload = data.data;
          classesList = Array.isArray(sharedPayload.classesList) ? sharedPayload.classesList : [];
          classStudentsMap = (sharedPayload.classStudentsMap && typeof sharedPayload.classStudentsMap === 'object') ? sharedPayload.classStudentsMap : {};
          homeworks = Array.isArray(sharedPayload.homeworks) ? sharedPayload.homeworks : [];
          homeworkSubmissions = Array.isArray(sharedPayload.homeworkSubmissions) ? sharedPayload.homeworkSubmissions : [];
          teacherPaymentQr = (sharedPayload.teacherPaymentQr && typeof sharedPayload.teacherPaymentQr === 'object')
            ? sharedPayload.teacherPaymentQr
            : { imageData: '', bankName: 'BIDV' };
          tuitionRemarksMap = (sharedPayload.tuitionRemarksMap && typeof sharedPayload.tuitionRemarksMap === 'object')
            ? sharedPayload.tuitionRemarksMap
            : {};
          if (currentClassId && !classesList.some(c => c.id === currentClassId)) {
            currentClassId = classesList.length > 0 ? classesList[0].id : null;
          }
          students = getStudentsForClass(currentClassId);
          syncActiveAttendanceDateForCurrentClass();
          syncFinanceDatesForCurrentClass();
          renderAll();
        }
      } catch (err) {
        console.warn('Lỗi tải lại dữ liệu không gian chia sẻ:', err);
      }
    }

    async function switchActiveWorkspace(targetValue, isSilent = false) {
      const val = String(targetValue || 'own').trim();
      const switcherSel = document.getElementById('workspaceSwitcherSelect');

      if (val === 'own') {
        activeWorkspaceMode = 'own';
        activeSharedWorkspace = null;
        isClassSelected = false;
        selectedStudentIds = [];
        selectedAttendanceStudentIds = [];
        loadScopedUserData();
        renderWorkspaceSwitcherUI();
        applySharedWorkspaceUiRestrictions();
        if (!isSilent) {
          switchTab('home');
        }
        renderAll();
        if (currentUser?.id) {
          await loadUserDataFromCloud(currentUser, false);
        }
        if (!isSilent) {
          showUndoToast('Đã chuyển về không gian lớp cá nhân của bạn.');
        }
        return;
      }

      if (!supabaseClient || !currentUser?.id) {
        if (!isSilent) showUndoToast('Vui lòng đăng nhập để truy cập không gian chia sẻ.');
        if (switcherSel) switcherSel.value = 'own';
        return;
      }

      try {
        const { data, error } = await supabaseClient.rpc('get_shared_workspace_data', {
          p_owner_id: val
        });

        if (error || !data || data.ok !== true || !data.data) {
          if (!isSilent) {
            const errMsg = data?.message || error?.message || 'Không thể mở không gian lớp được chia sẻ.';
            showUndoToast(errMsg);
          }
          renderWorkspaceSwitcherUI();
          return;
        }

        const prevClassId = currentClassId;
        activeWorkspaceMode = 'shared';
        activeSharedWorkspace = data.workspace || mySharedWorkspacesList.find(w => String(w.owner_id) === val) || { owner_id: val };
        const sharedPayload = data.data;

        classesList = Array.isArray(sharedPayload.classesList) ? sharedPayload.classesList : [];
        classStudentsMap = (sharedPayload.classStudentsMap && typeof sharedPayload.classStudentsMap === 'object') ? sharedPayload.classStudentsMap : {};
        homeworks = Array.isArray(sharedPayload.homeworks) ? sharedPayload.homeworks : [];
        homeworkSubmissions = Array.isArray(sharedPayload.homeworkSubmissions) ? sharedPayload.homeworkSubmissions : [];
        teacherPaymentQr = (sharedPayload.teacherPaymentQr && typeof sharedPayload.teacherPaymentQr === 'object')
          ? sharedPayload.teacherPaymentQr
          : { imageData: '', bankName: 'BIDV' };
        tuitionRemarksMap = (sharedPayload.tuitionRemarksMap && typeof sharedPayload.tuitionRemarksMap === 'object')
          ? sharedPayload.tuitionRemarksMap
          : {};
        teacherNotebookNotes = [];
        editingNotebookNoteId = null;

        if (isSilent && prevClassId && classesList.some(c => c.id === prevClassId)) {
          currentClassId = prevClassId;
        } else {
          selectedStudentIds = [];
          selectedAttendanceStudentIds = [];
          currentClassId = classesList.length > 0 ? classesList[0].id : null;
          isClassSelected = false;
        }
        students = getStudentsForClass(currentClassId);

        syncActiveAttendanceDateForCurrentClass();
        syncFinanceDatesForCurrentClass();
        renderWorkspaceSwitcherUI();
        applySharedWorkspaceUiRestrictions();
        updateTeacherNotificationBadgeUI();
        if (!isSilent) {
          switchTab('home');
        }
        renderAll();

        if (!isSilent) {
          const ownerLabel = activeSharedWorkspace?.owner_name || activeSharedWorkspace?.owner_email || 'Chủ lớp';
          showUndoToast(`Đã chuyển sang không gian lớp của ${ownerLabel}.`);
        }
      } catch (err) {
        console.warn('Lỗi chuyển không gian chia sẻ:', err);
        if (!isSilent) showUndoToast('Lỗi kết nối khi mở không gian chia sẻ.');
        renderWorkspaceSwitcherUI();
      }
    }

    function applySharedWorkspaceUiRestrictions() {
      const isShared = activeWorkspaceMode === 'shared';
      const canManageFinance = !isShared || Boolean(activeSharedWorkspace?.can_manage_finance);
      const canViewContacts = !isShared || Boolean(activeSharedWorkspace?.can_view_contacts);
      const canLeaveShared = currentRole === 'teacher' && activeWorkspaceMode === 'shared' && Boolean(activeSharedWorkspace?.owner_id);
      document.getElementById('btnLeaveSharedWorkspace')?.classList.toggle('hidden', !canLeaveShared);

      // 1. Các thành phần chỉ dành cho Chủ lớp
      const headerVipBtn = document.getElementById('btnHeaderVipPlan');
      if (headerVipBtn) {
        headerVipBtn.classList.toggle('hidden', isShared);
        headerVipBtn.classList.toggle('sm:inline-flex', !isShared);
      }
      document.getElementById('homeHeroVipPill')?.classList.toggle('hidden', isShared);
      document.getElementById('btnOpenEditClass')?.classList.toggle('hidden', isShared || currentClassId === ALL_CLASSES_ID);
      const btnWsMembers = document.getElementById('btnOpenWorkspaceMembers');
      if (btnWsMembers) {
        btnWsMembers.classList.toggle('hidden', isShared || !(currentUser && currentUser.id));
      }
      document.getElementById('homeQuickNotebookBtn')?.classList.toggle('hidden', isShared);
      document.getElementById('btnClassesCreateClass')?.classList.toggle('hidden', isShared);
      document.getElementById('btnAttendanceAddStudent')?.classList.toggle('hidden', isShared);
      document.getElementById('btnDeleteSingleStudentModal')?.classList.toggle('hidden', isShared);
      document.querySelector('#modalStudentDetail form button[type="submit"]')?.classList.toggle('hidden', isShared);
      document.getElementById('homeStatRevenueCard')?.classList.toggle('hidden', isShared);

      // Menu tạo mới nhanh: giữ "Thêm bài tập", ẩn "Thêm học sinh" & "Thêm lớp học"
      document.getElementById('quickMenuAddStudentBtn')?.classList.toggle('hidden', isShared);
      document.getElementById('quickMenuAddClassBtn')?.classList.toggle('hidden', isShared);
      document.getElementById('quickMenuAddCoTeacherBtn')?.classList.toggle('hidden', isShared);

      // Thanh xóa hàng loạt ở Điểm danh
      if (isShared) {
        document.getElementById('attendanceBulkActionBar')?.classList.add('hidden');
      }

      updateHomeVipBannerVisibility();

      // 2. Phân quyền Tab Học phí & Phiếu báo thu
      document.getElementById('tabFinanceBtn')?.classList.toggle('hidden', !canManageFinance);
      document.getElementById('mobileBottomTabFinance')?.classList.toggle('hidden', !canManageFinance);
      document.getElementById('btnStudentDetailTuitionNotice')?.classList.toggle('hidden', !canManageFinance);
      document.getElementById('tuitionTeacherQrUploadSection')?.classList.toggle('hidden', isShared);

      if (isShared && !canManageFinance && currentTab === 'finance' && currentRole === 'teacher') {
        switchTab('home');
      }

      // 3. Phân quyền SĐT phụ huynh & Xuất Excel
      document.getElementById('btnAttendanceExportExcel')?.classList.toggle('hidden', !canViewContacts);
      document.getElementById('studentDetailContactFieldsRow')?.classList.toggle('hidden', !canViewContacts);
    }

    // ==================== QUẢN LÝ GIÁO VIÊN PHỤ (WORKSPACE MEMBERS) ====================
    function getEffectiveMaxTeachersForCurrentPlan() {
      enforcePaidVipExpirationIfNeeded();
      enforceTrialExpirationIfNeeded();
      const activePlan = getActiveVipPlan();
      return Math.max(1, Number(activePlan?.maxTeachers) || 1);
    }

    function updateWorkspaceMemberQuotaUI() {
      const activePlan = getActiveVipPlan();
      const maxTeachers = getEffectiveMaxTeachersForCurrentPlan();
      const usedCount = 1 + (Array.isArray(workspaceMembersList) ? workspaceMembersList.filter(m => m.is_active !== false && !['declined', 'blocked', 'left'].includes(m.invite_status)).length : 0);
      const isPlanLocked = maxTeachers <= 1;

      const quotaEl = document.getElementById('workspaceMemberQuotaText');
      const planTagEl = document.getElementById('workspaceMemberPlanTag');
      const upgradeNotice = document.getElementById('workspaceMemberUpgradeNotice');

      if (quotaEl) {
        quotaEl.innerText = `Đang dùng ${usedCount} / ${maxTeachers} giáo viên (gồm chủ lớp)`;
      }
      if (planTagEl) {
        planTagEl.innerText = `Gói ${activePlan.name}`;
      }
      if (upgradeNotice) {
        upgradeNotice.classList.toggle('hidden', !isPlanLocked);
      }

      const emailInp = document.getElementById('wsMemberEmailInput');
      const nameInp = document.getElementById('wsMemberNameInput');
      const allClsCb = document.getElementById('wsMemberAllClassesCheckbox');
      const finCb = document.getElementById('wsMemberCanFinanceCheckbox');
      const conCb = document.getElementById('wsMemberCanContactsCheckbox');
      const saveBtn = document.getElementById('btnSaveWorkspaceMember');

      const disableForm = isPlanLocked && !editingWorkspaceMemberEmail;
      if (emailInp) emailInp.disabled = disableForm || Boolean(editingWorkspaceMemberEmail);
      if (nameInp) nameInp.disabled = disableForm;
      if (allClsCb) allClsCb.disabled = disableForm;
      if (finCb) finCb.disabled = disableForm;
      if (conCb) conCb.disabled = disableForm;
      if (saveBtn) saveBtn.disabled = disableForm;

      renderWorkspaceMemberClassCheckboxes(disableForm);
    }

    function renderWorkspaceMemberClassCheckboxes(isDisabled = false) {
      const container = document.getElementById('wsMemberClassesCheckboxList');
      const allCb = document.getElementById('wsMemberAllClassesCheckbox');
      const isAllSelected = Array.isArray(wsMemberAssignedClassIds) && wsMemberAssignedClassIds.includes('*');

      if (allCb) {
        allCb.checked = isAllSelected;
        allCb.disabled = isDisabled;
      }
      if (!container) return;

      if (!Array.isArray(classesList) || classesList.length === 0) {
        container.innerHTML = `<div class="col-span-full text-[11px] text-slate-400 italic py-1">Chưa có lớp học nào.</div>`;
        return;
      }

      container.innerHTML = classesList.map(cls => {
        const checked = isAllSelected || wsMemberAssignedClassIds.includes(cls.id);
        const disabledAttr = (isDisabled || isAllSelected) ? 'disabled' : '';
        return `
          <label class="flex items-center gap-1.5 px-2 py-1 rounded-lg border ${checked ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/50'} text-[11px] font-semibold text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              class="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 cursor-pointer"
              ${checked ? 'checked' : ''}
              ${disabledAttr}
              onchange="toggleWorkspaceMemberSingleClass('${escapeHtml(cls.id)}', this.checked)"
            >
            <span class="truncate">${escapeHtml(cls.class_name)}</span>
          </label>
        `;
      }).join('');
    }

    function toggleWorkspaceMemberAllClasses(checked) {
      if (checked) {
        wsMemberAssignedClassIds = ['*'];
      } else {
        wsMemberAssignedClassIds = [];
      }
      const isPlanLocked = getEffectiveMaxTeachersForCurrentPlan() <= 1 && !editingWorkspaceMemberEmail;
      renderWorkspaceMemberClassCheckboxes(isPlanLocked);
    }

    function toggleWorkspaceMemberSingleClass(classId, checked) {
      if (!Array.isArray(wsMemberAssignedClassIds)) wsMemberAssignedClassIds = [];
      wsMemberAssignedClassIds = wsMemberAssignedClassIds.filter(id => id !== '*');
      if (checked) {
        if (!wsMemberAssignedClassIds.includes(classId)) {
          wsMemberAssignedClassIds.push(classId);
        }
      } else {
        wsMemberAssignedClassIds = wsMemberAssignedClassIds.filter(id => id !== classId);
      }
      const isPlanLocked = getEffectiveMaxTeachersForCurrentPlan() <= 1 && !editingWorkspaceMemberEmail;
      renderWorkspaceMemberClassCheckboxes(isPlanLocked);
    }

    function resetWorkspaceMemberForm() {
      editingWorkspaceMemberEmail = null;
      wsMemberEditingIsActive = true;
      wsMemberAssignedClassIds = ['*'];

      const formTitle = document.getElementById('workspaceMemberFormTitle');
      const cancelBtn = document.getElementById('btnCancelEditWorkspaceMember');
      const saveLbl = document.getElementById('btnSaveWorkspaceMemberLabel');
      const emailInp = document.getElementById('wsMemberEmailInput');
      const nameInp = document.getElementById('wsMemberNameInput');
      const finCb = document.getElementById('wsMemberCanFinanceCheckbox');
      const conCb = document.getElementById('wsMemberCanContactsCheckbox');

      if (formTitle) formTitle.innerText = 'Thêm giáo viên phụ mới';
      cancelBtn?.classList.add('hidden');
      if (saveLbl) saveLbl.innerText = 'Lưu giáo viên';
      if (emailInp) emailInp.value = '';
      if (nameInp) nameInp.value = '';
      if (finCb) finCb.checked = false;
      if (conCb) conCb.checked = false;

      updateWorkspaceMemberQuotaUI();
    }

    function openWorkspaceMembersModal() {
      if (!currentUser || !currentUser.id) {
        openAuthModal('signin');
        showUndoToast('Vui lòng đăng nhập để quản lý giáo viên phụ.');
        return;
      }
      if (activeWorkspaceMode === 'shared') {
        showUndoToast('Chỉ chủ không gian lớp học mới có thể quản lý giáo viên phụ.');
        return;
      }
      resetWorkspaceMemberForm();
      openModal('modalWorkspaceMembers');
      loadWorkspaceMembers(false);
    }

    async function checkOwnerHasActiveMembers() {
      if (!supabaseClient || !currentUser?.id) {
        ownerHasActiveMembers = false;
        return false;
      }
      if (getEffectiveMaxTeachersForCurrentPlan() <= 1) {
        ownerHasActiveMembers = false;
        return false;
      }
      try {
        const { data, error } = await supabaseClient
          .from('workspace_members')
          .select('id, is_active, invite_status')
          .eq('owner_id', currentUser.id)
          .eq('is_active', true)
          .eq('invite_status', 'accepted')
          .limit(1);
        if (!error && Array.isArray(data)) {
          ownerHasActiveMembers = data.length > 0;
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra thành viên phụ đang hoạt động:', err);
      }
      return ownerHasActiveMembers;
    }

    async function loadWorkspaceMembers(showToast = false) {
      if (!supabaseClient || !currentUser?.id || isLoadingWorkspaceMembers) return;
      isLoadingWorkspaceMembers = true;
      const container = document.getElementById('workspaceMembersListContainer');

      try {
        const { data, error } = await supabaseClient
          .from('workspace_members')
          .select('*')
          .eq('owner_id', currentUser.id)
          .order('created_at', { ascending: true });

        if (error) {
          if (container) {
            container.innerHTML = `<div class="p-4 text-center text-xs font-bold text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">Lỗi tải danh sách giáo viên: ${escapeHtml(error.message)}</div>`;
          }
          return;
        }

        workspaceMembersList = Array.isArray(data) ? data : [];
        ownerHasActiveMembers = workspaceMembersList.some(m => m.is_active === true && (m.invite_status || 'accepted') === 'accepted');
        updateWorkspaceMemberQuotaUI();
        renderWorkspaceMembersList();
        if (showToast) showUndoToast(`Đã cập nhật ${workspaceMembersList.length} giáo viên phụ.`);
      } catch (err) {
        console.warn('Lỗi tải workspace_members:', err);
      } finally {
        isLoadingWorkspaceMembers = false;
      }
    }

    function renderWorkspaceMembersList() {
      const container = document.getElementById('workspaceMembersListContainer');
      if (!container) return;

      if (!Array.isArray(workspaceMembersList) || workspaceMembersList.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Chưa có giáo viên phụ nào được thêm.
          </div>
        `;
        return;
      }

      const classNameMap = {};
      classesList.forEach(c => { classNameMap[c.id] = c.class_name; });

      container.innerHTML = workspaceMembersList.map(m => {
        const emailStr = String(m.member_email || '').trim().toLowerCase();
        const displayName = String(m.member_name || '').trim() || emailStr.split('@')[0] || 'Giáo viên phụ';
        const assignedIds = Array.isArray(m.assigned_class_ids) ? m.assigned_class_ids : [];
        const isAllClasses = assignedIds.includes('*');
        const classNamesText = isAllClasses
          ? 'Tất cả các lớp'
          : (assignedIds.length > 0
              ? assignedIds.map(id => classNameMap[id] || id).join(', ')
              : 'Chưa phân lớp');
        const isActive = m.is_active !== false;
        const inviteStatus = m.invite_status || 'accepted';
        const canFinance = Boolean(m.can_manage_finance);
        const canContacts = Boolean(m.can_view_contacts);

        let statusBadgeHtml = '';
        if (inviteStatus === 'blocked') {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">Đã chặn lời mời</span>`;
        } else if (inviteStatus === 'left') {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">Đã rời lớp</span>`;
        } else if (!isActive) {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">Đã khóa</span>`;
        } else if (inviteStatus === 'declined') {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-extrabold">Đã từ chối</span>`;
        } else if (inviteStatus === 'pending') {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold">Chờ chấp nhận</span>`;
        } else {
          statusBadgeHtml = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold">Đã tham gia</span>`;
        }

        const editButtonLabel = (inviteStatus === 'declined' || inviteStatus === 'left') ? 'Mời lại' : 'Sửa';
        const showEditButton = inviteStatus !== 'blocked';
        const showToggleButton = inviteStatus !== 'blocked' && inviteStatus !== 'left';

        return `
          <div class="rounded-2xl border p-3 space-y-2 transition ${isActive ? 'bg-white border-slate-200/90' : 'bg-slate-50/90 border-slate-200 opacity-75'}">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-extrabold text-xs sm:text-sm text-slate-900 truncate">${escapeHtml(displayName)}</span>
                  ${statusBadgeHtml}
                </div>
                <div class="text-[11px] font-mono text-slate-500 truncate mt-0.5">${escapeHtml(emailStr)}</div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                ${showEditButton ? `
                  <button
                    type="button"
                    onclick="startEditWorkspaceMember('${escapeHtml(emailStr)}')"
                    class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10.5px] font-bold transition"
                  >
                    ${editButtonLabel}
                  </button>
                ` : ''}
                ${showToggleButton ? `
                  <button
                    type="button"
                    onclick="toggleWorkspaceMemberActive('${escapeHtml(emailStr)}', ${!isActive})"
                    class="px-2 py-1 rounded-lg ${isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} text-[10.5px] font-bold transition"
                  >
                    ${isActive ? 'Tắt' : 'Bật'}
                  </button>
                ` : ''}
                <button
                  type="button"
                  onclick="deleteWorkspaceMember('${escapeHtml(emailStr)}')"
                  class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10.5px] font-bold transition"
                >
                  Xóa
                </button>
              </div>
            </div>

            <div class="text-[11px] text-slate-600 font-medium">
              <span class="text-slate-400 font-bold">Lớp phụ trách:</span>
              <strong class="text-slate-800">${escapeHtml(classNamesText)}</strong>
            </div>

            <div class="flex items-center gap-1.5 flex-wrap">
              ${canFinance ? `<span class="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">Quyền Học phí</span>` : ''}
              ${canContacts ? `<span class="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold">Xem SĐT &amp; Xuất Excel</span>` : ''}
              ${(!canFinance && !canContacts) ? `<span class="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-semibold">Chỉ Điểm danh &amp; Bài tập</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

      safeCreateIcons();
    }

    function startEditWorkspaceMember(memberEmail) {
      const m = workspaceMembersList.find(x => String(x.member_email || '').trim().toLowerCase() === String(memberEmail || '').trim().toLowerCase());
      if (!m) return;

      editingWorkspaceMemberEmail = String(m.member_email || '').trim().toLowerCase();
      wsMemberEditingIsActive = m.is_active !== false;
      wsMemberAssignedClassIds = Array.isArray(m.assigned_class_ids) && m.assigned_class_ids.length > 0
        ? [...m.assigned_class_ids]
        : [];

      const formTitle = document.getElementById('workspaceMemberFormTitle');
      const cancelBtn = document.getElementById('btnCancelEditWorkspaceMember');
      const saveLbl = document.getElementById('btnSaveWorkspaceMemberLabel');
      const emailInp = document.getElementById('wsMemberEmailInput');
      const nameInp = document.getElementById('wsMemberNameInput');
      const finCb = document.getElementById('wsMemberCanFinanceCheckbox');
      const conCb = document.getElementById('wsMemberCanContactsCheckbox');

      if (formTitle) formTitle.innerText = `Chỉnh sửa: ${editingWorkspaceMemberEmail}`;
      cancelBtn?.classList.remove('hidden');
      if (saveLbl) saveLbl.innerText = 'Cập nhật giáo viên';
      if (emailInp) emailInp.value = editingWorkspaceMemberEmail;
      if (nameInp) nameInp.value = m.member_name || '';
      if (finCb) finCb.checked = Boolean(m.can_manage_finance);
      if (conCb) conCb.checked = Boolean(m.can_view_contacts);

      updateWorkspaceMemberQuotaUI();
    }

    async function handleSaveWorkspaceMember(e) {
      e.preventDefault();
      if (!supabaseClient || !currentUser?.id) return;

      const emailInp = document.getElementById('wsMemberEmailInput');
      const nameInp = document.getElementById('wsMemberNameInput');
      const finCb = document.getElementById('wsMemberCanFinanceCheckbox');
      const conCb = document.getElementById('wsMemberCanContactsCheckbox');
      const saveBtn = document.getElementById('btnSaveWorkspaceMember');

      const memberEmail = String(editingWorkspaceMemberEmail || emailInp?.value || '').trim().toLowerCase();
      if (!memberEmail) {
        showUndoToast('Vui lòng nhập email giáo viên phụ.');
        return;
      }
      if (memberEmail === String(currentUser.email || '').trim().toLowerCase()) {
        showUndoToast('Không thể tự thêm email chủ lớp làm giáo viên phụ.');
        return;
      }
      if (!Array.isArray(wsMemberAssignedClassIds) || wsMemberAssignedClassIds.length === 0) {
        showUndoToast('Vui lòng chọn ít nhất 1 lớp phụ trách hoặc tích "Tất cả các lớp".');
        return;
      }

      if (saveBtn) saveBtn.disabled = true;

      try {
        const ownerDisplayName = currentUser.full_name || currentUser.email?.split('@')[0] || 'Chủ lớp';
        const { data, error } = await supabaseClient.rpc('manage_workspace_member', {
          p_action: 'upsert',
          p_member_email: memberEmail,
          p_member_name: String(nameInp?.value || '').trim() || null,
          p_assigned_class_ids: wsMemberAssignedClassIds,
          p_can_manage_finance: Boolean(finCb?.checked),
          p_can_view_contacts: Boolean(conCb?.checked),
          p_is_active: editingWorkspaceMemberEmail ? wsMemberEditingIsActive : true,
          p_owner_name: ownerDisplayName
        });

        if (error || (data && data.ok === false)) {
          showUndoToast(data?.message || error?.message || 'Không thể lưu giáo viên phụ.');
          return;
        }

        showUndoToast(editingWorkspaceMemberEmail ? `Đã cập nhật giáo viên ${memberEmail}!` : `Đã gửi lời mời tới ${memberEmail}! Đang chờ họ xác nhận.`);
        resetWorkspaceMemberForm();
        await loadWorkspaceMembers(false);
      } catch (err) {
        showUndoToast('Lỗi kết nối khi lưu giáo viên phụ.');
      } finally {
        updateWorkspaceMemberQuotaUI();
      }
    }

    async function toggleWorkspaceMemberActive(memberEmail, nextActive) {
      if (!supabaseClient || !currentUser?.id || !memberEmail) return;
      try {
        const { data, error } = await supabaseClient.rpc('manage_workspace_member', {
          p_action: 'toggle',
          p_member_email: memberEmail,
          p_is_active: Boolean(nextActive)
        });

        if (error || (data && data.ok === false)) {
          showUndoToast(data?.message || error?.message || 'Không thể đổi trạng thái giáo viên.');
          return;
        }
        showUndoToast(nextActive ? `Đã BẬT quyền truy cập cho ${memberEmail}!` : `Đã TẮT quyền truy cập cho ${memberEmail}.`);
        await loadWorkspaceMembers(false);
      } catch (err) {
        showUndoToast('Lỗi kết nối khi cập nhật trạng thái giáo viên.');
      }
    }

    function deleteWorkspaceMember(memberEmail) {
      if (!supabaseClient || !currentUser?.id || !memberEmail) return;
      openConfirmModal(
        `Xóa giáo viên ${memberEmail}?`,
        `Giáo viên "${memberEmail}" sẽ không còn quyền truy cập vào không gian lớp học của bạn.`,
        async () => {
          try {
            const { data, error } = await supabaseClient.rpc('manage_workspace_member', {
              p_action: 'delete',
              p_member_email: memberEmail
            });

            if (error || (data && data.ok === false)) {
              showUndoToast(data?.message || error?.message || 'Không thể xóa giáo viên phụ.');
              return;
            }
            if (editingWorkspaceMemberEmail === memberEmail) {
              resetWorkspaceMemberForm();
            }
            showUndoToast(`Đã xóa giáo viên ${memberEmail}.`);
            await loadWorkspaceMembers(false);
          } catch (err) {
            showUndoToast('Lỗi kết nối khi xóa giáo viên phụ.');
          }
        }
      );
    }

