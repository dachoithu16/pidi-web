    function escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const SUPABASE_URL = 'https://gsjatlnmeynwllptqdqf.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_-57pVqsTKuC3sYvM3nkkBg_NLcRFSVK';
    const VIP_ADMIN_EMAIL = 'thichthathinh2023@gmail.com';

    let supabaseClient = null;
    let currentUser = null;
    let authMode = 'signin';
    let hasCompletedInitialAuthCheck = false;

    function initSupabaseClient() {
      if (typeof supabase === 'undefined' || !supabase.createClient) {
        console.warn('Thư viện Supabase SDK chưa sẵn sàng.');
        return;
      }
      try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        listenToAuthChanges();
      } catch (e) {
        console.warn('Lỗi khởi tạo Supabase:', e);
      }
    }

    function getDefaultHomeworks() {
      return [
        {
          id: 'HW_DEFAULT_01',
          classId: 'class_ta_6_1',
          title: 'Ôn tập Unit 4: Thì Hiện tại đơn & Hiện tại tiếp diễn',
          deadline: '2026-11-25',
          description: 'Chọn đáp án đúng A, B, C, D cho các câu hỏi dưới đây.',
          totalPoints: 10,
          examPaper: {
            name: 'De_On_Tap_Unit_4.txt',
            text: 'BÀI TẬP ÔN TẬP UNIT 4\n\nCâu 1: She usually _____ to school by bike every morning.\nA. go    B. goes    C. going    D. went\n\nCâu 2: Listen! Someone _____ at the door.\nA. knocks    B. knocked    C. is knocking    D. knock'
          },
          questions: [
            {
              id: 'q_def_1',
              type: 'single_choice',
              title: 'Trắc nghiệm - Câu 1',
              prompt: 'She usually _____ to school by bike every morning.',
              options: [
                { letter: 'A', label: 'A. go' },
                { letter: 'B', label: 'B. goes' },
                { letter: 'C', label: 'C. going' },
                { letter: 'D', label: 'D. went' }
              ],
              correctAnswer: 'B',
              points: 5
            },
            {
              id: 'q_def_2',
              type: 'single_choice',
              title: 'Trắc nghiệm - Câu 2',
              prompt: 'Listen! Someone _____ at the door.',
              options: [
                { letter: 'A', label: 'A. knocks' },
                { letter: 'B', label: 'B. knocked' },
                { letter: 'C', label: 'C. is knocking' },
                { letter: 'D', label: 'D. knock' }
              ],
              correctAnswer: 'C',
              points: 5
            }
          ]
        }
      ];
    }

    function clearAllDemoDataCompletely() {
      classesList = [];
      classStudentsMap = {};
      homeworks = [];
      homeworkSubmissions = [];
      teacherNotebookNotes = [];
      editingNotebookNoteId = null;
      currentClassId = null;
      isClassSelected = false;
      students = [];
      try {
        ['classes', 'students', 'homeworks', 'submissions', 'notebook_notes'].forEach(suffix => {
          localStorage.removeItem(`dipi_guest_${suffix}`);
        });
      } catch (e) {}
    }

    function setCloudSyncBadge(state, detailText = '') {
      const btn = document.getElementById('cloudSyncStatusBtn');
      const icon = document.getElementById('cloudSyncIcon');
      const label = document.getElementById('cloudSyncLabel');
      const modalStatus = document.getElementById('syncModalStatusText');
      if (!btn) return;

      if (state === 'syncing') {
        btn.className = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold transition';
        if (icon) icon.setAttribute('data-lucide', 'refresh-cw');
        if (label) label.innerText = 'Đang lưu...';
        if (modalStatus) modalStatus.innerText = 'Đang đồng bộ lên bảng user_app_data...';
      } else if (state === 'synced') {
        btn.className = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold transition';
        if (icon) icon.setAttribute('data-lucide', 'cloud-check');
        if (label) label.innerText = 'Đã đồng bộ';
        if (modalStatus) modalStatus.innerText = detailText || 'Đã đồng bộ lên bảng user_app_data';
      } else {
        btn.className = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 border border-slate-300 text-[10px] font-bold transition';
        if (icon) icon.setAttribute('data-lucide', 'cloud-off');
        if (label) label.innerText = 'Lưu cục bộ';
        if (modalStatus) modalStatus.innerText = detailText || 'Đang lưu cục bộ trên thiết bị này';
      }
      safeCreateIcons();
    }

    function openCloudSyncModal() {
      const emailEl = document.getElementById('syncModalAccountEmail');
      const timeEl = document.getElementById('syncModalLastTime');
      if (emailEl) emailEl.innerText = currentUser?.email || 'Chưa đăng nhập';
      const prefix = getStorageKeyPrefix();
      const lastSync = localStorage.getItem(`${prefix}_last_synced_at`);
      if (timeEl) timeEl.innerText = lastSync ? new Date(lastSync).toLocaleString('vi-VN') : 'Chưa đồng bộ';
      openModal('modalCloudSyncInfo');
    }

    async function forceSyncNow() {
      await syncUserDataToCloud(true);
    }

    async function pullFromCloudNow() {
      if (!supabaseClient || !currentUser) return;
      await loadUserDataFromCloud(currentUser, true);
    }

    // ==================== HỆ THỐNG 5 GÓI ĐĂNG KÝ GIÁO VIÊN VIP & SALE ====================
    const DEFAULT_VIP_PLANS = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        yearlyPrice: 0,
        salePercent: 0,
        maxStudents: 15,
        maxTeachers: 1,
        badge: 'Mặc định',
        accent: 'slate',
        description: 'Đầy đủ tính năng cho giáo viên mới bắt đầu (tối đa 15 học sinh).'
      },
      {
        id: 'tra_chanh',
        name: 'Trà chanh',
        price: 19000,
        yearlyPrice: 190000,
        salePercent: 20,
        maxStudents: 35,
        maxTeachers: 1,
        badge: 'Tiết kiệm',
        accent: 'emerald',
        description: 'Đầy đủ tính năng, mở rộng giới hạn lên tới 35 học sinh.'
      },
      {
        id: 'tra_sua',
        name: 'Trà Sữa',
        price: 39000,
        yearlyPrice: 390000,
        salePercent: 25,
        maxStudents: 80,
        maxTeachers: 1,
        badge: 'Phổ biến nhất',
        accent: 'amber',
        description: 'Đầy đủ tính năng, quản lý thoải mái tới 80 học sinh.'
      },
      {
        id: 'trum_tra',
        name: 'Trùm Trà',
        price: 89000,
        yearlyPrice: 890000,
        salePercent: 35,
        maxStudents: 200,
        maxTeachers: 3,
        badge: 'Quy mô vừa',
        accent: 'indigo',
        description: 'Mở rộng tới 200 học sinh, ưu tiên hỗ trợ & tính năng mới.'
      },
      {
        id: 'trung_tam',
        name: 'Trung tâm',
        price: 399000,
        yearlyPrice: 3990000,
        salePercent: 30,
        maxStudents: 1000,
        maxTeachers: 12,
        badge: 'Quy mô lớn',
        accent: 'rose',
        description: 'Giải pháp quy mô lớn lên tới 1.000 học sinh & ưu tiên hỗ trợ 1-1.'
      }
    ];

    let activeWorkspaceMode = 'own';
    let activeSharedWorkspace = null;
    let mySharedWorkspacesList = [];
    let ownerHasActiveMembers = false;
    let lastVisibilityRefreshAt = 0;
    let workspaceMembersList = [];
    let isLoadingWorkspaceMembers = false;
    let editingWorkspaceMemberEmail = null;
    let wsMemberAssignedClassIds = ['*'];
    let wsMemberEditingIsActive = true;

    let vipPlansConfig = JSON.parse(JSON.stringify(DEFAULT_VIP_PLANS));
    let currentTeacherPlanId = 'free';
    let currentVipBillingCycle = 'monthly';
    let appliedVipPromo = null;
    let hasUserClearedVipPromo = false;
    let isValidatingVipPromo = false;
    let isVipAdminEditMode = false;
    let adminVipOrdersList = [];
    let isLoadingAdminVipOrders = false;
    let adminPromoCodesList = [];
    let isLoadingAdminPromoCodes = false;
    let trialStartedAtIso = null;
    let trialExpiresAtIso = null;
    let vipExpiresAtIso = null;
    let purchasedPlanId = null;
    let purchasedStartsAtIso = null;
    let hasUsedFreeTrial = false;
    let hasUsedPioneerDiscount = false;
    let lastThresholdWarnedPercent = 0;
    const TRIAL_DURATION_MINUTES = 30 * 24 * 60;
    const TRIAL_PLAN_ID = 'tra_sua';
    let trialCountdownTimer = null;
    let pioneerPromoState = { is_active: false, max_slots: 500, used_slots: 0 };

    // ==================== DỮ LIỆU MẶC ĐỊNH & LƯU TRỮ ====================
    const DAYS_OF_WEEK = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
    const DAY_TO_JS_INDEX = { 'Chủ Nhật': 0, 'Thứ 2': 1, 'Thứ 3': 2, 'Thứ 4': 3, 'Thứ 5': 4, 'Thứ 6': 5, 'Thứ 7': 6 };

    const YT_TIME_OPTIONS = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        YT_TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }

    const DEFAULT_CLASSES_LIST = [
      {
        id: 'class_ta_6_1',
        class_name: 'LỚP TIẾNG ANH 6.1',
        code: 'TA-6.1',
        room: 'P.101',
        schedules: [
          { day: 'Thứ 3', startTime: '19:30', endTime: '21:00' },
          { day: 'Thứ 7', startTime: '09:30', endTime: '11:00' }
        ],
        days: ['Thứ 3', 'Thứ 7'],
        timeSlot: '19h30 - 21h00',
        colorBg: 'bg-[#e8fbf0] hover:bg-[#d5f8e3] border-[#6ee7b7] text-slate-900',
        badgeColor: 'bg-[#10b981] text-white',
        fee_per_session: 40000
      },
      {
        id: 'class_ta_6_2',
        class_name: 'LỚP TIẾNG ANH 6.2',
        code: 'TA-6.2',
        room: 'P.102',
        schedules: [
          { day: 'Thứ 7', startTime: '14:30', endTime: '16:00' },
          { day: 'Chủ Nhật', startTime: '16:30', endTime: '18:00' }
        ],
        days: ['Thứ 7', 'Chủ Nhật'],
        timeSlot: '14h30 - 16h00',
        colorBg: 'bg-[#fef9c3]/70 hover:bg-[#fef08a] border-[#facc15] text-slate-900',
        badgeColor: 'bg-[#f59e0b] text-white',
        fee_per_session: 40000
      },
      {
        id: 'class_ta_7',
        class_name: 'LỚP TIẾNG ANH 7',
        code: 'TA-7',
        room: 'P.103',
        schedules: [
          { day: 'Thứ 2', startTime: '18:00', endTime: '19:30' },
          { day: 'Thứ 5', startTime: '18:00', endTime: '19:30' }
        ],
        days: ['Thứ 2', 'Thứ 5'],
        timeSlot: '18h00 - 19h30',
        colorBg: 'bg-[#f3e8ff]/80 hover:bg-[#e9d5ff] border-[#c084fc] text-slate-900',
        badgeColor: 'bg-[#9333ea] text-white',
        fee_per_session: 45000
      },
      {
        id: 'class_ta_8',
        class_name: 'LỚP TIẾNG ANH 8',
        code: 'TA-8',
        room: 'P.104',
        schedules: [
          { day: 'Thứ 6', startTime: '19:00', endTime: '20:30' }
        ],
        days: ['Thứ 6'],
        timeSlot: '19h00 - 20h30',
        colorBg: 'bg-[#fce7f3]/80 hover:bg-[#fbcfe8] border-[#f472b6] text-slate-900',
        badgeColor: 'bg-[#db2777] text-white',
        fee_per_session: 50000
      },
      {
        id: 'class_ta_9',
        class_name: 'LỚP TIẾNG ANH 9 (ÔN THI)',
        code: 'TA-9',
        room: 'P.203',
        schedules: [
          { day: 'Thứ 2', startTime: '19:45', endTime: '21:15' },
          { day: 'Thứ 5', startTime: '19:45', endTime: '21:15' }
        ],
        days: ['Thứ 2', 'Thứ 5'],
        timeSlot: '19h45 - 21h15',
        colorBg: 'bg-[#ccfbf1]/80 hover:bg-[#99f6e4] border-[#2dd4bf] text-slate-900',
        badgeColor: 'bg-[#0d9488] text-white',
        fee_per_session: 60000
      },
      {
        id: 'class_ta_5',
        class_name: 'LỚP TIẾNG ANH 5',
        code: 'TA-5',
        room: 'P.201',
        schedules: [
          { day: 'Thứ 4', startTime: '19:00', endTime: '21:00' },
          { day: 'Chủ Nhật', startTime: '14:30', endTime: '16:30' }
        ],
        days: ['Thứ 4', 'Chủ Nhật'],
        timeSlot: '19h00 - 21h00',
        colorBg: 'bg-[#e0f2fe]/80 hover:bg-[#bae6fd] border-[#38bdf8] text-slate-900',
        badgeColor: 'bg-[#0284c7] text-white',
        fee_per_session: 40000
      },
      {
        id: 'class_ta_4',
        class_name: 'LỚP TIẾNG ANH 4',
        code: 'TA-4',
        room: 'P.202',
        schedules: [
          { day: 'Thứ 7', startTime: '19:15', endTime: '21:15' },
          { day: 'Chủ Nhật', startTime: '19:15', endTime: '21:15' }
        ],
        days: ['Thứ 7', 'Chủ Nhật'],
        timeSlot: '19h15 - 21h15',
        colorBg: 'bg-[#ffedd5]/80 hover:bg-[#fed7aa] border-[#fb923c] text-slate-900',
        badgeColor: 'bg-[#ea580c] text-white',
        fee_per_session: 40000
      },
      {
        id: 'class_ta_3',
        class_name: 'LỚP TIẾNG ANH 3',
        code: 'TA-3',
        room: 'P.105',
        schedules: [
          { day: 'Thứ 4', startTime: '17:15', endTime: '18:45' },
          { day: 'Thứ 6', startTime: '17:15', endTime: '18:45' }
        ],
        days: ['Thứ 4', 'Thứ 6'],
        timeSlot: '17h15 - 18h45',
        colorBg: 'bg-[#fef3c7]/80 hover:bg-[#fde68a] border-[#fbbf24] text-slate-900',
        badgeColor: 'bg-[#d97706] text-white',
        fee_per_session: 40000
      }
    ];

    const DEFAULT_CLASS_STUDENTS_MAP = {
      'class_ta_6_1': [
        { id: '61_01', name: 'Ninh Ngọc Hà', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: { '03/11/2026': 'present', '07/11/2026': 'present', '10/11/2026': 'present', '14/11/2026': 'present', '17/11/2026': 'present' } },
        { id: '61_02', name: 'Nguyễn Minh Trung', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: { '03/11/2026': 'present', '07/11/2026': 'absent', '10/11/2026': 'present', '14/11/2026': 'present', '17/11/2026': 'present' } },
        { id: '61_03', name: 'Lê Hoàng Dũng', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: { '03/11/2026': 'present', '07/11/2026': 'present', '10/11/2026': 'present', '14/11/2026': 'present', '17/11/2026': 'present' } }
      ],
      'class_ta_6_2': [
        { id: '62_01', name: 'Trần Trọng Nghĩa', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: {} },
        { id: '62_02', name: 'Phạm Bảo Ngọc', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: {} }
      ],
      'class_ta_7': [
        { id: '7_01', name: 'Trần Minh Khôi', status: 'unrecorded', paidSessions: [], pricePerSession: 45000, attendanceHistory: {} },
        { id: '7_02', name: 'Lê Thảo Vy', status: 'unrecorded', paidSessions: [], pricePerSession: 45000, attendanceHistory: {} }
      ],
      'class_ta_8': [
        { id: '8_01', name: 'Vũ Hoàng Nam', status: 'unrecorded', paidSessions: [], pricePerSession: 50000, attendanceHistory: {} }
      ],
      'class_ta_9': [
        { id: '9_01', name: 'Nguyễn Hà My', status: 'unrecorded', paidSessions: [], pricePerSession: 60000, attendanceHistory: {} }
      ],
      'class_ta_5': [
        { id: '5_01', name: 'Nguyễn Tùng Dương', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: {} }
      ],
      'class_ta_4': [
        { id: '4_01', name: 'Lê Khánh Linh', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: {} }
      ],
      'class_ta_3': [
        { id: '3_01', name: 'Hoàng Minh Châu', status: 'unrecorded', paidSessions: [], pricePerSession: 40000, attendanceHistory: {} }
      ]
    };

    const SESSION_NAV_KEY = 'dipi_session_nav_state';
    const VALID_ROLES = ['teacher', 'parent'];
    const VALID_TABS = ['home', 'attendance', 'finance', 'homework', 'classes'];

    function readSessionNavState() {
      const savedPreferredRole = (() => { try { const r = localStorage.getItem('dipi_preferred_role'); return VALID_ROLES.includes(r) ? r : 'teacher'; } catch (e) { return 'teacher'; } })();
      try {
        const rawSession = sessionStorage.getItem(SESSION_NAV_KEY);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          if (parsed && typeof parsed === 'object') {
            return {
              role: VALID_ROLES.includes(parsed.role) ? parsed.role : savedPreferredRole,
              tab: VALID_TABS.includes(parsed.tab) ? parsed.tab : 'home',
              isClassSelected: Boolean(parsed.isClassSelected),
              classId: parsed.classId || null
            };
          }
        }
      } catch (e) {}
      return { role: savedPreferredRole, tab: 'home', isClassSelected: false, classId: null };
    }

    const _initialNavState = readSessionNavState();

    let classesList = [];
    let classStudentsMap = {};
    const ALL_CLASSES_ID = 'ALL_CLASSES';
    let currentClassId = _initialNavState.classId;
    let isClassSelected = _initialNavState.isClassSelected;
    let students = [];
    let currentRole = _initialNavState.role;
    let currentTab = _initialNavState.tab;
    let selectedStudentIds = [];
    let selectedAttendanceStudentIds = [];
    let currentScheduleViewMode = 'today';

    function saveUiNavigationState() {
      const stateObj = {
        role: VALID_ROLES.includes(currentRole) ? currentRole : 'teacher',
        tab: VALID_TABS.includes(currentTab) ? currentTab : 'home',
        isClassSelected: Boolean(isClassSelected),
        classId: currentClassId || ''
      };
      try {
        sessionStorage.setItem(SESSION_NAV_KEY, JSON.stringify(stateObj));
      } catch (e) {}
    }

    function resetUiNavigationToHome() {
      currentRole = (() => { try { const r = localStorage.getItem('dipi_preferred_role'); return VALID_ROLES.includes(r) ? r : 'teacher'; } catch (e) { return 'teacher'; } })();
      currentTab = 'home';
      isClassSelected = false;
      selectedParentStudentId = null;
      parentPortalSession = null;
      if (classesList.length > 0 && (!currentClassId || currentClassId === ALL_CLASSES_ID || !classesList.some(c => c.id === currentClassId))) {
        currentClassId = classesList[0].id;
      }
      try {
        sessionStorage.removeItem(SESSION_NAV_KEY);
        sessionStorage.removeItem('dipi_parent_verified_student_id');
      } catch (e) {}
    }

    let homeworks = [];
    let homeworkSubmissions = [];
    let teacherNotebookNotes = [];
    let editingNotebookNoteId = null;
    let teacherPaymentQr = { imageData: '', bankName: 'BIDV' };
    let tuitionRemarksMap = {};

    const _initNow = new Date();
    let financeFilterMode = 'month';
    let currentFinanceMonth = `${String(_initNow.getMonth() + 1).padStart(2, '0')}/${_initNow.getFullYear()}`;
    let selectedFinanceDates = [];
    let tempSelectedFinanceDates = [];
    let activePriceEditTarget = null;

    function getStorageKeyPrefix() {
      return (currentUser && currentUser.id) ? `dipi_user_${currentUser.id}` : 'dipi_guest';
    }

    function getTeacherNamespaceLetters() {
      const raw = (currentUser && (currentUser.id || currentUser.email))
        ? `${currentUser.id}_${currentUser.email || ''}`
        : (localStorage.getItem('dipi_guest_device_ns') || (() => {
            const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
            localStorage.setItem('dipi_guest_device_ns', rnd);
            return rnd;
          })());
      let hash = 2166136261;
      for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const val = (hash >>> 0) % 676;
      const firstChar = String.fromCharCode(65 + Math.floor(val / 26));
      const secondChar = String.fromCharCode(65 + (val % 26));
      return `${firstChar}${secondChar}`;
    }

    function isValidStudentCodeFormat(code) {
      return /^[A-Z]{2}\d{6}$/.test(code) && !/(\d)\1\1/.test(code);
    }

    function getAllExistingStudentCodesSet() {
      const codes = new Set();
      Object.values(classStudentsMap).forEach(list => {
        (list || []).forEach(st => {
          if (st && st.studentCode) codes.add(String(st.studentCode).toUpperCase());
        });
      });
      return codes;
    }

    function generateUniqueStudentCode(extraUsedSet = null) {
      const prefixLetters = getTeacherNamespaceLetters();
      const used = getAllExistingStudentCodesSet();
      if (extraUsedSet) extraUsedSet.forEach(c => used.add(c));

      let code = '';
      let attempts = 0;
      do {
        let digits = '';
        for (let i = 0; i < 6; i++) {
          let d;
          do {
            if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
              const arr = new Uint32Array(1);
              crypto.getRandomValues(arr);
              d = String(arr[0] % 10);
            } else {
              d = String(Math.floor(Math.random() * 10));
            }
          } while (i >= 2 && digits[i - 1] === d && digits[i - 2] === d);
          digits += d;
        }
        code = `${prefixLetters}${digits}`;
        attempts++;
      } while ((used.has(code) || !isValidStudentCodeFormat(code)) && attempts < 500);

      if (extraUsedSet) extraUsedSet.add(code);
      return code;
    }

    function ensureAllStudentsHaveUniqueCodes() {
      const used = new Set();
      let changed = false;
      Object.keys(classStudentsMap).forEach(clsId => {
        const list = classStudentsMap[clsId] || [];
        list.forEach(st => {
          const existing = st.studentCode ? String(st.studentCode).trim().toUpperCase() : '';
          if (!existing || !isValidStudentCodeFormat(existing) || used.has(existing)) {
            st.studentCode = generateUniqueStudentCode(used);
            changed = true;
          } else {
            st.studentCode = existing;
            used.add(existing);
          }
        });
      });
      return changed;
    }

    function loadScopedUserData() {
      const prefix = getStorageKeyPrefix();
      const savedClasses = localStorage.getItem(`${prefix}_classes`);
      const savedStudents = localStorage.getItem(`${prefix}_students`);
      const savedHomeworks = localStorage.getItem(`${prefix}_homeworks`);
      const savedSubmissions = localStorage.getItem(`${prefix}_submissions`);
      const savedNotebook = localStorage.getItem(`${prefix}_notebook_notes`);
      const savedQr = localStorage.getItem(`${prefix}_teacher_qr`);
      const savedRemarks = localStorage.getItem(`${prefix}_tuition_remarks`);

      try { teacherPaymentQr = savedQr ? JSON.parse(savedQr) : { imageData: '', bankName: 'BIDV' }; } catch (e) { teacherPaymentQr = { imageData: '', bankName: 'BIDV' }; }
      try { tuitionRemarksMap = savedRemarks ? JSON.parse(savedRemarks) : {}; } catch (e) { tuitionRemarksMap = {}; }

      if (currentUser && currentUser.id) {
        clearAllDemoDataCompletely();
        const defaultIds = new Set(DEFAULT_CLASSES_LIST.map(c => c.id));
        try {
          const parsedCls = savedClasses ? JSON.parse(savedClasses) : [];
          classesList = Array.isArray(parsedCls) ? parsedCls.filter(c => !defaultIds.has(c.id)) : [];
        } catch (e) { classesList = []; }
        try {
          const parsedSt = savedStudents ? JSON.parse(savedStudents) : {};
          classStudentsMap = {};
          Object.keys(parsedSt || {}).forEach(cid => {
            if (!defaultIds.has(cid)) classStudentsMap[cid] = parsedSt[cid];
          });
        } catch (e) { classStudentsMap = {}; }
        try {
          const parsedHw = savedHomeworks ? JSON.parse(savedHomeworks) : [];
          homeworks = Array.isArray(parsedHw) ? parsedHw.filter(h => h.id !== 'HW_DEFAULT_01') : [];
        } catch (e) { homeworks = []; }
        try { homeworkSubmissions = savedSubmissions ? JSON.parse(savedSubmissions) : []; } catch (e) { homeworkSubmissions = []; }
        try {
          const parsedNotes = savedNotebook ? JSON.parse(savedNotebook) : [];
          teacherNotebookNotes = Array.isArray(parsedNotes) ? parsedNotes : [];
        } catch (e) { teacherNotebookNotes = []; }
      } else {
        if (savedClasses && savedStudents) {
          try {
            classesList = JSON.parse(savedClasses);
            classStudentsMap = JSON.parse(savedStudents);
          } catch (e) {
            classesList = JSON.parse(JSON.stringify(DEFAULT_CLASSES_LIST));
            classStudentsMap = JSON.parse(JSON.stringify(DEFAULT_CLASS_STUDENTS_MAP));
          }
        } else {
          classesList = JSON.parse(JSON.stringify(DEFAULT_CLASSES_LIST));
          classStudentsMap = JSON.parse(JSON.stringify(DEFAULT_CLASS_STUDENTS_MAP));
        }
        try { homeworks = savedHomeworks ? JSON.parse(savedHomeworks) : getDefaultHomeworks(); } catch (e) { homeworks = getDefaultHomeworks(); }
        try { homeworkSubmissions = savedSubmissions ? JSON.parse(savedSubmissions) : []; } catch (e) { homeworkSubmissions = []; }
        try {
          const parsedNotes = savedNotebook ? JSON.parse(savedNotebook) : [];
          teacherNotebookNotes = Array.isArray(parsedNotes) ? parsedNotes : [];
        } catch (e) { teacherNotebookNotes = []; }
      }
      editingNotebookNoteId = null;

      const codesBackfilled = ensureAllStudentsHaveUniqueCodes();

      const navState = readSessionNavState();
      const candidateClassId = currentClassId || navState.classId;
      const candidateWasSelected = Boolean(isClassSelected);

      if (candidateClassId === ALL_CLASSES_ID) {
        currentClassId = ALL_CLASSES_ID;
      } else if (candidateClassId && classesList.some(c => c.id === candidateClassId)) {
        currentClassId = candidateClassId;
      } else {
        currentClassId = classesList.length > 0 ? classesList[0].id : null;
      }

      isClassSelected = candidateWasSelected && Boolean(currentClassId);
      students = getStudentsForClass(currentClassId);

      if (codesBackfilled) {
        saveAllToLocalStorage(false);
      }

      syncActiveAttendanceDateForCurrentClass();
      syncFinanceDatesForCurrentClass();
    }

    function saveAllToLocalStorage(syncCloudNow = false) {
      if (activeWorkspaceMode === 'shared') {
        return;
      }
      try {
        const prefix = getStorageKeyPrefix();
        localStorage.setItem(`${prefix}_classes`, JSON.stringify(classesList));
        localStorage.setItem(`${prefix}_students`, JSON.stringify(classStudentsMap));
        localStorage.setItem(`${prefix}_homeworks`, JSON.stringify(homeworks));
        localStorage.setItem(`${prefix}_submissions`, JSON.stringify(homeworkSubmissions));
        localStorage.setItem(`${prefix}_notebook_notes`, JSON.stringify(teacherNotebookNotes));
        localStorage.setItem(`${prefix}_teacher_qr`, JSON.stringify(teacherPaymentQr));
        localStorage.setItem(`${prefix}_tuition_remarks`, JSON.stringify(tuitionRemarksMap));
        updateHeaderVipBadge();
        renderHomeTab();
        if (syncCloudNow && currentUser && currentUser.id) {
          scheduleAutoCloudSync();
        }
      } catch (e) {
        console.warn('Lỗi lưu localStorage:', e);
      }
    }

    function compareVietnameseStudentNames(a, b) {
      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      const partsA = nameA.split(/\s+/);
      const partsB = nameB.split(/\s+/);
      const givenA = partsA[partsA.length - 1] || '';
      const givenB = partsB[partsB.length - 1] || '';
      const cmpGiven = givenA.localeCompare(givenB, 'vi', { sensitivity: 'base' });
      if (cmpGiven !== 0) return cmpGiven;
      return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
    }

    function getStudentsForClass(clsId) {
      if (!clsId) return [];
      if (clsId === ALL_CLASSES_ID) {
        const merged = [];
        classesList.forEach(cls => {
          const list = classStudentsMap[cls.id] || [];
          list.forEach(st => {
            merged.push(Object.assign(st, { _classId: cls.id, _className: cls.class_name }));
          });
        });
        return merged.sort(compareVietnameseStudentNames);
      }
      const list = classStudentsMap[clsId] || [];
      const cls = classesList.find(c => c.id === clsId);
      list.forEach(st => {
        st._classId = clsId;
        st._className = cls ? cls.class_name : '';
      });
      return [...list].sort(compareVietnameseStudentNames);
    }

    function findStudentAndClassById(studentId) {
      for (const cls of classesList) {
        const list = classStudentsMap[cls.id] || [];
        const found = list.find(s => s.id === studentId);
        if (found) {
          return { student: found, classId: cls.id, classObj: cls };
        }
      }
      return null;
    }

    // ==================== ĐỒNG BỘ ĐÁM MÂY QUA BẢNG user_app_data ====================
    let isSyncingCloud = false;
    let cloudSyncDebounceTimer = null;

    function buildAppDataPayload() {
      const compactHomeworks = homeworks.map(hw => ({
        ...hw,
        examPaper: hw.examPaper ? {
          name: hw.examPaper.name,
          text: (hw.examPaper.text || '').slice(0, 60000)
        } : null
      }));
      return {
        classesList,
        classStudentsMap,
        homeworks: compactHomeworks,
        homeworkSubmissions: Array.isArray(homeworkSubmissions) ? homeworkSubmissions : [],
        teacherNotebookNotes,
        teacherPaymentQr,
        tuitionRemarksMap,
        currentTeacherPlanId,
        purchasedPlanId,
        purchasedStartsAtIso,
        vipExpiresAt: vipExpiresAtIso,
        trialStartedAtIso,
        trialExpiresAt: trialExpiresAtIso,
        hasUsedFreeTrial,
        hasUsedPioneerDiscount
      };
    }

    // Gộp danh sách bài nộp theo id duy nhất: giữ bài cũ, thêm bài mới, bài trùng id thì lấy bản ở overrideList, không tạo bản trùng.
    function mergeHomeworkSubmissionsById(baseList, overrideList) {
      const mergedMap = new Map();
      const putSub = (sub) => {
        if (!sub || typeof sub !== 'object') return;
        const key = sub.id
          ? String(sub.id)
          : ((sub.homeworkId && sub.studentId) ? `${sub.homeworkId}__${sub.studentId}__${sub.submittedAt || ''}` : '');
        if (!key) return;
        mergedMap.set(key, sub);
      };
      (Array.isArray(baseList) ? baseList : []).forEach(putSub);
      (Array.isArray(overrideList) ? overrideList : []).forEach(putSub);
      return Array.from(mergedMap.values());
    }

    function scheduleAutoCloudSync() {
      if (!currentUser || !currentUser.id) return;
      clearTimeout(cloudSyncDebounceTimer);
      cloudSyncDebounceTimer = setTimeout(() => {
        syncUserDataToCloud(false);
      }, 1500);
    }

    async function loadUserDataFromCloud(userObj, showToastFeedback = false) {
      const userId = userObj?.id || currentUser?.id;
      if (!supabaseClient || !userId) return;
      try {
        setCloudSyncBadge('syncing');
        const { data: row, error } = await supabaseClient
          .from('user_app_data')
          .select('data')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.warn('Lỗi đọc bảng user_app_data:', error.message);
          setCloudSyncBadge('local', 'Lưu cục bộ');
          return;
        }

        if (row && row.data && typeof row.data === 'object') {
          const appData = row.data;
          if (Array.isArray(appData.classesList)) classesList = appData.classesList;
          if (appData.classStudentsMap && typeof appData.classStudentsMap === 'object') classStudentsMap = appData.classStudentsMap;
          if (Array.isArray(appData.homeworks)) homeworks = appData.homeworks;
          if (Array.isArray(appData.homeworkSubmissions)) homeworkSubmissions = appData.homeworkSubmissions;
          if (Array.isArray(appData.teacherNotebookNotes)) teacherNotebookNotes = appData.teacherNotebookNotes;
          if (appData.teacherPaymentQr && typeof appData.teacherPaymentQr === 'object') teacherPaymentQr = appData.teacherPaymentQr;
          if (appData.tuitionRemarksMap && typeof appData.tuitionRemarksMap === 'object') tuitionRemarksMap = appData.tuitionRemarksMap;
          if (appData.currentTeacherPlanId && vipPlansConfig.some(p => p.id === appData.currentTeacherPlanId)) {
            currentTeacherPlanId = appData.currentTeacherPlanId;
            localStorage.setItem(`${getStorageKeyPrefix()}_active_vip_plan`, currentTeacherPlanId);
          }
          if (appData.purchasedPlanId !== undefined) {
            purchasedPlanId = (appData.purchasedPlanId && vipPlansConfig.some(p => p.id === appData.purchasedPlanId))
              ? appData.purchasedPlanId
              : null;
            if (purchasedPlanId) {
              localStorage.setItem(`${getStorageKeyPrefix()}_purchased_vip_plan`, purchasedPlanId);
            } else {
              localStorage.removeItem(`${getStorageKeyPrefix()}_purchased_vip_plan`);
            }
          }
          const remotePurchasedStart = appData.purchasedStartsAt !== undefined
            ? appData.purchasedStartsAt
            : appData.purchasedStartsAtIso;
          if (remotePurchasedStart !== undefined) {
            purchasedStartsAtIso = remotePurchasedStart || null;
            if (purchasedStartsAtIso) {
              localStorage.setItem(`${getStorageKeyPrefix()}_purchased_starts_at`, purchasedStartsAtIso);
            } else {
              localStorage.removeItem(`${getStorageKeyPrefix()}_purchased_starts_at`);
            }
          }
          if (appData.vipExpiresAt !== undefined) {
            vipExpiresAtIso = appData.vipExpiresAt || null;
            if (vipExpiresAtIso) {
              localStorage.setItem(`${getStorageKeyPrefix()}_vip_expires_at`, vipExpiresAtIso);
            } else {
              localStorage.removeItem(`${getStorageKeyPrefix()}_vip_expires_at`);
            }
          }
          if (appData.trialStartedAtIso) {
            trialStartedAtIso = appData.trialStartedAtIso;
            hasUsedFreeTrial = true;
            if (currentUser && currentUser.id) {
              localStorage.setItem(`dipi_user_${currentUser.id}_trial_started_at`, trialStartedAtIso);
              localStorage.setItem(`dipi_user_${currentUser.id}_trial_used`, '1');
            }
          }
          if (appData.trialExpiresAt !== undefined) {
            trialExpiresAtIso = appData.trialExpiresAt || null;
            if (currentUser && currentUser.id) {
              if (trialExpiresAtIso) {
                localStorage.setItem(`dipi_user_${currentUser.id}_trial_expires_at`, trialExpiresAtIso);
              } else {
                localStorage.removeItem(`dipi_user_${currentUser.id}_trial_expires_at`);
              }
            }
          } else if (trialStartedAtIso && !trialExpiresAtIso) {
            const startedMs = new Date(trialStartedAtIso).getTime();
            if (!Number.isNaN(startedMs)) {
              trialExpiresAtIso = new Date(startedMs + 30 * 86400000).toISOString();
              if (currentUser && currentUser.id) {
                localStorage.setItem(`dipi_user_${currentUser.id}_trial_expires_at`, trialExpiresAtIso);
              }
            }
          }
          if (appData.hasUsedFreeTrial) {
            hasUsedFreeTrial = true;
            if (currentUser && currentUser.id) {
              localStorage.setItem(`dipi_user_${currentUser.id}_trial_used`, '1');
            }
          }
          if (appData.hasUsedPioneerDiscount) {
            hasUsedPioneerDiscount = true;
            if (currentUser && currentUser.id) {
              localStorage.setItem(`dipi_user_${currentUser.id}_pioneer_used`, '1');
            }
          }

          enforcePaidVipExpirationIfNeeded();
          enforceTrialExpirationIfNeeded();
          updateHeaderVipBadge();

          ensureAllStudentsHaveUniqueCodes();
          const navState = readSessionNavState();
          const desiredClassId = currentClassId || navState.classId;
          if (desiredClassId === ALL_CLASSES_ID) {
            currentClassId = ALL_CLASSES_ID;
          } else if (desiredClassId && classesList.some(c => c.id === desiredClassId)) {
            currentClassId = desiredClassId;
          } else {
            currentClassId = classesList.length > 0 ? classesList[0].id : null;
          }
          isClassSelected = Boolean(navState.isClassSelected) && Boolean(currentClassId);
          students = getStudentsForClass(currentClassId);
          saveAllToLocalStorage(false);
          syncActiveAttendanceDateForCurrentClass();
          syncFinanceDatesForCurrentClass();
          renderAll();
        } else {
          clearAllDemoDataCompletely();
          saveAllToLocalStorage(false);
          renderAll();
        }

        const prefix = getStorageKeyPrefix();
        localStorage.setItem(`${prefix}_last_synced_at`, new Date().toISOString());
        setCloudSyncBadge('synced', 'Đã đồng bộ đám mây');
        updateTeacherNotificationBadgeUI();
        if (showToastFeedback) showUndoToast('Đã tải dữ liệu mới nhất từ đám mây!');
      } catch (err) {
        console.warn('Lỗi tải dữ liệu đám mây:', err);
        setCloudSyncBadge('local', 'Lưu cục bộ');
      }
    }

    async function syncUserDataToCloud(showToastFeedback = false) {
      if (activeWorkspaceMode === 'shared') return;
      if (!supabaseClient || !currentUser?.id || isSyncingCloud) return;
      isSyncingCloud = true;
      setCloudSyncBadge('syncing');
      try {
        try {
          const { data: remoteRow } = await supabaseClient
            .from('user_app_data')
            .select('data')
            .eq('user_id', currentUser.id)
            .maybeSingle();

          const remoteData = remoteRow?.data;
          if (remoteData && typeof remoteData === 'object') {
            if (remoteData.vipExpiresAt && remoteData.currentTeacherPlanId && remoteData.currentTeacherPlanId !== 'free') {
              const remoteExpMs = new Date(remoteData.vipExpiresAt).getTime();
              const localExpMs = vipExpiresAtIso ? new Date(vipExpiresAtIso).getTime() : 0;
              const remotePurchasedId = remoteData.purchasedPlanId || null;
              const remoteHasNewerVip = !Number.isNaN(remoteExpMs) && remoteExpMs > Date.now() && (
                remoteExpMs > (localExpMs || 0) ||
                (remotePurchasedId && remotePurchasedId !== purchasedPlanId)
              );
              if (remoteHasNewerVip) {
                currentTeacherPlanId = remoteData.currentTeacherPlanId;
                vipExpiresAtIso = remoteData.vipExpiresAt;
                if (remoteData.purchasedPlanId !== undefined) {
                  purchasedPlanId = (remoteData.purchasedPlanId && vipPlansConfig.some(p => p.id === remoteData.purchasedPlanId))
                    ? remoteData.purchasedPlanId
                    : null;
                }
                purchasedStartsAtIso = remoteData.purchasedStartsAt ?? remoteData.purchasedStartsAtIso ?? purchasedStartsAtIso;
                trialExpiresAtIso = remoteData.trialExpiresAt !== undefined ? remoteData.trialExpiresAt : trialExpiresAtIso;
                const mergedTrialExpMs = trialExpiresAtIso ? new Date(trialExpiresAtIso).getTime() : NaN;
                if (purchasedPlanId === 'tra_chanh' && currentTeacherPlanId === TRIAL_PLAN_ID && !Number.isNaN(mergedTrialExpMs) && mergedTrialExpMs <= Date.now()) {
                  currentTeacherPlanId = 'tra_chanh';
                }
                if (remoteData.hasUsedPioneerDiscount) {
                  hasUsedPioneerDiscount = true;
                }

                const prefix = getStorageKeyPrefix();
                localStorage.setItem(`${prefix}_active_vip_plan`, currentTeacherPlanId);
                localStorage.setItem(`${prefix}_vip_expires_at`, vipExpiresAtIso);
                if (purchasedPlanId) {
                  localStorage.setItem(`${prefix}_purchased_vip_plan`, purchasedPlanId);
                } else {
                  localStorage.removeItem(`${prefix}_purchased_vip_plan`);
                }
                if (purchasedStartsAtIso) {
                  localStorage.setItem(`${prefix}_purchased_starts_at`, purchasedStartsAtIso);
                } else {
                  localStorage.removeItem(`${prefix}_purchased_starts_at`);
                }
                if (currentUser && currentUser.id) {
                  if (trialExpiresAtIso) {
                    localStorage.setItem(`dipi_user_${currentUser.id}_trial_expires_at`, trialExpiresAtIso);
                  } else {
                    localStorage.removeItem(`dipi_user_${currentUser.id}_trial_expires_at`);
                  }
                  if (hasUsedPioneerDiscount) {
                    localStorage.setItem(`dipi_user_${currentUser.id}_pioneer_used`, '1');
                  }
                }
                updateHeaderVipBadge();
              }
            }

            const remoteSubs = remoteData.homeworkSubmissions;
            if (Array.isArray(remoteSubs) && remoteSubs.length > 0) {
              homeworkSubmissions = mergeHomeworkSubmissionsById(remoteSubs, homeworkSubmissions);
              saveAllToLocalStorage(false);
            }
          }
        } catch (mergeErr) {
          console.warn('Bỏ qua bước gộp dữ liệu từ xa:', mergeErr);
        }

        const appData = buildAppDataPayload();
        const { error } = await supabaseClient
          .from('user_app_data')
          .upsert({
            user_id: currentUser.id,
            data: appData,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          console.warn('Sync cloud error:', error.message);
          setCloudSyncBadge('local', 'Lưu cục bộ');
        } else {
          const prefix = getStorageKeyPrefix();
          localStorage.setItem(`${prefix}_last_synced_at`, new Date().toISOString());
          setCloudSyncBadge('synced', 'Đã đồng bộ đám mây');
          if (showToastFeedback) showUndoToast('Đã đồng bộ dữ liệu lên đám mây!');
        }
      } catch (err) {
        console.warn('Lỗi sync đám mây:', err);
        setCloudSyncBadge('local', 'Lưu cục bộ');
      } finally {
        isSyncingCloud = false;
      }
    }

    function setupAutoCloudSyncListeners() {
      window.addEventListener('online', () => {
        if (currentUser?.id && activeWorkspaceMode === 'own') syncUserDataToCloud(false);
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const nowMs = Date.now();
        if (nowMs - lastVisibilityRefreshAt < 15000) return;

        // Tránh làm mới khi người dùng đang mở modal nhập liệu/chỉnh sửa
        const blockingModalIds = [
          'modalAddStudent',
          'modalCreateAssignment',
          'modalTakeHomework',
          'modalGradeHomework',
          'modalCreateClass',
          'modalEditClass',
          'modalEditFeePrice',
          'modalStudentDetail',
          'modalTuitionNotice',
          'modalNotebook',
          'modalWorkspaceMembers',
          'modalVipVietQrCheckout'
        ];
        const hasOpenInputModal = blockingModalIds.some(id => {
          const el = document.getElementById(id);
          return el && !el.classList.contains('hidden');
        });
        if (hasOpenInputModal) return;

        lastVisibilityRefreshAt = nowMs;

        pollLatestHomeworkSubmissions();

        if (currentRole === 'parent' && studentClassLinks.length > 0) {
          refreshAllStudentLinkedSessions();
        }

        if (activeWorkspaceMode === 'shared' && activeSharedWorkspace?.owner_id) {
          switchActiveWorkspace(activeSharedWorkspace.owner_id, true);
        } else if (activeWorkspaceMode === 'own' && ownerHasActiveMembers === true && !isSyncingCloud && currentUser?.id) {
          loadUserDataFromCloud(currentUser, false);
        }
      });
    }

    // ==================== TIỆN ÍCH NGÀY THÁNG & UI ====================
    function generateClassSessionDates(classSchedules, targetMonths = null) {
      if (!Array.isArray(classSchedules) || classSchedules.length === 0) return [];
      const scheduledDayIndexes = classSchedules.map(s => DAY_TO_JS_INDEX[s.day]).filter(i => i !== undefined);
      if (scheduledDayIndexes.length === 0) return [];

      if (!targetMonths) {
        targetMonths = [];
        const baseDate = new Date();
        for (let offset = -2; offset <= 3; offset++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
          targetMonths.push({ month: d.getMonth() + 1, year: d.getFullYear() });
        }
      }

      const resultDates = [];
      targetMonths.forEach(({ month, year }) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateObj = new Date(year, month - 1, day);
          if (scheduledDayIndexes.includes(dateObj.getDay())) {
            resultDates.push(`${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`);
          }
        }
      });

      resultDates.sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
      });
      return resultDates;
    }

    function getTodayFullDateString() {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }

    function getCurrentClassSessionDates(clsId = currentClassId) {
      if (!clsId) return [];
      if (clsId === ALL_CLASSES_ID) {
        const dateSet = new Set();
        classesList.forEach(cls => {
          getCurrentClassSessionDates(cls.id).forEach(d => dateSet.add(d));
        });
        return Array.from(dateSet).sort((a, b) => {
          const [d1, m1, y1] = a.split('/').map(Number);
          const [d2, m2, y2] = b.split('/').map(Number);
          return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        });
      }
      const cls = classesList.find(c => c.id === clsId);
      if (!cls) return [];
      if (Array.isArray(cls.schedules) && cls.schedules.length > 0) {
        const calculated = generateClassSessionDates(cls.schedules);
        cls.sessionDates = calculated;
        return calculated;
      }
      return Array.isArray(cls.sessionDates) ? cls.sessionDates : [];
    }

    let activeAttendanceDate = '';

    function syncActiveAttendanceDateForCurrentClass() {
      const classDates = getCurrentClassSessionDates(currentClassId);
      const todayStr = getTodayFullDateString();
      if (classDates.includes(todayStr)) {
        activeAttendanceDate = todayStr;
      } else if (classDates.includes(activeAttendanceDate)) {
        // Keep current
      } else if (classDates.length > 0) {
        const now = new Date();
        const curMonthStr = `/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const curMonthDates = classDates.filter(d => d.includes(curMonthStr));
        activeAttendanceDate = curMonthDates.length > 0 ? curMonthDates[0] : classDates[0];
      } else {
        activeAttendanceDate = todayStr;
      }
    }

    function getShortName(fullName) {
      if (!fullName) return '';
      const parts = fullName.trim().split(/\s+/);
      return parts.length <= 2 ? fullName : parts.slice(-2).join(' ');
    }

    function formatMoneyK(amount) {
      const num = Number(amount) || 0;
      if (num === 0) return '0k';
      if (num % 1000 === 0) return `${(num / 1000).toLocaleString('vi-VN')}k`;
      return `${(num / 1000).toFixed(1).replace('.', ',')}k`;
    }

    function getCurrentDayOfWeekInfo() {
      const now = new Date();
      const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const dayName = days[now.getDay()];
      const yearShort = String(now.getFullYear()).slice(-2);
      const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${yearShort}`;
      return { dayName, dateFormatted };
    }

    function showUndoToast(msg) {
      const toast = document.getElementById('undoToast');
      const label = document.getElementById('undoToastMessage');
      if (!toast || !label) return;
      label.innerText = msg;
      toast.classList.remove('hidden');
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }

    function safeCreateIcons() {
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      } catch (e) {}
    }

    function openConfirmModal(title, desc, onConfirm) {
      const titleEl = document.getElementById('confirmActionTitle');
      const descEl = document.getElementById('confirmActionDesc');
      const btn = document.getElementById('confirmActionExecuteBtn');
      if (titleEl) titleEl.innerText = title;
      if (descEl) descEl.innerText = desc;
      if (btn) {
        btn.onclick = () => {
          closeModal('modalConfirmAction');
          if (typeof onConfirm === 'function') onConfirm();
        };
      }
      openModal('modalConfirmAction');
    }

    let selectedParentStudentId = (() => {
      try {
        return sessionStorage.getItem('dipi_parent_verified_student_id') || null;
      } catch (e) {
        return null;
      }
    })();
    let parentPortalSession = null;

    // Key gốc cũ (dùng chung cả trình duyệt) -- chỉ còn dùng để di chuyển dữ liệu cũ sang key khách.
    const STUDENT_LINKS_LOCAL_KEY = 'dipi_student_class_links_v1';
    let studentClassLinks = [];
    let studentLinkedSessions = [];
    let activeStudentLinkCode = null;
    let isShowingAddStudentLinkForm = false;

    function openModal(id) {
      document.getElementById(id)?.classList.remove('hidden');
      safeCreateIcons();
    }

    function closeModal(id) {
      if (id === 'modalVipVietQrCheckout') {
        stopVipVietQrStatusPolling();
      }
      document.getElementById(id)?.classList.add('hidden');
    }

