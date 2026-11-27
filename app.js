    function switchTab(tabKey) {
      if (tabKey === 'finance' && activeWorkspaceMode === 'shared' && !activeSharedWorkspace?.can_manage_finance) { tabKey = 'home'; }
      currentTab = tabKey;
      saveUiNavigationState();

      const isHomeTab = tabKey === 'home';
      const subBanner = document.getElementById('globalSubBanner');
      const teacherClassBox = document.getElementById('teacherClassBannerBox');
      if (subBanner) {
        subBanner.classList.remove('hidden');
      }
      if (teacherClassBox && currentRole === 'teacher') {
        teacherClassBox.classList.toggle('hidden', isHomeTab);
      }
      updateHomeVipBannerVisibility();

      ['home', 'attendance', 'finance', 'homework', 'classes'].forEach(k => {
        const cap = k.charAt(0).toUpperCase() + k.slice(1);
        document.getElementById(`contentTab${cap}`)?.classList.toggle('hidden', k !== tabKey);
        const btnPc = document.getElementById(`tab${cap}Btn`);
        const mobIconBg = document.getElementById(`mobileIconBg${cap}`);
        const mobLabel = document.getElementById(`mobileLabel${cap}`);

        if (k === tabKey) {
          btnPc?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm');
          btnPc?.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-white/60');
          if (mobIconBg) mobIconBg.className = 'w-10 h-7 rounded-full flex items-center justify-center bg-indigo-50 text-indigo-600 transition';
          if (mobLabel) mobLabel.className = 'text-[10px] font-extrabold mt-0.5 text-indigo-600';
        } else {
          btnPc?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm');
          btnPc?.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-white/60');
          if (mobIconBg) mobIconBg.className = 'w-10 h-7 rounded-full flex items-center justify-center text-slate-500 transition';
          if (mobLabel) mobLabel.className = 'text-[10px] font-semibold mt-0.5 text-slate-500';
        }
      });

      if (tabKey === 'home') renderHomeTab();
      if (tabKey === 'attendance') { renderWeeklyScheduleGrid(); renderAttendanceTab(); }
      if (tabKey === 'finance') { syncFinanceDatesForCurrentClass(); renderFinanceTab(); }
      if (tabKey === 'homework') renderHomeworkTab();
      if (tabKey === 'classes') renderClassesManagementTab();
      applySharedWorkspaceUiRestrictions();
      safeCreateIcons();
    }

    function switchRole(role, persistPreference = true) {
      currentRole = role;
      if (persistPreference && VALID_ROLES.includes(role)) { try { localStorage.setItem('dipi_preferred_role', role); } catch (e) {} }
      saveUiNavigationState();
      const teacherSec = document.getElementById('teacherViewSection');
      const parentSec = document.getElementById('parentViewSection');
      const teacherBtn = document.getElementById('roleTeacherBtn');
      const parentBtn = document.getElementById('roleParentBtn');
      const teacherClassBox = document.getElementById('teacherClassBannerBox');
      const parentBox = document.getElementById('parentStudentSelectBox');
      const mobileNav = document.getElementById('mobileBottomNavWrapper');
      const subBanner = document.getElementById('globalSubBanner');

      if (role === 'teacher') {
        teacherSec?.classList.remove('hidden');
        parentSec?.classList.add('hidden');
        if (subBanner) subBanner.classList.remove('hidden');
        teacherClassBox?.classList.toggle('hidden', currentTab === 'home');
        renderWorkspaceSwitcherUI();
        updateHomeVipBannerVisibility();
        parentBox?.classList.add('hidden');
        mobileNav?.classList.remove('hidden');
        teacherBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm');
        teacherBtn?.classList.remove('text-slate-500');
        parentBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm');
        parentBtn?.classList.add('text-slate-500');
        applySharedWorkspaceUiRestrictions();
      } else {
        teacherSec?.classList.add('hidden');
        parentSec?.classList.remove('hidden');
        subBanner?.classList.remove('hidden');
        document.getElementById('workspaceSwitcherBox')?.classList.add('hidden');
        document.getElementById('pendingWorkspaceInvitesBanner')?.classList.add('hidden');
        teacherClassBox?.classList.add('hidden');
        updateHomeVipBannerVisibility();
        parentBox?.classList.remove('hidden');
        mobileNav?.classList.add('hidden');
        parentBtn?.classList.add('bg-white', 'text-indigo-700', 'shadow-sm');
        parentBtn?.classList.remove('text-slate-500');
        teacherBtn?.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm');
        teacherBtn?.classList.add('text-slate-500');
        renderParentView();
      }
      updateTeacherNotificationBadgeUI();
      safeCreateIcons();
    }

    function handleQuickActionPlus() {
      openModal('quickCreateActionMenu');
    }

    function closeQuickActionMenu() {
      closeModal('quickCreateActionMenu');
    }

    function renderAll() {
      renderHomeTab();
      renderClassSelectOptions();
      const scheduleSec = document.getElementById('weeklyScheduleSection');
      const attSec = document.getElementById('studentAttendanceSection');
      if (isClassSelected && currentClassId) {
        scheduleSec?.classList.add('hidden');
        attSec?.classList.remove('hidden');
        renderAttendanceTab();
      } else {
        scheduleSec?.classList.remove('hidden');
        attSec?.classList.add('hidden');
        toggleScheduleViewMode(currentScheduleViewMode);
        renderWeeklyScheduleGrid();
      }
      if (currentTab === 'finance') renderFinanceTab();
      if (currentTab === 'homework') renderHomeworkTab();
      if (currentTab === 'classes') renderClassesManagementTab();
      if (currentRole === 'parent') renderParentView();
      const modal = document.getElementById('modalNotebook');
      if (modal && !modal.classList.contains('hidden')) {
        renderNotebookNotesList();
      }
      renderWorkspaceSwitcherUI();
      applySharedWorkspaceUiRestrictions();
      updateTeacherNotificationBadgeUI();
      safeCreateIcons();
    }

    // ==================== KHỞI TẠO ỨNG DỤNG ====================
    window.onload = function () {
      const todayInfo = getCurrentDayOfWeekInfo();
      const bannerDateEl = document.getElementById('currentDateDisplayBanner');
      if (bannerDateEl) {
        bannerDateEl.innerText = `${todayInfo.dayName}, ${todayInfo.dateFormatted}`;
      }

      loadScopedUserData();
      loadVipSubscriptionState();
      switchTab(currentTab || 'home');
      switchRole(currentRole || 'teacher');
      renderAll();
      startTrialExpirationWatcher();
      setupAutoCloudSyncListeners();
      if (teacherNotifPollTimer) clearInterval(teacherNotifPollTimer);
      teacherNotifPollTimer = setInterval(() => { pollLatestHomeworkSubmissions(); }, 60000);
      initSupabaseClient();
      // Luồng tải liên kết học sinh chỉ chạy sau khi xác thực xong (applyUserSession -> syncStudentLinksWithCloud).
      // Chỉ khi Supabase SDK không khởi tạo được (sẽ không có sự kiện xác thực nào) mới tải trực tiếp 1 lần.
      if (!supabaseClient) {
        studentClassLinks = getLocalStudentLinks();
        refreshAllStudentLinkedSessions();
      }
      loadVipPlansSettingsFromCloud();
      loadPioneerPromoSettings();
      safeCreateIcons();
    };
