    async function applyUserSession(session, forceResetHome = false) {
      const prevUserId = currentUser?.id || null;
      const nextUserId = session?.user?.id || null;
      const isNewSignIn = forceResetHome || (hasCompletedInitialAuthCheck && prevUserId !== nextUserId && nextUserId !== null);

      if (session && session.user) {
        const meta = session.user.user_metadata || {};
        currentUser = {
          id: session.user.id,
          email: session.user.email,
          full_name: meta.full_name || meta.name || session.user.email?.split('@')[0] || 'User',
          avatar_url: meta.avatar_url || meta.picture || null
        };
      } else {
        currentUser = null;
      }

      // Đổi tài khoản (hoặc đăng xuất do hết phiên) -> dọn liên kết học sinh trong RAM, tránh hiện/đẩy chéo giữa 2 tài khoản.
      if (prevUserId !== nextUserId) {
        studentClassLinks = [];
        studentLinkedSessions = [];
        activeStudentLinkCode = null;
        parentPortalSession = null;
      }

      if (isNewSignIn) {
        resetUiNavigationToHome();
      }

      updateAuthUI();
      loadScopedUserData();
      loadVipSubscriptionState();

      if (isNewSignIn) {
        switchTab('home');
        switchRole(currentRole || 'teacher', false);
      }

      renderAll();

      if (session && session.user) {
        await loadUserDataFromCloud(session.user);
        const activatedNow = await autoActivateThirtyDayTrialIfEligible();
        if (activatedNow) {
          updateHeaderVipBadge();
          renderVipSubscriptionModal();
          renderHomeTab();
        }
        maybeShowFirstLoginVipPromo();
        await loadMySharedWorkspaces();
        await checkOwnerHasActiveMembers();
        await syncStudentLinksWithCloud();
      } else {
        activeWorkspaceMode = 'own';
        activeSharedWorkspace = null;
        mySharedWorkspacesList = [];
        ownerHasActiveMembers = false;
        workspaceMembersList = [];
        renderWorkspaceSwitcherUI();
        applySharedWorkspaceUiRestrictions();
        await syncStudentLinksWithCloud();
      }
    }

    function setAuthError(message) {
      const el = document.getElementById('authErrorMessage');
      if (!el) return;
      if (message) {
        el.innerText = message;
        el.classList.remove('hidden');
      } else {
        el.innerText = '';
        el.classList.add('hidden');
      }
    }

    async function listenToAuthChanges() {
      if (!supabaseClient) return;
      const isOAuthCallback = /access_token=|refresh_token=|error_description=/i.test(window.location.hash || '');
      let lastHandledSessionUserId = null;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          lastHandledSessionUserId = session.user?.id || null;
          await applyUserSession(session, isOAuthCallback);
        }
      } catch (err) {
        console.warn('Lỗi getSession:', err);
      } finally {
        hasCompletedInitialAuthCheck = true;
      }

      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const incomingUserId = session?.user?.id || null;
        if (event === 'SIGNED_IN') {
          if (incomingUserId && incomingUserId === lastHandledSessionUserId && currentUser?.id === incomingUserId) {
            return;
          }
          lastHandledSessionUserId = incomingUserId;
          await applyUserSession(session, true);
        } else if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          if (incomingUserId && incomingUserId === lastHandledSessionUserId && currentUser?.id === incomingUserId) {
            return;
          }
          lastHandledSessionUserId = incomingUserId;
          await applyUserSession(session, false);
        } else if (event === 'SIGNED_OUT') {
          lastHandledSessionUserId = null;
          resetUiNavigationToHome();
          await applyUserSession(null, true);
          switchTab('home');
          switchRole(currentRole || 'teacher', false);
        }
      });
    }

    function updateAuthUI() {
      const btnOpenAuth = document.getElementById('btnOpenAuthModal');
      const profileBadge = document.getElementById('userProfileBadge');
      const avatarImg = document.getElementById('userAvatarImg');
      const avatarFallback = document.getElementById('userAvatarFallback');
      const nameEl = document.getElementById('userDisplayName');

      if (currentUser) {
        btnOpenAuth?.classList.add('hidden');
        profileBadge?.classList.remove('hidden');
        profileBadge?.classList.add('flex');
        if (nameEl) nameEl.innerText = currentUser.full_name;
        if (currentUser.avatar_url && avatarImg) {
          avatarImg.src = currentUser.avatar_url;
          avatarImg.classList.remove('hidden');
          avatarFallback?.classList.add('hidden');
        } else if (avatarFallback) {
          avatarFallback.innerText = currentUser.full_name.charAt(0).toUpperCase();
          avatarFallback.classList.remove('hidden');
          avatarImg?.classList.add('hidden');
        }
      } else {
        btnOpenAuth?.classList.remove('hidden');
        profileBadge?.classList.add('hidden');
        profileBadge?.classList.remove('flex');
      }
      safeCreateIcons();
    }

    function openAuthModal(mode = 'signin') {
      authMode = mode;
      setAuthError(null);
      updateAuthModalTexts();
      openModal('modalAuth');
    }

    function toggleAuthMode() {
      authMode = (authMode === 'signin') ? 'signup' : 'signin';
      setAuthError(null);
      updateAuthModalTexts();
    }

    function updateAuthModalTexts() {
      const title = document.getElementById('authModalTitle');
      const subtitle = document.getElementById('authModalSubtitle');
      const submitBtn = document.getElementById('btnAuthSubmit');
      const question = document.getElementById('authToggleQuestion');
      const toggleBtn = document.getElementById('authToggleBtn');

      if (authMode === 'signin') {
        if (title) title.innerText = 'Đăng nhập DPA';
        if (subtitle) subtitle.innerText = 'Lưu trữ và đồng bộ hóa lớp học của bạn';
        if (submitBtn) submitBtn.innerText = 'Đăng nhập';
        if (question) question.innerText = 'Chưa có tài khoản?';
        if (toggleBtn) toggleBtn.innerText = 'Đăng ký ngay';
      } else {
        if (title) title.innerText = 'Tạo tài khoản DPA';
        if (subtitle) subtitle.innerText = 'Bắt đầu quản lý lớp học dễ dàng hôm nay';
        if (submitBtn) submitBtn.innerText = 'Đăng ký tài khoản';
        if (question) question.innerText = 'Đã có tài khoản?';
        if (toggleBtn) toggleBtn.innerText = 'Đăng nhập';
      }
    }

    async function handleGoogleSignIn() {
      setAuthError(null);
      if (!supabaseClient) initSupabaseClient();
      if (!supabaseClient) {
        setAuthError('Chưa cấu hình SUPABASE_ANON_KEY hợp lệ.');
        return;
      }
      try {
        resetUiNavigationToHome();
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) setAuthError(`Lỗi Google OAuth: ${error.message}`);
      } catch (err) {
        setAuthError('Không thể kết nối đến Google OAuth.');
      }
    }

    async function handleEmailAuthSubmit(e) {
      e.preventDefault();
      setAuthError(null);
      if (!supabaseClient) initSupabaseClient();
      const email = document.getElementById('authEmailInput')?.value.trim();
      const password = document.getElementById('authPasswordInput')?.value;
      if (!email || !password) return;

      const submitBtn = document.getElementById('btnAuthSubmit');
      const originalText = submitBtn ? submitBtn.innerText : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Đang xử lý...';
      }

      try {
        if (authMode === 'signin') {
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) {
            setAuthError(error.message.includes('Invalid login') ? 'Email hoặc mật khẩu không chính xác.' : error.message);
          } else {
            resetUiNavigationToHome();
            switchTab('home');
            switchRole(currentRole || 'teacher', false);
            closeModal('modalAuth');
          }
        } else {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error) {
            setAuthError(`Đăng ký thất bại: ${error.message}`);
          } else if (data?.session) {
            resetUiNavigationToHome();
            switchTab('home');
            switchRole(currentRole || 'teacher', false);
            closeModal('modalAuth');
          } else {
            setAuthError('Đăng ký thành công! Vui lòng kiểm tra hộp thư đến để kích hoạt tài khoản.');
          }
        }
      } catch (err) {
        setAuthError('Có lỗi kết nối mạng.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalText;
        }
      }
    }

    async function handleSignOut() {
      resetUiNavigationToHome();
      activeWorkspaceMode = 'own';
      activeSharedWorkspace = null;
      mySharedWorkspacesList = [];
      ownerHasActiveMembers = false;
      workspaceMembersList = [];
      studentClassLinks = [];
      studentLinkedSessions = [];
      activeStudentLinkCode = null;
      parentPortalSession = null;
      try {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
        }
      } catch (err) {
        console.error('Lỗi signOut:', err);
      }
      currentUser = null;
      updateAuthUI();
      updateTeacherNotificationBadgeUI();
      renderWorkspaceSwitcherUI();
      loadScopedUserData();
      loadVipSubscriptionState();
      switchTab('home');
      switchRole(currentRole || 'teacher', false);
      renderAll();
    }

    function getActivePioneerDiscountPercent() {
      if (isPaidVipActive()) return 0;
      if (!pioneerPromoState || !pioneerPromoState.is_active) return 0;
      if ((Number(pioneerPromoState.used_slots) || 0) >= (Number(pioneerPromoState.max_slots) || 500)) return 0;
      if (hasUsedPioneerDiscount === true) return 0;
      if (!trialStartedAtIso) return 0;

      const startedMs = new Date(trialStartedAtIso).getTime();
      if (Number.isNaN(startedMs)) return 0;

      const elapsedMs = Math.max(0, Date.now() - startedMs);
      const elapsedDays = Math.ceil(elapsedMs / 86400000);
      if (elapsedDays <= 15) return 35;
      if (elapsedDays <= 30) return 25;
      return 0;
    }

    async function loadPioneerPromoSettings() {
      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient
          .from('app_promo_settings')
          .select('is_active, max_slots, used_slots')
          .eq('id', 'pioneer_500')
          .maybeSingle();

        if (!error && data) {
          pioneerPromoState = {
            is_active: Boolean(data.is_active),
            max_slots: Number(data.max_slots) || 500,
            used_slots: Number(data.used_slots) || 0
          };
          const modal = document.getElementById('modalVipSubscription');
          if (modal && !modal.classList.contains('hidden')) {
            renderVipSubscriptionModal();
          }
        }
      } catch (err) {
        console.warn('Lỗi tải cấu hình ưu đãi tiên phong:', err);
      }
    }

    async function loadVipPlansSettingsFromCloud() {
      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient
          .from('vip_plans_settings')
          .select('plans')
          .eq('id', 'default')
          .maybeSingle();

        if (!error && data && Array.isArray(data.plans) && data.plans.length === 5) {
          vipPlansConfig = data.plans.map((p, idx) => ({
            ...DEFAULT_VIP_PLANS[idx],
            ...p,
            yearlyPrice: p.yearlyPrice !== undefined ? p.yearlyPrice : DEFAULT_VIP_PLANS[idx].yearlyPrice
          }));
          try {
            localStorage.setItem('dipi_vip_plans_config_v2', JSON.stringify(vipPlansConfig));
          } catch (e) {}

          updateHeaderVipBadge();
          renderHomeTab();
          const modal = document.getElementById('modalVipSubscription');
          if (modal && !modal.classList.contains('hidden')) {
            renderVipSubscriptionModal();
          }
        }
      } catch (err) {
        console.warn('Lỗi tải bảng giá vip_plans_settings:', err);
      }
    }

    async function togglePioneerPromoActive() {
      if (!isCurrentUserVipAdmin() || !supabaseClient) return;
      const btn = document.getElementById('btnTogglePioneerPromo');
      const nextActive = !pioneerPromoState.is_active;
      if (btn) btn.disabled = true;

      try {
        const { error } = await supabaseClient
          .from('app_promo_settings')
          .update({
            is_active: nextActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', 'pioneer_500');

        if (error) {
          showUndoToast(`Lỗi cập nhật chương trình ưu đãi: ${error.message}`);
          return;
        }

        pioneerPromoState.is_active = nextActive;
        renderVipSubscriptionModal();
        showUndoToast(nextActive ? 'Đã BẬT chương trình 500 giáo viên tiên phong!' : 'Đã TẮT chương trình 500 giáo viên tiên phong!');
      } catch (err) {
        showUndoToast('Lỗi kết nối khi cập nhật trạng thái chương trình.');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function isCurrentUserVipAdmin() {
      return Boolean(currentUser?.email && currentUser.email.toLowerCase() === VIP_ADMIN_EMAIL.toLowerCase());
    }

    function isPaidVipActive() {
      if (vipExpiresAtIso) {
        const expMs = new Date(vipExpiresAtIso).getTime();
        if (!Number.isNaN(expMs) && expMs > Date.now()) {
          if (purchasedPlanId && purchasedPlanId !== 'free') return true;
          if (currentTeacherPlanId && currentTeacherPlanId !== 'free') return true;
        }
      }
      return false;
    }

    function isKeepingTraSuaAfterTraChanhPurchase() {
      const trialExpMs = trialExpiresAtIso ? new Date(trialExpiresAtIso).getTime() : NaN;
      const vipExpMs = vipExpiresAtIso ? new Date(vipExpiresAtIso).getTime() : NaN;
      return (
        currentTeacherPlanId === TRIAL_PLAN_ID &&
        purchasedPlanId === 'tra_chanh' &&
        !Number.isNaN(trialExpMs) &&
        trialExpMs > Date.now() &&
        !Number.isNaN(vipExpMs) &&
        vipExpMs > Date.now()
      );
    }

    function canActivateFreeTrial() {
      if (!currentUser || !currentUser.id) return false;
      if (currentTeacherPlanId !== 'free') return false;
      if (hasUsedFreeTrial || trialStartedAtIso) return false;
      return true;
    }

    function shouldShowTrialButtonOnHome() {
      if (currentTeacherPlanId !== 'free') return false;
      if (hasUsedFreeTrial || trialStartedAtIso) return false;
      return true;
    }

    function handleHomeVipActionClick() {
      openVipSubscriptionModal();
    }

    function getTotalUniqueStudentsCount() {
      let total = 0;
      Object.values(classStudentsMap || {}).forEach(list => {
        if (Array.isArray(list)) total += list.length;
      });
      return total;
    }

    function getActiveVipPlan() {
      return vipPlansConfig.find(p => p.id === currentTeacherPlanId) || vipPlansConfig[0] || DEFAULT_VIP_PLANS[0];
    }

    function hasHomeworkFeatureAccess() {
      if (activeWorkspaceMode === 'shared') return true;
      enforcePaidVipExpirationIfNeeded();
      enforceTrialExpirationIfNeeded();
      return currentTeacherPlanId !== 'free';
    }

    function getOwnedPlanBadgeStyle(planId) {
      const map = {
        free: {
          bg: 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-sm shadow-sky-500/30',
          hover: 'hover:from-sky-600 hover:via-blue-700 hover:to-indigo-700',
          border: 'border-sky-300/40'
        },
        tra_chanh: {
          bg: 'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 shadow-sm shadow-emerald-500/30',
          hover: 'hover:from-emerald-600 hover:via-green-600 hover:to-teal-700',
          border: 'border-emerald-300/40'
        },
        tra_sua: {
          bg: 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 shadow-sm shadow-orange-500/30',
          hover: 'hover:from-amber-600 hover:via-orange-600 hover:to-rose-600',
          border: 'border-amber-200/45'
        },
        trum_tra: {
          bg: 'bg-gradient-to-r from-indigo-500 via-violet-600 to-purple-600 shadow-sm shadow-indigo-500/30',
          hover: 'hover:from-indigo-600 hover:via-violet-700 hover:to-purple-700',
          border: 'border-indigo-300/40'
        },
        trung_tam: {
          bg: 'bg-gradient-to-r from-rose-500 via-pink-600 to-fuchsia-600 shadow-sm shadow-rose-500/35',
          hover: 'hover:from-rose-600 hover:via-pink-700 hover:to-fuchsia-700',
          border: 'border-rose-300/45'
        }
      };
      return map[planId] || map.free;
    }

    function getTrialStatusInfo() {
      if (isPaidVipActive()) {
        return { isActive: false, isExpired: false, remainingMs: 0, remainingMinutes: 0, expiresAt: null };
      }
      if (!trialStartedAtIso && !trialExpiresAtIso) {
        return { isActive: false, isExpired: false, remainingMs: 0, remainingMinutes: 0, expiresAt: null };
      }
      let expiresAt = NaN;
      if (trialExpiresAtIso) {
        expiresAt = new Date(trialExpiresAtIso).getTime();
      } else if (trialStartedAtIso) {
        const startedMs = new Date(trialStartedAtIso).getTime();
        if (!Number.isNaN(startedMs)) {
          expiresAt = startedMs + TRIAL_DURATION_MINUTES * 60 * 1000;
        }
      }
      if (Number.isNaN(expiresAt)) {
        return { isActive: false, isExpired: false, remainingMs: 0, remainingMinutes: 0, expiresAt: null };
      }
      const remainingMs = expiresAt - Date.now();
      const isActive = remainingMs > 0 && currentTeacherPlanId === TRIAL_PLAN_ID;
      return {
        isActive,
        isExpired: remainingMs <= 0,
        remainingMs: Math.max(0, remainingMs),
        remainingMinutes: remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0,
        expiresAt
      };
    }

    async function autoActivateThirtyDayTrialIfEligible() {
      if (!supabaseClient || !currentUser || !currentUser.id) return false;
      if (isPaidVipActive()) return false;
      if (trialStartedAtIso || trialExpiresAtIso || hasUsedFreeTrial) return false;

      try {
        const { data, error } = await supabaseClient.rpc('activate_thirty_day_trial');
        if (error || !data) {
          console.warn('Lỗi RPC activate_thirty_day_trial:', error?.message);
          return false;
        }

        if (data.ok === true) {
          trialStartedAtIso = data.trialStartedAtIso;
          trialExpiresAtIso = data.trialExpiresAt;
          currentTeacherPlanId = data.currentTeacherPlanId || TRIAL_PLAN_ID;
          hasUsedFreeTrial = true;
          saveVipSubscriptionState(false);
          return true;
        } else if (data.reason === 'already_used' && data.data) {
          trialStartedAtIso = data.data.trialStartedAtIso || null;
          trialExpiresAtIso = data.data.trialExpiresAt || null;
          hasUsedFreeTrial = true;
          if (data.data.currentTeacherPlanId && vipPlansConfig.some(p => p.id === data.data.currentTeacherPlanId)) {
            currentTeacherPlanId = data.data.currentTeacherPlanId;
          }
          saveVipSubscriptionState(false);
        }
      } catch (err) {
        console.warn('Lỗi gọi RPC dùng thử:', err);
      }
      return false;
    }

    function enforcePaidVipExpirationIfNeeded() {
      if (!vipExpiresAtIso) return false;
      const expMs = new Date(vipExpiresAtIso).getTime();
      if (!Number.isNaN(expMs) && expMs <= Date.now()) {
        currentTeacherPlanId = 'free';
        purchasedPlanId = null;
        purchasedStartsAtIso = null;
        vipExpiresAtIso = null;
        saveVipSubscriptionState(true);
        updateHeaderVipBadge();
        renderHomeTab();
        const modal = document.getElementById('modalVipSubscription');
        if (modal && !modal.classList.contains('hidden')) {
          renderVipSubscriptionModal();
        }
        showUndoToast('Gói VIP của bạn đã hết hạn. Tài khoản đã chuyển về gói Free.');
        return true;
      }
      return false;
    }

    function enforceTrialExpirationIfNeeded() {
      if (!trialStartedAtIso && !trialExpiresAtIso) return false;
      let expiresAt = NaN;
      if (trialExpiresAtIso) {
        expiresAt = new Date(trialExpiresAtIso).getTime();
      } else if (trialStartedAtIso) {
        const startedMs = new Date(trialStartedAtIso).getTime();
        if (!Number.isNaN(startedMs)) {
          expiresAt = startedMs + TRIAL_DURATION_MINUTES * 60 * 1000;
        }
      }
      if (Number.isNaN(expiresAt) || expiresAt > Date.now()) return false;

      const vipExpMs = vipExpiresAtIso ? new Date(vipExpiresAtIso).getTime() : NaN;
      if (purchasedPlanId === 'tra_chanh' && !Number.isNaN(vipExpMs) && vipExpMs > Date.now()) {
        if (currentTeacherPlanId !== 'tra_chanh') {
          currentTeacherPlanId = 'tra_chanh';
          hasUsedFreeTrial = true;
          saveVipSubscriptionState(true);
          updateHeaderVipBadge();
          renderHomeTab();
          const modal = document.getElementById('modalVipSubscription');
          if (modal && !modal.classList.contains('hidden')) {
            renderVipSubscriptionModal();
          }
          showUndoToast('Đã hết thời gian giữ quyền lợi Trà Sữa. Tài khoản đã chuyển sang gói Trà Chanh đã mua!');
          return true;
        }
        return false;
      }

      if (isPaidVipActive()) return false;
      if (currentTeacherPlanId !== TRIAL_PLAN_ID) return false;

      currentTeacherPlanId = 'free';
      hasUsedFreeTrial = true;
      saveVipSubscriptionState(true);
      updateHeaderVipBadge();
      renderHomeTab();
      const modal = document.getElementById('modalVipSubscription');
      if (modal && !modal.classList.contains('hidden')) {
        renderVipSubscriptionModal();
      }
      showUndoToast('Đã hết 30 ngày dùng thử gói Trà Sữa. Tài khoản đã chuyển về gói Free.');
      return true;
    }

    function startTrialExpirationWatcher() {
      if (trialCountdownTimer) clearInterval(trialCountdownTimer);
      trialCountdownTimer = setInterval(() => {
        enforcePaidVipExpirationIfNeeded();
        if ((trialStartedAtIso || trialExpiresAtIso) && currentTeacherPlanId === TRIAL_PLAN_ID) {
          const expired = enforceTrialExpirationIfNeeded();
          if (!expired) {
            updateHeaderVipBadge();
          }
        }
      }, 5000);
    }

    function loadVipSubscriptionState() {
      try {
        const savedPlans = localStorage.getItem('dipi_vip_plans_config_v2');
        if (savedPlans) {
          const parsed = JSON.parse(savedPlans);
          if (Array.isArray(parsed) && parsed.length === 5) {
            vipPlansConfig = parsed.map((p, idx) => ({
              ...DEFAULT_VIP_PLANS[idx],
              ...p,
              yearlyPrice: p.yearlyPrice !== undefined ? p.yearlyPrice : DEFAULT_VIP_PLANS[idx].yearlyPrice
            }));
          }
        } else {
          vipPlansConfig = JSON.parse(JSON.stringify(DEFAULT_VIP_PLANS));
        }
      } catch (e) {
        vipPlansConfig = JSON.parse(JSON.stringify(DEFAULT_VIP_PLANS));
      }

      const prefix = getStorageKeyPrefix();
      const savedPlanId = localStorage.getItem(`${prefix}_active_vip_plan`);
      currentTeacherPlanId = (savedPlanId && vipPlansConfig.some(p => p.id === savedPlanId)) ? savedPlanId : 'free';
      vipExpiresAtIso = localStorage.getItem(`${prefix}_vip_expires_at`) || null;
      const savedPurchasedPlanId = localStorage.getItem(`${prefix}_purchased_vip_plan`);
      purchasedPlanId = (savedPurchasedPlanId && vipPlansConfig.some(p => p.id === savedPurchasedPlanId)) ? savedPurchasedPlanId : null;
      purchasedStartsAtIso = localStorage.getItem(`${prefix}_purchased_starts_at`) || null;

      if (currentUser && currentUser.id) {
        trialStartedAtIso = localStorage.getItem(`dipi_user_${currentUser.id}_trial_started_at`) || null;
        trialExpiresAtIso = localStorage.getItem(`dipi_user_${currentUser.id}_trial_expires_at`) || null;
        if (!trialExpiresAtIso && trialStartedAtIso) {
          const startedMs = new Date(trialStartedAtIso).getTime();
          if (!Number.isNaN(startedMs)) {
            trialExpiresAtIso = new Date(startedMs + 30 * 86400000).toISOString();
          }
        }
        hasUsedFreeTrial = localStorage.getItem(`dipi_user_${currentUser.id}_trial_used`) === '1' || Boolean(trialStartedAtIso);
        hasUsedPioneerDiscount = localStorage.getItem(`dipi_user_${currentUser.id}_pioneer_used`) === '1';
      } else {
        trialStartedAtIso = null;
        trialExpiresAtIso = null;
        hasUsedFreeTrial = false;
        hasUsedPioneerDiscount = false;
      }

      isVipAdminEditMode = false;
      appliedVipPromo = null;
      hasUserClearedVipPromo = false;
      lastThresholdWarnedPercent = 0;
      enforcePaidVipExpirationIfNeeded();
      enforceTrialExpirationIfNeeded();
      updateHeaderVipBadge();
    }

    function saveVipSubscriptionState(syncCloudNow = false) {
      try {
        localStorage.setItem('dipi_vip_plans_config_v2', JSON.stringify(vipPlansConfig));
        const prefix = getStorageKeyPrefix();
        localStorage.setItem(`${prefix}_active_vip_plan`, currentTeacherPlanId);
        if (vipExpiresAtIso) {
          localStorage.setItem(`${prefix}_vip_expires_at`, vipExpiresAtIso);
        } else {
          localStorage.removeItem(`${prefix}_vip_expires_at`);
        }
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
          if (trialStartedAtIso) {
            localStorage.setItem(`dipi_user_${currentUser.id}_trial_started_at`, trialStartedAtIso);
          }
          if (trialExpiresAtIso) {
            localStorage.setItem(`dipi_user_${currentUser.id}_trial_expires_at`, trialExpiresAtIso);
          } else {
            localStorage.removeItem(`dipi_user_${currentUser.id}_trial_expires_at`);
          }
          if (hasUsedFreeTrial) {
            localStorage.setItem(`dipi_user_${currentUser.id}_trial_used`, '1');
          }
          if (hasUsedPioneerDiscount) {
            localStorage.setItem(`dipi_user_${currentUser.id}_pioneer_used`, '1');
          }
        }
      } catch (e) {
        console.warn('Lỗi lưu cấu hình gói VIP:', e);
      }
      updateHeaderVipBadge();
      renderHomeTab();
      if (syncCloudNow && currentUser && currentUser.id) {
        scheduleAutoCloudSync();
      }
    }

    function updateHeaderVipBadge() {
      const plan = getActiveVipPlan();
      const planStyle = getOwnedPlanBadgeStyle(plan.id);
      const trialInfo = getTrialStatusInfo();
      const paidActive = isPaidVipActive();
      const keepingTraSua = isKeepingTraSuaAfterTraChanhPurchase();
      const totalSt = getTotalUniqueStudentsCount();
      const maxSt = Math.max(1, Number(plan.maxStudents) || 15);
      const usagePercent = Math.round((totalSt / maxSt) * 100);

      const headerBtn = document.getElementById('btnHeaderVipPlan');
      if (headerBtn) {
        headerBtn.className = activeWorkspaceMode === 'shared'
          ? 'hidden'
          : `hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${planStyle.bg} ${planStyle.hover} text-white text-[11px] sm:text-xs font-extrabold shadow-sm transition active:scale-95 shrink-0`;
      }

      const headerLabel = document.getElementById('headerVipPlanLabel');
      if (headerLabel) {
        headerLabel.innerText = trialInfo.isActive
          ? `${plan.name} (Thử)`
          : `Gói ${plan.name}`;
      }

      const heroVipPill = document.getElementById('homeHeroVipPill');
      if (heroVipPill) {
        if (activeWorkspaceMode === 'shared') {
          heroVipPill.className = 'hidden';
        } else {
          heroVipPill.className = `inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full ${planStyle.bg} ${planStyle.hover} border border-white/25 text-[11px] sm:text-xs font-extrabold text-white transition active:scale-95 shrink-0 shadow-sm`;
          const heroCrownIcon = heroVipPill.querySelector('svg, [data-lucide="crown"]');
          if (heroCrownIcon) {
            heroCrownIcon.classList.remove('text-amber-400');
            heroCrownIcon.classList.add('text-white');
          }
        }
      }

      const heroVipLabel = document.getElementById('homeHeroVipPlanLabel');
      if (heroVipLabel) {
        heroVipLabel.innerText = plan.name;
      }

      const homeIconBox = document.getElementById('homeVipPlanIconBox');
      if (homeIconBox) {
        homeIconBox.className = `w-8 h-8 rounded-xl ${planStyle.bg} text-white border border-transparent flex items-center justify-center shrink-0`;
      }

      const homeTitle = document.getElementById('homeVipPlanTitle');
      const homeSubtitle = document.getElementById('homeVipPlanSubtitle');
      const homeTrialBadge = document.getElementById('homeVipTrialBadge');
      const homeQuotaBadge = document.getElementById('homeVipQuotaAlertBadge');
      const homeBtn = document.getElementById('btnHomeUpgradeVip');
      const homeBtnIcon = document.getElementById('btnHomeUpgradeVipIcon');
      const homeBtnLabel = document.getElementById('btnHomeUpgradeVipLabel');

      if (homeTitle) {
        if (keepingTraSua && trialExpiresAtIso && vipExpiresAtIso) {
          const keepUntilStr = new Date(trialExpiresAtIso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const traChanhExpStr = new Date(vipExpiresAtIso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          homeTitle.innerText = `Đang hưởng: Trà Sữa (đến ${keepUntilStr}) → Sau đó chuyển Trà Chanh (HSD: ${traChanhExpStr})`;
        } else {
          homeTitle.innerText = trialInfo.isActive
            ? `Gói hiện tại: ${plan.name} (Dùng thử)`
            : `Gói hiện tại: ${plan.name}`;
        }
      }
      if (homeSubtitle) {
        const expText = paidActive && vipExpiresAtIso
          ? ` • HSD: ${new Date(vipExpiresAtIso).toLocaleDateString('vi-VN')}`
          : '';
        homeSubtitle.innerText = `Đang sử dụng ${totalSt.toLocaleString('vi-VN')} / ${maxSt.toLocaleString('vi-VN')} học sinh • ${classesList.length} lớp học${expText}`;
      }

      if (homeTrialBadge) {
        if (trialInfo.isActive) {
          const remainingDays = Math.max(1, Math.ceil(trialInfo.remainingMs / 86400000));
          homeTrialBadge.innerText = `Dùng thử 30 ngày • còn ${remainingDays} ngày`;
          homeTrialBadge.classList.remove('hidden');
        } else {
          homeTrialBadge.classList.add('hidden');
        }
      }

      if (homeQuotaBadge) {
        if (usagePercent >= 90) {
          homeQuotaBadge.innerText = usagePercent >= 100 ? 'Đã đạt giới hạn!' : `Đã dùng ${usagePercent}% giới hạn!`;
          homeQuotaBadge.classList.remove('hidden');
        } else {
          homeQuotaBadge.classList.add('hidden');
        }
      }

      if (homeBtn && homeBtnLabel) {
        if (shouldShowTrialButtonOnHome()) {
          homeBtnLabel.innerText = 'Dùng thử';
          if (homeBtnIcon) {
            homeBtnIcon.setAttribute('data-lucide', 'gift');
            homeBtnIcon.className = 'w-4 h-4 animate-bounce';
          }
          homeBtn.className = 'px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:via-orange-600 hover:to-rose-600 text-white text-xs sm:text-[13px] font-black tracking-wide shadow-lg shadow-orange-500/35 ring-2 ring-amber-300/80 transition-all hover:scale-[1.03] active:scale-95 inline-flex items-center gap-1.5';
        } else {
          homeBtnLabel.innerText = 'Nâng cấp';
          if (homeBtnIcon) {
            homeBtnIcon.setAttribute('data-lucide', 'crown');
            homeBtnIcon.className = 'w-4 h-4';
          }
          homeBtn.className = 'px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs sm:text-[13px] font-extrabold shadow-sm transition-all active:scale-95 inline-flex items-center gap-1.5';
        }
      }
      updateHomeVipBannerVisibility();
      safeCreateIcons();
    }

    function updateHomeVipBannerVisibility() {
      const vipBanner = document.getElementById('homeVipStatusBanner');
      if (!vipBanner) return;

      if (currentRole !== 'teacher' || currentTab === 'home' || activeWorkspaceMode === 'shared') {
        vipBanner.classList.add('hidden');
        return;
      }

      const plan = getActiveVipPlan();
      const totalSt = getTotalUniqueStudentsCount();
      const maxSt = Math.max(1, Number(plan.maxStudents) || 15);
      const usagePercent = Math.round((totalSt / maxSt) * 100);

      const shouldShow = !currentUser || shouldShowTrialButtonOnHome() || usagePercent >= 90;
      vipBanner.classList.toggle('hidden', !shouldShow);
    }

    function dismissFirstLoginVipPromo() {
      closeModal('modalVipFirstLoginPromo');
      if (currentUser && currentUser.id) {
        try {
          localStorage.setItem(`dipi_user_${currentUser.id}_vip_promo_seen`, '1');
        } catch (e) {}
      }
    }

    function maybeShowFirstLoginVipPromo() {
      if (!currentUser || !currentUser.id) return;
      if (currentRole !== 'teacher') return;
      if (isPaidVipActive()) return;
      if (!getTrialStatusInfo().isActive) return;
      try {
        if (localStorage.getItem(`dipi_user_${currentUser.id}_vip_promo_seen`) === '1') return;
      } catch (e) {}
      openModal('modalVipFirstLoginPromo');
    }

    function getRecommendedUpgradePlan(neededCount) {
      const sorted = [...vipPlansConfig].sort((a, b) => a.maxStudents - b.maxStudents);
      return sorted.find(p => p.maxStudents >= neededCount && p.id !== currentTeacherPlanId) || sorted[sorted.length - 1];
    }

    function showVipThresholdAlertModal(isHardLimit, currentCount, maxStudents, neededCount) {
      const titleEl = document.getElementById('vipThresholdAlertTitle');
      const subEl = document.getElementById('vipThresholdAlertSubtitle');
      const bodyEl = document.getElementById('vipThresholdAlertBody');
      const plan = getActiveVipPlan();
      const suggested = getRecommendedUpgradePlan(Math.max(neededCount, maxStudents + 1));

      if (titleEl) {
        titleEl.innerText = isHardLimit
          ? `Đã đạt giới hạn gói ${plan.name} (${maxStudents} học sinh)`
          : `Sắp đạt giới hạn gói ${plan.name} (${currentCount}/${maxStudents} HS)`;
      }
      if (subEl) {
        subEl.innerText = isHardLimit
          ? 'Vui lòng nâng cấp gói để tiếp tục thêm học sinh mới'
          : 'Gợi ý nâng cấp sớm để không gián đoạn việc thêm học sinh';
      }
      if (bodyEl) {
        bodyEl.innerHTML = `
          <p>Hiện tài khoản của bạn đang có <strong>${currentCount.toLocaleString('vi-VN')} / ${maxStudents.toLocaleString('vi-VN')} học sinh</strong>.</p>
          ${suggested ? `
            <p class="text-indigo-800 font-bold bg-indigo-50 border border-indigo-200 rounded-xl p-2.5">
              Gợi ý phù hợp: Gói ${suggested.name} (${suggested.price.toLocaleString('vi-VN')}đ/tháng) — tối đa ${suggested.maxStudents.toLocaleString('vi-VN')} học sinh.
            </p>
          ` : ''}
        `;
      }
      openModal('modalVipThresholdAlert');
    }

    function checkCanAddStudents(addingCount = 1) {
      enforcePaidVipExpirationIfNeeded();
      enforceTrialExpirationIfNeeded();
      const plan = getActiveVipPlan();
      const currentCount = getTotalUniqueStudentsCount();
      const maxStudents = Number(plan.maxStudents) || 15;
      if (currentCount + addingCount > maxStudents) {
        showVipThresholdAlertModal(true, currentCount, maxStudents, currentCount + addingCount);
        return false;
      }
      return true;
    }

    function checkAndNotifyQuotaThreshold() {
      const plan = getActiveVipPlan();
      const currentCount = getTotalUniqueStudentsCount();
      const maxStudents = Math.max(1, Number(plan.maxStudents) || 15);
      const pct = Math.round((currentCount / maxStudents) * 100);
      if (pct >= 90 && pct < 100 && lastThresholdWarnedPercent < 90) {
        lastThresholdWarnedPercent = pct;
        showVipThresholdAlertModal(false, currentCount, maxStudents, currentCount + 1);
      } else if (pct >= 100 && lastThresholdWarnedPercent < 100) {
        lastThresholdWarnedPercent = 100;
        showVipThresholdAlertModal(true, currentCount, maxStudents, currentCount + 1);
      }
    }

    async function activateFreeTrialNow() {
      if (!currentUser || !currentUser.id) {
        dismissFirstLoginVipPromo();
        closeModal('modalVipSubscription');
        openAuthModal('signin');
        showUndoToast('Vui lòng đăng nhập để dùng thử');
        return;
      }
      if (hasUsedFreeTrial || trialStartedAtIso) {
        dismissFirstLoginVipPromo();
        showUndoToast('Tài khoản này đã sử dụng gói dùng thử trước đó.');
        return;
      }
      if (!supabaseClient) {
        showUndoToast('Chưa kết nối được máy chủ, vui lòng thử lại.');
        return;
      }

      try {
        const { data, error } = await supabaseClient.rpc('activate_thirty_day_trial');
        if (error) {
          showUndoToast(`Lỗi kích hoạt dùng thử: ${error.message}`);
          return;
        }

        if (!data || data.ok !== true) {
          dismissFirstLoginVipPromo();
          if (data?.data) {
            trialStartedAtIso = data.data.trialStartedAtIso || null;
            trialExpiresAtIso = data.data.trialExpiresAt || null;
            hasUsedFreeTrial = true;
            if (data.data.currentTeacherPlanId && vipPlansConfig.some(p => p.id === data.data.currentTeacherPlanId)) {
              currentTeacherPlanId = data.data.currentTeacherPlanId;
            }
            saveVipSubscriptionState(false);
            renderVipSubscriptionModal();
          }
          showUndoToast(data?.message || 'Tài khoản này không đủ điều kiện dùng thử.');
          return;
        }

        trialStartedAtIso = data.trialStartedAtIso;
        trialExpiresAtIso = data.trialExpiresAt;
        hasUsedFreeTrial = true;
        currentTeacherPlanId = data.currentTeacherPlanId || TRIAL_PLAN_ID;

        dismissFirstLoginVipPromo();
        saveVipSubscriptionState(false);
        updateHeaderVipBadge();
        renderVipSubscriptionModal();
        showUndoToast('Đã kích hoạt dùng thử 30 ngày gói Trà Sữa (tối đa 80 học sinh)!');
      } catch (err) {
        console.warn('Lỗi kích hoạt dùng thử qua RPC:', err);
        showUndoToast('Lỗi kết nối khi kích hoạt dùng thử.');
      }
    }

    function openVipSubscriptionModal() {
      enforcePaidVipExpirationIfNeeded();
      enforceTrialExpirationIfNeeded();
      isVipAdminEditMode = false;
      renderVipSubscriptionModal();
      openModal('modalVipSubscription');
      loadPioneerPromoSettings();
    }

    async function applyVipPromoCode(codeOverride = null, isSilent = false) {
      if (isValidatingVipPromo || activeVietQrIsPaid) return false;
      const promoInput = document.getElementById('vipPromoCodeInput');
      const applyBtn = document.getElementById('btnApplyVipPromo');
      const clearBtn = document.getElementById('btnClearVipPromo');
      const feedbackEl = document.getElementById('vipPromoFeedbackText');
      const rawCode = codeOverride !== null ? codeOverride : (promoInput?.value || '');
      const code = String(rawCode).trim().toUpperCase();

      if (!code) {
        if (!isSilent && feedbackEl) {
          feedbackEl.innerText = 'Vui lòng nhập mã ưu đãi.';
          feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-rose-600';
          feedbackEl.classList.remove('hidden');
        }
        return false;
      }

      if (!currentUser || !currentUser.id) {
        if (!isSilent) {
          if (feedbackEl) {
            feedbackEl.innerText = 'Vui lòng đăng nhập để áp dụng mã ưu đãi.';
            feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-rose-600';
            feedbackEl.classList.remove('hidden');
          }
          showUndoToast('Vui lòng đăng nhập để áp dụng mã ưu đãi.');
        }
        return false;
      }

      if (!supabaseClient) {
        if (!isSilent && feedbackEl) {
          feedbackEl.innerText = 'Chưa kết nối được máy chủ, vui lòng thử lại.';
          feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-rose-600';
          feedbackEl.classList.remove('hidden');
        }
        return false;
      }

      isValidatingVipPromo = true;
      if (applyBtn) applyBtn.disabled = true;

      try {
        const targetPlanId = activeVietQrPlanObj?.id || activeVietQrPlanId || null;
        const { data, error } = await supabaseClient.rpc('validate_vip_promo_code', {
          p_promo_code: code,
          p_plan_id: targetPlanId
        });

        if (!error && data && data.ok === true) {
          appliedVipPromo = {
            ...data,
            code: String(data.code || code).trim().toUpperCase()
          };
          if (promoInput) promoInput.value = appliedVipPromo.code;
          if (feedbackEl) {
            feedbackEl.innerText = data.message || `Đã áp dụng mã ưu đãi ${appliedVipPromo.code}.`;
            feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-emerald-700';
            feedbackEl.classList.remove('hidden');
          }
          clearBtn?.classList.remove('hidden');
          if (!isSilent && activeVietQrPlanObj) {
            await createVipOrderAndRenderQr(activeVietQrPlanObj);
          }
          return true;
        } else {
          const errMsg = data?.message || error?.message || 'Mã ưu đãi không hợp lệ hoặc đã hết hạn.';
          if (!isSilent) {
            if (feedbackEl) {
              feedbackEl.innerText = errMsg;
              feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-rose-600';
              feedbackEl.classList.remove('hidden');
            }
            showUndoToast(errMsg);
          } else {
            appliedVipPromo = null;
            clearBtn?.classList.add('hidden');
            if (feedbackEl) {
              feedbackEl.innerText = '';
              feedbackEl.classList.add('hidden');
            }
            if (promoInput && code === 'TIENPHONG') promoInput.value = '';
          }
          return false;
        }
      } catch (err) {
        if (!isSilent && feedbackEl) {
          feedbackEl.innerText = 'Lỗi kết nối khi kiểm tra mã ưu đãi.';
          feedbackEl.className = 'text-[11px] font-bold pl-0.5 text-rose-600';
          feedbackEl.classList.remove('hidden');
        }
        return false;
      } finally {
        isValidatingVipPromo = false;
        if (applyBtn && !activeVietQrIsPaid) applyBtn.disabled = false;
      }
    }

    async function clearVipPromoCode() {
      if (activeVietQrIsPaid) return;
      appliedVipPromo = null;
      hasUserClearedVipPromo = true;
      const promoInput = document.getElementById('vipPromoCodeInput');
      const feedbackEl = document.getElementById('vipPromoFeedbackText');
      const clearBtn = document.getElementById('btnClearVipPromo');
      if (promoInput) promoInput.value = '';
      if (feedbackEl) {
        feedbackEl.innerText = '';
        feedbackEl.classList.add('hidden');
      }
      clearBtn?.classList.add('hidden');
      if (activeVietQrPlanObj) {
        await createVipOrderAndRenderQr(activeVietQrPlanObj);
      }
    }

    function toggleVipAdminEditMode() {
      if (!isCurrentUserVipAdmin()) return;
      isVipAdminEditMode = !isVipAdminEditMode;
      renderVipSubscriptionModal();
      if (isVipAdminEditMode) {
        loadAdminPromoCodes(false);
        loadAdminVipOrders(false);
      }
    }

    function switchVipBillingCycle(cycle) {
      currentVipBillingCycle = cycle === 'yearly' ? 'yearly' : 'monthly';
      renderVipSubscriptionModal();
    }

    function calculateVipPlanPricing(plan) {
      const monthlyPrice = Math.max(0, Number(plan.price) || 0);
      if (plan.id === 'free' || monthlyPrice === 0) {
        return {
          isFree: true,
          finalPrice: 0,
          originalPrice: 0,
          salePercent: 0,
          effectiveMonthly: 0,
          yearlySaved: 0
        };
      }

      const yearlyPrice = Math.max(0, Number(plan.yearlyPrice) || (monthlyPrice * 10));
      const salePercent = Math.max(0, Math.min(80, Number(plan.salePercent) || 0));
      const monthlyOriginal = salePercent > 0
        ? Math.round((monthlyPrice / (1 - salePercent / 100)) / 1000) * 1000
        : monthlyPrice;

      if (currentVipBillingCycle === 'yearly') {
        const twelveMonthsFull = monthlyPrice * 12;
        const effectiveMonthly = Math.round((yearlyPrice / 12) / 100) * 100;
        const yearlySaved = Math.max(0, twelveMonthsFull - yearlyPrice);
        const extraYearlyDiscountPercent = twelveMonthsFull > 0
          ? Math.max(0, Math.round(((twelveMonthsFull - yearlyPrice) / twelveMonthsFull) * 100))
          : 0;
        return {
          isFree: false,
          finalPrice: yearlyPrice,
          originalPrice: twelveMonthsFull,
          salePercent: extraYearlyDiscountPercent,
          effectiveMonthly,
          yearlySaved
        };
      }

      return {
        isFree: false,
        finalPrice: monthlyPrice,
        originalPrice: monthlyOriginal,
        salePercent,
        effectiveMonthly: monthlyPrice,
        yearlySaved: Math.max(0, monthlyPrice * 12 - yearlyPrice)
      };
    }

    function renderVipSubscriptionModal() {
      const activePlan = getActiveVipPlan();
      const activePlanStyle = getOwnedPlanBadgeStyle(activePlan.id);
      const trialInfo = getTrialStatusInfo();
      const paidActive = isPaidVipActive();
      const keepingTraSua = isKeepingTraSuaAfterTraChanhPurchase();
      const totalSt = getTotalUniqueStudentsCount();
      const maxSt = Math.max(1, Number(activePlan.maxStudents) || 15);
      const remaining = Math.max(0, maxSt - totalSt);
      const pct = Math.min(100, Math.round((totalSt / maxSt) * 100));

      const activeBadge = document.getElementById('vipCurrentActiveBadge');
      if (activeBadge) {
        activeBadge.className = `px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${activePlanStyle.bg} text-white border border-transparent shadow-sm`;
        if (keepingTraSua && trialExpiresAtIso && vipExpiresAtIso) {
          const keepUntilStr = new Date(trialExpiresAtIso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const traChanhExpStr = new Date(vipExpiresAtIso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          activeBadge.innerText = `Đang hưởng: Trà Sữa (đến ${keepUntilStr}) → Sau đó chuyển Trà Chanh (HSD: ${traChanhExpStr})`;
        } else if (trialInfo.isActive) {
          const remainingDays = Math.max(1, Math.ceil(trialInfo.remainingMs / 86400000));
          activeBadge.innerText = `Đang dùng: ${activePlan.name} (Dùng thử - còn ${remainingDays} ngày)`;
        } else if (paidActive && vipExpiresAtIso) {
          activeBadge.innerText = `Đang dùng: ${activePlan.name} (HSD: ${new Date(vipExpiresAtIso).toLocaleDateString('vi-VN')})`;
        } else {
          activeBadge.innerText = `Đang dùng: ${activePlan.name}`;
        }
      }

      const usageStText = document.getElementById('vipUsageStudentText');
      const usageStBar = document.getElementById('vipUsageStudentBar');
      const usageTText = document.getElementById('vipUsageTeacherText');
      const remainText = document.getElementById('vipRemainingSlotsText');
      if (usageStText) usageStText.innerText = `${totalSt.toLocaleString('vi-VN')} / ${maxSt.toLocaleString('vi-VN')} học sinh`;
      if (usageStBar) {
        usageStBar.style.width = `${pct}%`;
        usageStBar.className = `h-full rounded-full transition-all ${pct >= 90 ? 'bg-rose-600' : 'bg-indigo-600'}`;
      }
      if (usageTText) usageTText.innerText = `${classesList.length} lớp • Không giới hạn`;
      if (remainText) remainText.innerText = `${remaining.toLocaleString('vi-VN')} học sinh`;

      const adminBtn = document.getElementById('btnToggleVipAdminMode');
      const adminSection = document.getElementById('vipAdminEditorSection');
      const adminLabel = document.getElementById('labelToggleVipAdminMode');
      const isAdmin = isCurrentUserVipAdmin();
      if (adminBtn) adminBtn.classList.toggle('hidden', !isAdmin);
      if (adminLabel) adminLabel.innerText = isVipAdminEditMode ? 'Đóng quản trị' : 'Quản trị gói';
      document.getElementById('vipCustomerViewWrapper')?.classList.toggle('hidden', isAdmin && isVipAdminEditMode);
      if (adminSection) adminSection.classList.toggle('hidden', !(isAdmin && isVipAdminEditMode));

      const btnMonthly = document.getElementById('btnBillingMonthly');
      const btnYearly = document.getElementById('btnBillingYearly');
      if (btnMonthly && btnYearly) {
        if (currentVipBillingCycle === 'monthly') {
          btnMonthly.className = 'px-3 py-1 rounded-lg font-extrabold bg-slate-900 text-white shadow-sm transition';
          btnYearly.className = 'px-3 py-1 rounded-lg font-bold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5';
        } else {
          btnYearly.className = 'px-3 py-1 rounded-lg font-extrabold bg-slate-900 text-white shadow-sm transition flex items-center gap-1.5';
          btnMonthly.className = 'px-3 py-1 rounded-lg font-bold text-slate-600 hover:text-slate-900 transition';
        }
      }

      const yearlySaveBadge = btnYearly?.querySelector('span:last-child');
      if (yearlySaveBadge) {
        yearlySaveBadge.innerText = 'Giảm đến 19%';
      }

      const activePioneerDiscount = getActivePioneerDiscountPercent();
      const pioneerBanner = document.getElementById('vipModalPioneerPromoBanner');
      if (pioneerBanner) {
        if (activePioneerDiscount > 0) {
          pioneerBanner.classList.remove('hidden');
          pioneerBanner.innerHTML = `
            <div class="flex items-center gap-1.5 min-w-0">
              <i data-lucide="sparkles" class="w-4 h-4 text-amber-600 shrink-0"></i>
              <span>Ưu đãi 500 giáo viên tiên phong: Giảm <strong>35%</strong> (ngày 1–15) / <strong>25%</strong> (ngày 16–30) • <strong class="text-indigo-700">Tự động áp mã TIENPHONG ở bước Thanh toán</strong></span>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black shrink-0">-${activePioneerDiscount}%</span>
          `;
        } else {
          pioneerBanner.classList.add('hidden');
        }
      }

      const trialTopBanner = document.getElementById('vipModalTrialTopBanner');
      if (trialTopBanner) {
        if (!currentUser || !currentUser.id) {
          trialTopBanner.classList.remove('hidden');
          trialTopBanner.innerHTML = `
            <div class="text-xs font-extrabold text-emerald-900">Vui lòng đăng nhập để dùng thử</div>
            <button type="button" onclick="closeModal('modalVipSubscription'); openAuthModal('signin');" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition">
              Đăng nhập
            </button>
          `;
        } else if (canActivateFreeTrial()) {
          trialTopBanner.classList.remove('hidden');
          trialTopBanner.innerHTML = `
            <div class="text-xs font-bold text-emerald-900">
              Tài khoản mới chưa dùng thử: Trải nghiệm ngay <strong class="text-amber-700">gói Trà Sữa (80 học sinh)</strong> miễn phí trong 30 ngày!
            </div>
            <button type="button" onclick="activateFreeTrialNow()" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition">
              Dùng thử ngay
            </button>
          `;
        } else {
          trialTopBanner.classList.add('hidden');
        }
      }

      const planGrid = document.getElementById('vipPlansGridContainer');
      if (planGrid) {
        const themeStyles = {
          sky: {
            card: 'border-[#7DD3FC] bg-gradient-to-b from-[#F0F9FF] to-[#E0F2FE]',
            badge: 'bg-[#BAE6FD] text-[#0369A1]',
            btn: 'bg-[#0284C7] hover:bg-[#0369A1] text-white',
            btnMuted: 'bg-[#0284C7]/90 text-white'
          },
          emerald: {
            card: 'border-[#86EFAC] bg-gradient-to-b from-[#F2FDF5] to-[#DCFCE7]',
            badge: 'bg-[#BBF7D0] text-[#14532D]',
            btn: 'bg-[#18B858] hover:bg-[#159E4B] text-white',
            btnMuted: 'bg-[#18B858]/90 text-white'
          },
          amber: {
            card: 'border-amber-300 bg-amber-50/70',
            badge: 'bg-amber-200 text-amber-900',
            btn: 'bg-amber-600 hover:bg-amber-700 text-white',
            btnMuted: 'bg-amber-600/90 text-white'
          },
          indigo: {
            card: 'border-indigo-300 bg-indigo-50/70',
            badge: 'bg-indigo-200 text-indigo-900',
            btn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            btnMuted: 'bg-indigo-600/90 text-white'
          },
          rose: {
            card: 'border-rose-300 bg-rose-50/70',
            badge: 'bg-rose-200 text-rose-900',
            btn: 'bg-rose-600 hover:bg-rose-700 text-white',
            btnMuted: 'bg-rose-600/90 text-white'
          }
        };
        const planAccentMap = {
          free: 'sky',
          tra_chanh: 'emerald',
          tra_sua: 'amber',
          trum_tra: 'indigo',
          trung_tam: 'rose'
        };
        const VIP_ALL_PLANS_FEATURES = [
          'Quản lý lớp & Thời khóa biểu',
          'Điểm danh & theo dõi chuyên cần',
          'Tính học phí & Phiếu báo thu QR',
          'Xuất dữ liệu Excel'
        ];
        const VIP_PRIORITY_SUPPORT_PLANS = ['tra_sua', 'trum_tra', 'trung_tam'];
        const VIP_MULTI_TEACHER_SOON_PLANS = ['trum_tra', 'trung_tam'];

        planGrid.innerHTML = vipPlansConfig.map(p => {
          const isCurrent = p.id === currentTeacherPlanId;
          const effectivePurchasedId = paidActive ? (purchasedPlanId || currentTeacherPlanId) : currentTeacherPlanId;
          const effectivePurchasedPlan = vipPlansConfig.find(x => x.id === effectivePurchasedId) || activePlan;
          const isCurrentPaidVip = paidActive && p.id === effectivePurchasedPlan.id;
          const isLowerTierLockedByPaidVip = paidActive && p.id !== effectivePurchasedPlan.id && (Number(p.maxStudents) || 0) < (Number(effectivePurchasedPlan.maxStudents) || 0);
          const pricing = calculateVipPlanPricing(p);
          const style = themeStyles[planAccentMap[p.id]] || themeStyles.sky;
          const isTrialTarget = p.id === TRIAL_PLAN_ID && (!currentUser?.id || canActivateFreeTrial());
          const isFreePlan = p.id === 'free';
          const hasPrioritySupport = VIP_PRIORITY_SUPPORT_PLANS.includes(p.id);
          const hasMultiTeacherSoon = VIP_MULTI_TEACHER_SOON_PLANS.includes(p.id);
          const checkIconColor = isFreePlan ? 'text-sky-600' : 'text-emerald-600';
          const isFreeLockedByHigherActivePlan = isFreePlan && (trialInfo.isActive || paidActive);
          const isPlanActionDisabled = isLowerTierLockedByPaidVip || isFreeLockedByHigherActivePlan;

          let actionButtonLabel = '';
          if (isLowerTierLockedByPaidVip || isFreeLockedByHigherActivePlan) {
            actionButtonLabel = 'Đã bao gồm';
          } else if (isCurrentPaidVip) {
            actionButtonLabel = 'Gia hạn thêm';
          } else if (p.price === 0) {
            actionButtonLabel = isCurrent ? 'Gói hiện tại' : 'Chuyển về Free';
          } else {
            actionButtonLabel = 'Mua Gói';
          }

          const featuresListHtml = `
            <ul class="grid grid-cols-2 sm:block gap-x-2 gap-y-1 sm:space-y-1 text-[10.5px] sm:text-[11px] font-semibold text-slate-700 pt-1.5 border-t border-black/5 w-full">
              <li class="flex items-start gap-1">
                <i data-lucide="check" class="w-3 h-3 ${checkIconColor} shrink-0 mt-0.5"></i>
                <span>Tối đa <strong>${Number(p.maxStudents).toLocaleString('vi-VN')}</strong> học sinh</span>
              </li>
              <li class="flex items-start gap-1">
                <i data-lucide="check" class="w-3 h-3 ${checkIconColor} shrink-0 mt-0.5"></i>
                <span>Không giới hạn số lớp học</span>
              </li>
              ${VIP_ALL_PLANS_FEATURES.map(feat => `
                <li class="flex items-start gap-1">
                  <i data-lucide="check" class="w-3 h-3 ${checkIconColor} shrink-0 mt-0.5"></i>
                  <span>${feat}</span>
                </li>
              `).join('')}
              ${!isFreePlan ? `
                <li class="flex items-start gap-1">
                  <i data-lucide="check" class="w-3 h-3 ${checkIconColor} shrink-0 mt-0.5"></i>
                  <span>Bài tập & Phiếu trả lời Online</span>
                </li>
              ` : ''}
              ${hasPrioritySupport ? `
                <li class="flex items-start gap-1 font-extrabold text-slate-900">
                  <i data-lucide="check" class="w-3 h-3 text-emerald-600 shrink-0 mt-0.5"></i>
                  <span>Ưu tiên hỗ trợ & tính năng mới</span>
                </li>
              ` : ''}
              ${hasMultiTeacherSoon ? `
                <li class="flex items-start gap-1 font-extrabold text-indigo-700">
                  <i data-lucide="check" class="w-3 h-3 text-emerald-600 shrink-0 mt-0.5"></i>
                  <span>Hỗ trợ tối đa ${Number(p.maxTeachers) || 1} giáo viên</span>
                </li>
              ` : ''}
            </ul>
          `;

          return `
            <div class="rounded-2xl border p-2.5 sm:p-3.5 flex flex-col justify-between gap-2 sm:gap-3 transition ${style.card} ${isCurrent ? 'ring-2 ring-indigo-500 shadow-md' : 'shadow-sm'}">
              <div class="space-y-1.5 sm:space-y-2 w-full">
                <div class="flex items-start justify-between gap-2 sm:block sm:space-y-2">
                  <div class="min-w-0 flex-1 sm:w-full">
                    <div class="flex items-center sm:justify-between gap-1.5 flex-wrap">
                      <h4 class="font-extrabold text-sm text-slate-900">${escapeHtml(p.name)}</h4>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${style.badge}">${escapeHtml(p.badge || '')}</span>
                    </div>
                  </div>

                  <div class="text-right sm:text-left shrink-0 sm:w-full">
                    ${pricing.isFree ? `
                      <div class="text-base sm:text-xl font-black text-slate-900">Miễn phí</div>
                    ` : `
                      <div class="flex items-center justify-end sm:justify-start gap-1 flex-wrap">
                        ${pricing.salePercent > 0 ? `<span class="text-[10.5px] sm:text-[11px] line-through text-slate-400 font-semibold">${pricing.originalPrice.toLocaleString('vi-VN')}đ</span>` : ''}
                        ${pricing.salePercent > 0 ? `
                          <span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9.5px] sm:text-[10px] font-extrabold">
                            -${pricing.salePercent}%
                          </span>
                        ` : ''}
                      </div>
                      <div class="text-base sm:text-lg font-black text-slate-900 leading-tight">
                        ${pricing.finalPrice.toLocaleString('vi-VN')}đ<span class="text-[10.5px] sm:text-[11px] font-semibold text-slate-500">/${currentVipBillingCycle === 'yearly' ? 'năm' : 'tháng'}</span>
                      </div>
                      ${currentVipBillingCycle === 'yearly' ? `
                        <div class="mt-0.5 sm:mt-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-white/85 border border-black/10 text-[10px] sm:text-[11px] font-extrabold text-emerald-700 inline-flex items-center gap-1">
                          <span>Chỉ ~${pricing.effectiveMonthly.toLocaleString('vi-VN')}đ/tháng</span>
                        </div>
                      ` : ''}
                    `}
                  </div>
                </div>

                <p class="hidden sm:block text-[11px] text-slate-600 leading-relaxed">${escapeHtml(p.description || '')}</p>

                ${featuresListHtml}
              </div>

              <div class="${isTrialTarget ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-1' : 'space-y-1.5'} pt-0.5 sm:pt-1">
                ${isTrialTarget ? `
                  <button type="button" onclick="activateFreeTrialNow()" class="w-full py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-extrabold transition shadow-sm truncate">
                    Dùng thử miễn phí
                  </button>
                ` : ''}
                <button
                  type="button"
                  ${isPlanActionDisabled ? 'disabled' : ''}
                  onclick="selectTeacherVipPlan('${p.id}')"
                  class="w-full py-1.5 sm:py-2 px-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition shadow-sm truncate ${
                    isPlanActionDisabled
                      ? `${style.btnMuted} cursor-not-allowed opacity-85`
                      : ((isCurrent && !trialInfo.isActive && !isCurrentPaidVip && !keepingTraSua) ? `${style.btnMuted} cursor-default` : style.btn)
                  }"
                >
                  ${actionButtonLabel}
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      const adminList = document.getElementById('vipAdminPlansList');
      if (adminList && isAdmin && isVipAdminEditMode) {
        const pioneerSlotsEl = document.getElementById('adminPioneerPromoSlotsText');
        const pioneerBadgeEl = document.getElementById('adminPioneerPromoStatusBadge');
        const pioneerBtnEl = document.getElementById('btnTogglePioneerPromo');
        if (pioneerSlotsEl) {
          pioneerSlotsEl.innerText = `${pioneerPromoState.used_slots} / ${pioneerPromoState.max_slots}`;
        }
        if (pioneerBadgeEl) {
          pioneerBadgeEl.innerText = pioneerPromoState.is_active ? 'Đang bật' : 'Đã tắt';
          pioneerBadgeEl.className = pioneerPromoState.is_active
            ? 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700 border border-slate-300';
        }
        if (pioneerBtnEl) {
          pioneerBtnEl.innerText = pioneerPromoState.is_active ? 'Tắt chương trình' : 'Bật chương trình';
          pioneerBtnEl.className = pioneerPromoState.is_active
            ? 'px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition shadow-sm active:scale-95'
            : 'px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition shadow-sm active:scale-95';
        }

        adminList.innerHTML = `
          <div class="hidden sm:grid sm:grid-cols-6 gap-2 px-2.5 text-[11px] font-extrabold text-slate-600 uppercase">
            <div>Gói</div>
            <div>Giá tháng (VNĐ)</div>
            <div>Giá năm (VNĐ)</div>
            <div>% Sale</div>
            <div>Tối đa HS</div>
            <div>Tối đa GV</div>
          </div>
          ${vipPlansConfig.map((p, idx) => `
            <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 items-center">
              <div class="col-span-2 sm:col-span-1 border-b sm:border-b-0 border-slate-100 pb-1 sm:pb-0">
                <strong class="text-slate-900">${escapeHtml(p.name)}</strong>
              </div>
              <div>
                <label class="block sm:hidden text-[10px] text-slate-500 font-bold mb-0.5">Giá tháng (VNĐ)</label>
                <input id="adminPlanPrice_${idx}" type="text" inputmode="numeric" value="${p.id === 'free' ? '0' : formatVndDots(p.price)}" oninput="this.value = formatVndDots(this.value)" ${p.id === 'free' ? 'disabled' : ''} class="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono" title="Giá tháng">
              </div>
              <div>
                <label class="block sm:hidden text-[10px] text-slate-500 font-bold mb-0.5">Giá năm (VNĐ)</label>
                <input id="adminPlanYearlyPrice_${idx}" type="text" inputmode="numeric" value="${p.id === 'free' ? '0' : formatVndDots(p.yearlyPrice || 0)}" oninput="this.value = formatVndDots(this.value)" ${p.id === 'free' ? 'disabled' : ''} class="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono" title="Giá năm">
              </div>
              <div>
                <label class="block sm:hidden text-[10px] text-slate-500 font-bold mb-0.5">% Sale</label>
                <input id="adminPlanSale_${idx}" type="number" value="${p.salePercent || 0}" ${p.id === 'free' ? 'disabled' : ''} class="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono" title="% Sale">
              </div>
              <div>
                <label class="block sm:hidden text-[10px] text-slate-500 font-bold mb-0.5">Tối đa HS</label>
                <input id="adminPlanStudents_${idx}" type="text" inputmode="numeric" value="${formatVndDots(p.maxStudents)}" oninput="this.value = formatVndDots(this.value)" class="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono" title="Tối đa HS">
              </div>
              <div>
                <label class="block sm:hidden text-[10px] text-slate-500 font-bold mb-0.5">Tối đa GV</label>
                <input id="adminPlanTeachers_${idx}" type="number" min="1" value="${p.id === 'free' ? 1 : (Number(p.maxTeachers) || DEFAULT_VIP_PLANS[idx]?.maxTeachers || 1)}" ${p.id === 'free' ? 'disabled' : ''} class="w-full px-2 py-1 rounded-lg border border-slate-300 font-mono" title="Tối đa GV">
              </div>
            </div>
          `).join('')}
        `;
      }

      safeCreateIcons();
    }

    // ==================== QUẢN LÝ MÃ ƯU ĐÃI (DÀNH CHO ADMIN) ====================
    function formatVndDots(val) {
      const digits = String(val ?? '').replace(/\D/g, '');
      return digits ? Number(digits).toLocaleString('vi-VN') : '';
    }

    function parseVndDots(val) {
      return Number(String(val ?? '').replace(/\D/g, '')) || 0;
    }

    function onAdminNewPromoValueInput(el) {
      if (!el) return;
      const typeSel = document.getElementById('adminNewPromoTypeSelect');
      const mode = typeSel?.value || 'percent';
      if (mode === 'amount') {
        el.value = formatVndDots(el.value);
      } else {
        const digits = String(el.value ?? '').replace(/\D/g, '');
        if (!digits) {
          el.value = '';
        } else {
          const num = Math.min(100, Number(digits));
          el.value = String(num);
        }
      }
    }

    function toggleAdminNewPromoAllPlans(isAllChecked) {
      const planCbs = document.querySelectorAll('.admin-promo-plan-cb');
      planCbs.forEach(cb => {
        cb.disabled = Boolean(isAllChecked);
        if (isAllChecked) {
          cb.checked = true;
        }
      });
    }

    function onAdminNewPromoTypeChange() {
      const typeSel = document.getElementById('adminNewPromoTypeSelect');
      const valInp = document.getElementById('adminNewPromoValueInput');
      if (!typeSel || !valInp) return;
      if (typeSel.value === 'percent') {
        valInp.placeholder = '20';
      } else {
        valInp.placeholder = '10.000';
      }
      onAdminNewPromoValueInput(valInp);
    }

    async function loadAdminPromoCodes(showToast = false) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || isLoadingAdminPromoCodes) return;
      isLoadingAdminPromoCodes = true;
      const container = document.getElementById('adminPromoCodesContainer');
      const refreshBtn = document.getElementById('btnRefreshAdminPromoCodes');
      if (refreshBtn) refreshBtn.disabled = true;
      if (container && adminPromoCodesList.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Đang tải danh sách mã ưu đãi...</div>`;
      }

      try {
        const { data, error } = await supabaseClient
          .from('promo_codes')
          .select('code, discount_percent, discount_amount, max_uses, used_count, is_active, expires_at, applicable_plans')
          .order('is_active', { ascending: false })
          .order('code', { ascending: true });

        if (error) {
          if (container) {
            container.innerHTML = `<div class="p-4 text-center text-rose-600 text-xs font-bold">Lỗi tải danh sách mã ưu đãi: ${escapeHtml(error.message)}</div>`;
          }
          return;
        }

        adminPromoCodesList = Array.isArray(data) ? data : [];
        const badgeEl = document.getElementById('adminPromoCodesCountBadge');
        if (badgeEl) {
          badgeEl.innerText = `${adminPromoCodesList.length} mã`;
        }

        if (!container) return;
        if (adminPromoCodesList.length === 0) {
          container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Chưa có mã ưu đãi nào trong hệ thống.</div>`;
          return;
        }

        const planLabelMap = {};
        vipPlansConfig.forEach(p => { planLabelMap[p.id] = p.name; });

        container.innerHTML = `
          <table class="w-full text-left border-collapse text-[11px] sm:text-xs min-w-[660px]">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px]">
                <th class="py-2 px-2.5">Mã ưu đãi</th>
                <th class="py-2 px-2.5">Mức giảm</th>
                <th class="py-2 px-2.5">Gói áp dụng</th>
                <th class="py-2 px-2.5 text-center">Lượt dùng</th>
                <th class="py-2 px-2.5 text-center">Hạn dùng</th>
                <th class="py-2 px-2.5 text-center">Trạng thái</th>
                <th class="py-2 px-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${adminPromoCodesList.map(item => {
                const codeStr = String(item.code || '').toUpperCase();
                const pct = Number(item.discount_percent) || 0;
                const amt = Number(item.discount_amount) || 0;
                const discountText = pct > 0
                  ? `-${pct}%`
                  : `-${amt.toLocaleString('vi-VN')}đ`;
                const hasSpecificPlans = Array.isArray(item.applicable_plans) && item.applicable_plans.length > 0;
                const applicablePlansHtml = hasSpecificPlans
                  ? `<span class="text-slate-700 font-semibold">${escapeHtml(item.applicable_plans.map(pid => planLabelMap[pid] || pid).join(', '))}</span>`
                  : `<span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold text-[10px]">Tất cả gói</span>`;
                const usedCount = Number(item.used_count) || 0;
                const maxUsesText = (item.max_uses !== null && item.max_uses !== undefined && item.max_uses !== '')
                  ? Number(item.max_uses).toLocaleString('vi-VN')
                  : '∞';
                const isActive = Boolean(item.is_active);
                let expiryText = 'Không giới hạn';
                let isExpired = false;
                if (item.expires_at) {
                  const expDate = new Date(item.expires_at);
                  if (!Number.isNaN(expDate.getTime())) {
                    expiryText = expDate.toLocaleDateString('vi-VN');
                    isExpired = expDate.getTime() < Date.now();
                  }
                }

                return `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="py-2 px-2.5 font-mono font-extrabold text-indigo-700 whitespace-nowrap">
                      ${escapeHtml(codeStr)}
                    </td>
                    <td class="py-2 px-2.5 font-extrabold text-emerald-700 whitespace-nowrap">
                      ${escapeHtml(discountText)}
                    </td>
                    <td class="py-2 px-2.5">
                      ${applicablePlansHtml}
                    </td>
                    <td class="py-2 px-2.5 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                      ${escapeHtml(`${usedCount.toLocaleString('vi-VN')} / ${maxUsesText}`)}
                    </td>
                    <td class="py-2 px-2.5 text-center whitespace-nowrap ${isExpired ? 'text-rose-600 font-bold' : 'text-slate-600 font-medium'}">
                      ${escapeHtml(expiryText)}${isExpired ? ' (Hết hạn)' : ''}
                    </td>
                    <td class="py-2 px-2.5 text-center whitespace-nowrap">
                      ${isActive
                        ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-[10px]">Đang bật</span>`
                        : `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-bold text-[10px]">Đã tắt</span>`}
                    </td>
                    <td class="py-2 px-2.5 text-right whitespace-nowrap">
                      <div class="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onclick="toggleAdminPromoCodeActive('${escapeHtml(codeStr)}', ${!isActive})"
                          class="px-2 py-1 rounded-lg ${isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} text-[10.5px] font-bold transition"
                        >
                          ${isActive ? 'Tắt' : 'Bật'}
                        </button>
                        <button
                          type="button"
                          onclick="deleteAdminPromoCode('${escapeHtml(codeStr)}')"
                          class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10.5px] font-bold transition"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;

        if (showToast) showUndoToast(`Đã cập nhật ${adminPromoCodesList.length} mã ưu đãi!`);
      } catch (err) {
        console.warn('Lỗi tải mã ưu đãi Admin:', err);
      } finally {
        isLoadingAdminPromoCodes = false;
        if (refreshBtn) refreshBtn.disabled = false;
        safeCreateIcons();
      }
    }

    async function handleCreateAdminPromoCode(e) {
      e.preventDefault();
      if (!isCurrentUserVipAdmin() || !supabaseClient) return;

      const codeInp = document.getElementById('adminNewPromoCodeInput');
      const typeSel = document.getElementById('adminNewPromoTypeSelect');
      const valInp = document.getElementById('adminNewPromoValueInput');
      const maxInp = document.getElementById('adminNewPromoMaxUsesInput');
      const expInp = document.getElementById('adminNewPromoExpiresInput');
      const allPlansCb = document.getElementById('adminNewPromoAllPlansCb');
      const submitBtn = document.getElementById('btnCreateAdminPromoCode');

      const rawCode = String(codeInp?.value || '').trim().toUpperCase().replace(/\s+/g, '');
      const cleanCode = rawCode.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/[^A-Z0-9_-]/g, '');

      if (cleanCode === 'TIENPHONG') {
        showUndoToast('Mã TIENPHONG được hệ thống dùng riêng cho chương trình tiên phong.');
        return;
      }

      if (!cleanCode) {
        showUndoToast('Mã ưu đãi chỉ gồm chữ hoa không dấu, số, gạch ngang hoặc gạch dưới.');
        return;
      }

      const discountType = typeSel?.value || 'percent';
      const rawVal = parseVndDots(valInp?.value);
      if (rawVal <= 0) {
        showUndoToast('Vui lòng nhập giá trị giảm lớn hơn 0.');
        return;
      }

      let applicablePlans = null;
      if (!allPlansCb?.checked) {
        const checkedPlans = Array.from(document.querySelectorAll('.admin-promo-plan-cb:checked')).map(cb => cb.value);
        if (checkedPlans.length === 0) {
          showUndoToast('Vui lòng chọn ít nhất 1 gói áp dụng.');
          return;
        }
        applicablePlans = checkedPlans;
      }

      let discountPercent = 0;
      let discountAmount = 0;
      if (discountType === 'percent') {
        if (rawVal > 100) {
          showUndoToast('Phần trăm giảm giá chỉ từ 1 đến 100%.');
          return;
        }
        discountPercent = Math.round(rawVal);
      } else {
        discountAmount = Math.round(rawVal);
      }

      const maxUsesRaw = String(maxInp?.value || '').trim();
      const maxUses = maxUsesRaw !== '' ? Math.max(1, Math.round(Number(maxUsesRaw))) : null;

      const expRaw = String(expInp?.value || '').trim();
      let expiresAtIso = null;
      if (expRaw) {
        const parsedExp = parseLocalDateInput(expRaw);
        if (parsedExp) {
          parsedExp.setHours(23, 59, 59, 999);
          expiresAtIso = parsedExp.toISOString();
        }
      }

      if (submitBtn) submitBtn.disabled = true;

      try {
        const { error } = await supabaseClient
          .from('promo_codes')
          .insert({
            code: cleanCode,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            max_uses: maxUses,
            used_count: 0,
            is_active: true,
            expires_at: expiresAtIso,
            applicable_plans: applicablePlans
          });

        if (error) {
          showUndoToast(`Lỗi tạo mã ưu đãi: ${error.message}`);
          return;
        }

        if (codeInp) codeInp.value = '';
        if (valInp) valInp.value = '';
        if (maxInp) maxInp.value = '';
        if (expInp) expInp.value = '';
        if (allPlansCb) {
          allPlansCb.checked = true;
          toggleAdminNewPromoAllPlans(true);
        }

        showUndoToast(`Đã tạo mã ưu đãi ${cleanCode}!`);
        await loadAdminPromoCodes(false);
      } catch (err) {
        showUndoToast('Lỗi kết nối khi tạo mã ưu đãi.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async function toggleAdminPromoCodeActive(code, nextActive) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || !code) return;
      try {
        const { error } = await supabaseClient
          .from('promo_codes')
          .update({ is_active: Boolean(nextActive) })
          .eq('code', code);

        if (error) {
          showUndoToast(`Lỗi cập nhật mã ${code}: ${error.message}`);
          return;
        }
        showUndoToast(nextActive ? `Đã BẬT mã ${code}!` : `Đã TẮT mã ${code}.`);
        await loadAdminPromoCodes(false);
      } catch (err) {
        showUndoToast('Lỗi kết nối khi cập nhật trạng thái mã ưu đãi.');
      }
    }

    function deleteAdminPromoCode(code) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || !code) return;
      openConfirmModal(
        `Xóa mã ưu đãi ${code}?`,
        `Bạn có chắc chắn muốn xóa vĩnh viễn mã ưu đãi "${code}" khỏi hệ thống?`,
        async () => {
          try {
            const { error } = await supabaseClient
              .from('promo_codes')
              .delete()
              .eq('code', code);

            if (error) {
              showUndoToast(`Lỗi xóa mã ${code}: ${error.message}`);
              return;
            }
            showUndoToast(`Đã xóa mã ưu đãi ${code}.`);
            await loadAdminPromoCodes(false);
          } catch (err) {
            showUndoToast('Lỗi kết nối khi xóa mã ưu đãi.');
          }
        }
      );
    }

    // ==================== QUẢN TRỊ ĐƠN NÂNG CẤP VIP (DÀNH CHO ADMIN) ====================
    let adminVipDateMode = 'today';

    function setAdminVipDateMode(mode) {
      adminVipDateMode = mode || 'today';
      document.querySelectorAll('[data-vip-date-mode]').forEach(btn => {
        const isActive = btn.getAttribute('data-vip-date-mode') === adminVipDateMode;
        btn.className = isActive
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-indigo-600 text-white border-indigo-600 shadow-2xs transition'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 transition';
      });

      const customBox = document.getElementById('adminVipCustomDateBox');
      if (customBox) {
        customBox.classList.toggle('hidden', adminVipDateMode !== 'custom');
      }

      if (adminVipDateMode === 'custom') {
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const fromInp = document.getElementById('adminVipDateFrom');
        const toInp = document.getElementById('adminVipDateTo');
        if (fromInp && !fromInp.value) fromInp.value = todayIso;
        if (toInp && !toInp.value) toInp.value = todayIso;
      }

      loadAdminVipOrders(false);
    }

    async function loadAdminVipOrders(showToast = false) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || isLoadingAdminVipOrders) return;
      isLoadingAdminVipOrders = true;
      const container = document.getElementById('adminVipOrdersContainer');
      const refreshBtn = document.getElementById('btnRefreshAdminVipOrders');
      if (refreshBtn) refreshBtn.disabled = true;
      if (container && adminVipOrdersList.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Đang tải danh sách đơn nâng cấp VIP...</div>`;
      }

      try {
        let query = supabaseClient
          .from('vip_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        const rawKw = String(document.getElementById('adminVipSearchInput')?.value || '')
          .trim()
          .replace(/[,()%]/g, '');

        if (rawKw) {
          query = query.or(`order_code.ilike.%${rawKw}%,user_email.ilike.%${rawKw}%`);
        } else {
          const now = new Date();
          if (adminVipDateMode === 'today') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
          } else if (adminVipDateMode === '7days') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
          } else if (adminVipDateMode === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
          } else if (adminVipDateMode === 'custom') {
            const fromDate = parseLocalDateInput(document.getElementById('adminVipDateFrom')?.value);
            const toDate = parseLocalDateInput(document.getElementById('adminVipDateTo')?.value);
            if (fromDate) {
              fromDate.setHours(0, 0, 0, 0);
              query = query.gte('created_at', fromDate.toISOString());
            }
            if (toDate) {
              toDate.setHours(23, 59, 59, 999);
              query = query.lte('created_at', toDate.toISOString());
            }
          }
        }

        const statusFilter = document.getElementById('adminVipStatusFilter')?.value || 'active_all';
        if (statusFilter === 'active_all' && rawKw === '') {
          query = query.neq('status', 'cancelled');
        } else if (statusFilter !== 'active_all') {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;

        if (error) {
          if (container) {
            container.innerHTML = `<div class="p-4 text-center text-rose-600 text-xs font-bold">Lỗi tải danh sách đơn: ${error.message}</div>`;
          }
          return;
        }

        adminVipOrdersList = Array.isArray(data) ? data : [];
        const pendingCount = adminVipOrdersList.filter(o => o.status === 'pending').length;
        const paidOrders = adminVipOrdersList.filter(o => o.status === 'paid');
        const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

        const statRevEl = document.getElementById('adminVipStatRevenue');
        const statPaidEl = document.getElementById('adminVipStatPaidCount');
        const statPendingEl = document.getElementById('adminVipStatPendingCount');
        if (statRevEl) statRevEl.innerText = `${totalRevenue.toLocaleString('vi-VN')}đ`;
        if (statPaidEl) statPaidEl.innerText = `${paidOrders.length} đơn`;
        if (statPendingEl) statPendingEl.innerText = `${pendingCount} đơn`;

        const badgeEl = document.getElementById('adminVipPendingCountBadge');
        if (badgeEl) {
          badgeEl.innerText = `${pendingCount} chờ duyệt`;
          badgeEl.className = pendingCount > 0
            ? 'px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
            : 'px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200';
        }

        if (!container) return;
        if (adminVipOrdersList.length === 0) {
          container.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">Không có đơn nâng cấp VIP nào trong khoảng thời gian đã chọn.</div>`;
          return;
        }

        const planNameMap = {};
        vipPlansConfig.forEach(p => { planNameMap[p.id] = p.name; });

        container.innerHTML = `
          <table class="w-full text-left border-collapse text-[11px] sm:text-xs min-w-[600px]">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px]">
                <th class="py-2 px-2.5">Mã đơn</th>
                <th class="py-2 px-2.5">Email</th>
                <th class="py-2 px-2.5">Gói & Chu kỳ</th>
                <th class="py-2 px-2.5 text-right">Số tiền</th>
                <th class="py-2 px-2.5 text-center">Trạng thái</th>
                <th class="py-2 px-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${adminVipOrdersList.map(order => {
                const isPending = order.status === 'pending';
                const canApproveManually = isPending || order.status === 'cancelled';
                const planLabel = planNameMap[order.plan_id] || order.plan_id || '--';
                const cycleLabel = order.billing_cycle === 'yearly' ? 'Năm' : 'Tháng';
                const amountVal = Number(order.amount) || 0;
                const createdStr = order.created_at ? new Date(order.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';

                let statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">${order.status || '--'}</span>`;
                if (order.status === 'pending') {
                  statusBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-extrabold text-[10px]">Chờ duyệt</span>`;
                } else if (order.status === 'paid') {
                  statusBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-[10px]">Đã kích hoạt</span>`;
                } else if (order.status === 'rejected') {
                  statusBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-[10px]">Đã từ chối</span>`;
                } else if (order.status === 'cancelled') {
                  statusBadge = `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold text-[10px]">Đã hủy</span>`;
                }

                return `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="py-2 px-2.5 font-mono font-extrabold text-indigo-700 whitespace-nowrap">
                      <div>${escapeHtml(order.order_code || '--')}</div>
                      ${createdStr ? `<div class="text-[9.5px] font-sans font-normal text-slate-400">${escapeHtml(createdStr)}</div>` : ''}
                    </td>
                    <td class="py-2 px-2.5 font-medium text-slate-700 max-w-[160px] truncate" title="${escapeHtml(order.user_email || '')}">
                      ${escapeHtml(order.user_email || '--')}
                    </td>
                    <td class="py-2 px-2.5 font-bold text-slate-900 whitespace-nowrap">
                      ${escapeHtml(planLabel)} <span class="text-slate-500 font-semibold">(${cycleLabel})</span>
                    </td>
                    <td class="py-2 px-2.5 text-right font-mono font-extrabold text-rose-600 whitespace-nowrap">
                      ${amountVal.toLocaleString('vi-VN')}đ
                    </td>
                    <td class="py-2 px-2.5 text-center whitespace-nowrap">
                      ${statusBadge}
                    </td>
                    <td class="py-2 px-2.5 text-right whitespace-nowrap">
                      ${canApproveManually ? `
                        <div class="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onclick="approveAdminVipOrder('${escapeHtml(order.order_code)}', ${amountVal})"
                            class="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-extrabold transition shadow-sm"
                          >
                            Duyệt tay
                          </button>
                          ${isPending ? `
                            <button
                              type="button"
                              onclick="rejectAdminVipOrder('${escapeHtml(order.id)}', '${escapeHtml(order.order_code)}')"
                              class="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10.5px] font-bold transition"
                            >
                              Từ chối
                            </button>
                          ` : ''}
                        </div>
                      ` : `<span class="text-[10.5px] text-slate-400 font-medium">--</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;

        if (showToast) showUndoToast(`Đã cập nhật ${adminVipOrdersList.length} đơn nâng cấp VIP!`);
      } catch (err) {
        console.warn('Lỗi tải đơn VIP Admin:', err);
      } finally {
        isLoadingAdminVipOrders = false;
        if (refreshBtn) refreshBtn.disabled = false;
      }
    }

    async function approveAdminVipOrder(orderCode, amount) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || !orderCode) return;
      openConfirmModal(
        `Duyệt tay đơn ${orderCode}?`,
        `Xác nhận đã nhận ${Number(amount || 0).toLocaleString('vi-VN')}đ và kích hoạt gói VIP cho tài khoản này?`,
        async () => {
          try {
            const { data, error } = await supabaseClient.rpc('activate_vip_order', {
              p_order_code: orderCode,
              p_paid_amount: Number(amount) || 0,
              p_gateway_tx_id: 'MANUAL_' + Date.now()
            });

            if (error) {
              showUndoToast(`Lỗi duyệt đơn: ${error.message}`);
              return;
            }

            if (data && data.ok === false) {
              showUndoToast(data.message || 'Không thể duyệt đơn (đơn đã được xử lý hoặc không hợp lệ).');
              await loadAdminVipOrders(false);
              return;
            }

            showUndoToast(`Đã duyệt tay thành công đơn ${orderCode}!`);
            await loadAdminVipOrders(false);
            await loadPioneerPromoSettings();
            if (currentUser?.id) {
              await loadUserDataFromCloud(currentUser, false);
            }
          } catch (err) {
            showUndoToast('Lỗi kết nối khi duyệt đơn VIP.');
          }
        }
      );
    }

    async function rejectAdminVipOrder(orderId, orderCode) {
      if (!isCurrentUserVipAdmin() || !supabaseClient || !orderId) return;
      openConfirmModal(
        `Từ chối đơn ${orderCode}?`,
        'Đơn hàng này sẽ chuyển sang trạng thái Đã từ chối và không kích hoạt gói VIP.',
        async () => {
          try {
            const { error } = await supabaseClient
              .from('vip_orders')
              .update({ status: 'rejected' })
              .eq('id', orderId);

            if (error) {
              showUndoToast(`Lỗi từ chối đơn: ${error.message}`);
              return;
            }
            showUndoToast(`Đã từ chối đơn ${orderCode}.`);
            await loadAdminVipOrders(false);
          } catch (err) {
            showUndoToast('Lỗi kết nối khi từ chối đơn VIP.');
          }
        }
      );
    }

    function exportAdminVipOrdersExcel() {
      if (!isCurrentUserVipAdmin()) return;
      if (typeof XLSX === 'undefined') {
        showUndoToast('Thư viện Excel chưa sẵn sàng.');
        return;
      }
      if (!Array.isArray(adminVipOrdersList) || adminVipOrdersList.length === 0) {
        showUndoToast('Không có đơn hàng nào trong bộ lọc hiện tại để xuất Excel.');
        return;
      }

      const planNameMap = {};
      vipPlansConfig.forEach(p => { planNameMap[p.id] = p.name; });

      const statusLabelMap = {
        paid: 'Đã kích hoạt',
        pending: 'Chờ duyệt',
        rejected: 'Đã từ chối',
        underpaid: 'Chuyển thiếu',
        cancelled: 'Đã hủy'
      };

      const rows = [
        ['BÁO CÁO ĐƠN NÂNG CẤP VIP & DOANH THU'],
        ['Ngày xuất:', new Date().toLocaleString('vi-VN'), 'Kỳ lọc:', adminVipDateMode],
        [],
        ['STT', 'Thời gian tạo', 'Thời gian kích hoạt', 'Mã đơn', 'Email khách hàng', 'Gói VIP', 'Chu kỳ', 'Mã ưu đãi', 'Giảm (%)', 'Số tiền (VNĐ)', 'Trạng thái', 'Mã GD SePay']
      ];

      let totalPaidRevenue = 0;
      let totalPaidCount = 0;

      adminVipOrdersList.forEach((o, idx) => {
        const amountNum = Number(o.amount) || 0;
        if (o.status === 'paid') {
          totalPaidRevenue += amountNum;
          totalPaidCount += 1;
        }
        const createdAtStr = o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '';
        const paidAtStr = o.paid_at ? new Date(o.paid_at).toLocaleString('vi-VN') : '';
        const planLabel = planNameMap[o.plan_id] || o.plan_id || '';
        const cycleLabel = o.billing_cycle === 'yearly' ? 'Năm' : 'Tháng';
        const statusLabel = statusLabelMap[o.status] || o.status || '';

        rows.push([
          idx + 1,
          createdAtStr,
          paidAtStr,
          o.order_code || '',
          o.user_email || '',
          planLabel,
          cycleLabel,
          o.promo_code || '',
          Number(o.discount_percent) || 0,
          amountNum,
          statusLabel,
          o.gateway_tx_id || ''
        ]);
      });

      rows.push([]);
      rows.push([
        '',
        '',
        '',
        'TỔNG DOANH THU THỰC THU (Đơn đã kích hoạt)',
        `${totalPaidCount} đơn đã kích hoạt`,
        '',
        '',
        '',
        '',
        totalPaidRevenue,
        '',
        ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 20 },
        { wch: 16 },
        { wch: 28 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DoanhThuVIP');
      const fileName = `Doanh_Thu_VIP_${adminVipDateMode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showUndoToast('Đã xuất file Excel doanh thu thành công!');
    }

    // ==================== COMPONENT THANH TOÁN QR VIETINBANK (SEPAY) ====================
    const VIETINBANK_QR_CONFIG = {
      bin: '970415',
      bankCode: 'VietinBank',
      accountNumber: '104869424470',
      accountName: 'BUI HONG PHUC',
      prefix: 'SEVQR'
    };

    let activeVietQrNoteText = '';
    let activeVietQrOrderCode = null;
    let activeVietQrOrderAmount = 0;
    let activeVietQrPlanId = null;
    let activeVietQrPlanObj = null;
    let activeVietQrIsPaid = false;
    let vipVietQrPollTimer = null;

    function copyTextToClipboardFallback(textVal, toastMsg = 'Đã sao chép!') {
      const tempInp = document.createElement('input');
      tempInp.value = String(textVal || '');
      document.body.appendChild(tempInp);
      tempInp.select();
      try {
        document.execCommand('copy');
      } catch (e) {}
      document.body.removeChild(tempInp);
      showUndoToast(toastMsg);
    }

    function buildVietinBankQrUrls(amount, transferContent) {
      const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
      const encodedInfo = encodeURIComponent(transferContent);
      const encodedName = encodeURIComponent(VIETINBANK_QR_CONFIG.accountName);
      const primaryVietQrUrl = `https://img.vietqr.io/image/${VIETINBANK_QR_CONFIG.bin}-${VIETINBANK_QR_CONFIG.accountNumber}-qr_only.png?amount=${safeAmount}&addInfo=${encodedInfo}&accountName=${encodedName}`;
      const fallbackSePayUrl = `https://qr.sepay.vn/img?acc=${VIETINBANK_QR_CONFIG.accountNumber}&bank=${VIETINBANK_QR_CONFIG.bankCode}&amount=${safeAmount}&des=${encodedInfo}&template=qronly`;
      return { primaryVietQrUrl, fallbackSePayUrl };
    }

    function stopVipVietQrStatusPolling() {
      if (vipVietQrPollTimer) {
        clearInterval(vipVietQrPollTimer);
        vipVietQrPollTimer = null;
      }
    }

    function setVipVietQrStatusUI(state, message) {
      const banner = document.getElementById('vipVietQrStatusBanner');
      const textEl = document.getElementById('vipVietQrStatusText');
      if (!banner) return;

      if (state === 'paid') {
        banner.className = 'rounded-xl bg-emerald-50 border border-emerald-300 px-2.5 py-2 flex items-center justify-between gap-2 text-xs';
        banner.innerHTML = `
          <div class="flex items-center gap-2 text-emerald-800 font-extrabold">
            <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600 shrink-0"></i>
            <span id="vipVietQrStatusText">${message || 'Thanh toán thành công! Đã kích hoạt gói VIP.'}</span>
          </div>
        `;
      } else if (state === 'underpaid') {
        banner.className = 'rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs';
        if (textEl) textEl.innerText = message || 'Số tiền chuyển chưa đủ, vui lòng kiểm tra lại.';
      } else {
        banner.className = 'rounded-xl bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs';
        if (textEl) textEl.innerText = message || 'Đang chờ chuyển khoản...';
      }
      safeCreateIcons();
    }

    async function checkActiveVietQrOrderStatus(showFeedback = false) {
      if (!supabaseClient || !activeVietQrOrderCode) {
        if (showFeedback) showUndoToast('Vui lòng đăng nhập để tự động kiểm tra trạng thái đơn hàng.');
        return;
      }
      try {
        const { data, error } = await supabaseClient
          .from('vip_orders')
          .select('order_code, status, plan_id, amount, expires_at')
          .eq('order_code', activeVietQrOrderCode)
          .maybeSingle();

        if (error || !data) {
          if (showFeedback) showUndoToast('Chưa ghi nhận giao dịch chuyển khoản. Vui lòng đợi vài giây rồi thử lại.');
          return;
        }

        if (data.status === 'paid') {
          stopVipVietQrStatusPolling();
          activeVietQrIsPaid = true;
          const promoInput = document.getElementById('vipPromoCodeInput');
          const applyBtn = document.getElementById('btnApplyVipPromo');
          const clearBtn = document.getElementById('btnClearVipPromo');
          const feedbackEl = document.getElementById('vipPromoFeedbackText');
          if (promoInput) {
            promoInput.disabled = true;
            promoInput.value = '';
          }
          if (applyBtn) applyBtn.disabled = true;
          if (clearBtn) {
            clearBtn.disabled = true;
            clearBtn.classList.add('hidden');
          }

          const wasPioneerPromo = Boolean(appliedVipPromo?.is_pioneer);
          if (wasPioneerPromo) {
            hasUsedPioneerDiscount = true;
            if (currentUser && currentUser.id) {
              localStorage.setItem(`dipi_user_${currentUser.id}_pioneer_used`, '1');
            }
          }
          hasUsedFreeTrial = true;
          if (currentUser && currentUser.id) {
            localStorage.setItem(`dipi_user_${currentUser.id}_trial_used`, '1');
          }
          appliedVipPromo = null;
          if (feedbackEl) {
            feedbackEl.innerText = '';
            feedbackEl.classList.add('hidden');
          }
          if (currentUser?.id) {
            await loadUserDataFromCloud(currentUser, false);
          }
          await loadPioneerPromoSettings();
          setVipVietQrStatusUI('paid', 'Thanh toán thành công! Gói VIP của bạn đã được kích hoạt.');
          renderVipSubscriptionModal();
          showUndoToast('Thanh toán thành công! Gói VIP đã được kích hoạt tự động.');
        } else if (data.status === 'underpaid') {
          const totalAmt = Number(data.amount) || 0;
          setVipVietQrStatusUI('underpaid', `Số tiền chuyển chưa đủ (${totalAmt.toLocaleString('vi-VN')}đ). Vui lòng kiểm tra lại.`);
          if (showFeedback) showUndoToast('Hệ thống ghi nhận số tiền chuyển chưa đủ, vui lòng chuyển đủ số tiền đơn hàng.');
        } else if (showFeedback) {
          showUndoToast('Hệ thống vẫn đang chờ ngân hàng xác nhận giao dịch...');
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra trạng thái đơn hàng:', err);
      }
    }

    async function openVipVietQrCheckoutModal(plan) {
      if (!currentUser || !currentUser.id) {
        closeModal('modalVipSubscription');
        openAuthModal('signin');
        showUndoToast('Vui lòng đăng nhập để thanh toán nâng cấp gói!');
        return;
      }

      stopVipVietQrStatusPolling();

      activeVietQrPlanObj = plan;
      activeVietQrIsPaid = false;
      appliedVipPromo = null;
      hasUserClearedVipPromo = false;
      activeVietQrOrderCode = null;
      activeVietQrOrderAmount = 0;
      activeVietQrPlanId = plan.id;
      activeVietQrNoteText = '';

      const promoInput = document.getElementById('vipPromoCodeInput');
      const applyBtn = document.getElementById('btnApplyVipPromo');
      const clearBtn = document.getElementById('btnClearVipPromo');
      const feedbackEl = document.getElementById('vipPromoFeedbackText');
      const baseAmountRow = document.getElementById('vipVietQrBaseAmountRow');
      const discountRow = document.getElementById('vipVietQrDiscountRow');

      if (promoInput) {
        promoInput.disabled = false;
        promoInput.value = '';
      }
      if (applyBtn) applyBtn.disabled = false;
      if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.classList.add('hidden');
      }
      if (feedbackEl) {
        feedbackEl.innerText = '';
        feedbackEl.classList.add('hidden');
      }
      baseAmountRow?.classList.add('hidden');
      discountRow?.classList.add('hidden');

      openModal('modalVipVietQrCheckout');

      if (currentUser?.id && getActivePioneerDiscountPercent() > 0) {
        if (promoInput) promoInput.value = 'TIENPHONG';
        await applyVipPromoCode('TIENPHONG', true);
      }

      await createVipOrderAndRenderQr(plan);
    }

    async function createVipOrderAndRenderQr(plan) {
      if (!plan) return;
      stopVipVietQrStatusPolling();

      activeVietQrOrderCode = null;
      activeVietQrOrderAmount = 0;
      activeVietQrPlanId = plan.id;
      activeVietQrNoteText = '';

      const cycleShort = currentVipBillingCycle === 'yearly' ? 'năm' : 'tháng';
      const badgeAccentClasses = {
        sky: 'bg-sky-50 text-sky-700 border-sky-200',
        slate: 'bg-slate-100 text-slate-800 border-slate-300',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        amber: 'bg-amber-50 text-amber-800 border-amber-300',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        rose: 'bg-rose-50 text-rose-700 border-rose-200'
      };
      const qrAccentMap = {
        free: 'sky',
        tra_chanh: 'emerald',
        tra_sua: 'amber',
        trum_tra: 'indigo',
        trung_tam: 'rose'
      };
      const resolvedAccent = qrAccentMap[plan.id] || 'emerald';

      const planBadgeEl = document.getElementById('vipVietQrPlanBadge');
      if (planBadgeEl) {
        planBadgeEl.innerText = `${plan.name} / ${cycleShort}`;
        planBadgeEl.className = `px-2 py-0.5 rounded-full font-extrabold text-[10.5px] border ${badgeAccentClasses[resolvedAccent] || badgeAccentClasses.emerald}`;
      }

      const baseAmountRow = document.getElementById('vipVietQrBaseAmountRow');
      const baseAmountValEl = document.getElementById('vipVietQrBaseAmountValue');
      const discountRow = document.getElementById('vipVietQrDiscountRow');
      const discountLabelEl = document.getElementById('vipVietQrDiscountLabel');
      const discountValEl = document.getElementById('vipVietQrDiscountValue');
      const amountEl = document.getElementById('vipVietQrAmountValue');
      const noteEl = document.getElementById('vipVietQrContentNote');
      const qrImg = document.getElementById('vipVietQrImage');
      const qrPlaceholder = document.getElementById('vipVietQrPlaceholderBox');

      baseAmountRow?.classList.add('hidden');
      discountRow?.classList.add('hidden');
      if (amountEl) amountEl.innerText = '--';
      if (noteEl) noteEl.innerText = 'Đang tạo mã...';

      if (qrImg) {
        qrImg.src = '';
        qrImg.classList.add('hidden');
      }
      if (qrPlaceholder) {
        qrPlaceholder.classList.remove('hidden');
        qrPlaceholder.innerHTML = `
          <i data-lucide="loader-2" class="w-7 h-7 text-indigo-600 animate-spin"></i>
          <div class="text-xs font-extrabold text-slate-800">Đang khởi tạo đơn hàng an toàn...</div>
          <div class="text-[10.5px] text-slate-500">Vui lòng đợi trong giây lát</div>
        `;
      }

      const statusBanner = document.getElementById('vipVietQrStatusBanner');
      if (statusBanner) {
        statusBanner.className = 'rounded-xl bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs';
        statusBanner.innerHTML = `
          <div class="flex items-center gap-1.5 text-[#78350f] font-bold min-w-0">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
            <span id="vipVietQrStatusText" class="truncate">Đang tạo đơn hàng...</span>
          </div>
          <button
            type="button"
            onclick="checkActiveVietQrOrderStatus(true)"
            class="px-2 py-0.5 rounded-lg bg-white hover:bg-amber-50 text-[#92400e] border border-[#fcd34d] text-[10.5px] font-extrabold transition shrink-0 shadow-sm"
          >
            Kiểm tra ngay
          </button>
        `;
      }
      safeCreateIcons();

      const showOrderCreateError = (errMsg) => {
        setVipVietQrStatusUI('underpaid', 'Không thể tạo đơn hàng');
        if (noteEl) noteEl.innerText = 'Lỗi tạo mã';
        if (qrImg) {
          qrImg.src = '';
          qrImg.classList.add('hidden');
        }
        if (qrPlaceholder) {
          qrPlaceholder.classList.remove('hidden');
          qrPlaceholder.innerHTML = `
            <div class="w-9 h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <i data-lucide="alert-circle" class="w-5 h-5"></i>
            </div>
            <div class="text-xs font-extrabold text-rose-700 leading-snug">${escapeHtml(errMsg)}</div>
            <button
              type="button"
              id="btnRetryCreateVipOrder"
              class="mt-1 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition active:scale-95"
            >
              Thử lại
            </button>
          `;
          const retryBtn = document.getElementById('btnRetryCreateVipOrder');
          if (retryBtn) {
            retryBtn.onclick = () => createVipOrderAndRenderQr(plan);
          }
        }
        safeCreateIcons();
      };

      if (!supabaseClient) {
        showOrderCreateError('Chưa kết nối được máy chủ thanh toán.');
        return;
      }

      try {
        const { data, error } = await supabaseClient.rpc('create_vip_payment_order', {
          p_plan_id: plan.id,
          p_billing_cycle: currentVipBillingCycle,
          p_promo_code: appliedVipPromo?.code || null
        });

        if (error || !data || data.ok !== true) {
          const errMessage = error?.message || data?.message || 'Không thể khởi tạo đơn hàng trên máy chủ.';
          showOrderCreateError(errMessage);
          return;
        }

        const orderCode = String(data.order_code || '').trim();
        const serverAmount = Math.max(0, Math.round(Number(data.amount) || 0));
        const baseAmount = Math.max(0, Math.round(Number(data.base_amount) || serverAmount));
        const discountSaved = Math.max(0, baseAmount - serverAmount);
        const appliedCodeStr = String(data.promo_code || '').trim().toUpperCase();
        const appliedDiscPct = Math.max(0, Number(data.discount_percent) || 0);
        const transferContent = `${VIETINBANK_QR_CONFIG.prefix} ${orderCode}`;

        activeVietQrOrderCode = orderCode;
        activeVietQrOrderAmount = serverAmount;
        activeVietQrNoteText = transferContent;

        if (planBadgeEl) {
          const shortPrice = serverAmount >= 1000
            ? `${Math.round(serverAmount / 1000).toLocaleString('vi-VN')}k`
            : `${serverAmount}đ`;
          planBadgeEl.innerText = `${plan.name} - ${shortPrice}/${cycleShort}`;
        }

        if (appliedCodeStr && discountSaved > 0) {
          if (baseAmountValEl) baseAmountValEl.innerText = `${baseAmount.toLocaleString('vi-VN')}đ`;
          if (discountLabelEl) {
            discountLabelEl.innerText = `Giảm thêm (${appliedCodeStr}${appliedDiscPct > 0 ? ` -${appliedDiscPct}%` : ''})`;
          }
          if (discountValEl) discountValEl.innerText = `-${discountSaved.toLocaleString('vi-VN')}đ`;
          baseAmountRow?.classList.remove('hidden');
          discountRow?.classList.remove('hidden');
        } else {
          baseAmountRow?.classList.add('hidden');
          discountRow?.classList.add('hidden');
        }

        if (amountEl) amountEl.innerText = `${serverAmount.toLocaleString('vi-VN')}đ`;
        if (noteEl) noteEl.innerText = transferContent;

        const { primaryVietQrUrl, fallbackSePayUrl } = buildVietinBankQrUrls(serverAmount, transferContent);
        if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
        if (qrImg) {
          qrImg.onerror = function () {
            if (this.dataset.fallbackApplied !== '1') {
              this.dataset.fallbackApplied = '1';
              this.src = fallbackSePayUrl;
            } else {
              this.onerror = null;
              this.src = 'https://placehold.co/240x240/e0f2fe/0369a1?text=VietinBank+QR';
            }
          };
          qrImg.dataset.fallbackApplied = '0';
          qrImg.src = primaryVietQrUrl;
          qrImg.classList.remove('hidden');
        }

        setVipVietQrStatusUI('pending', 'Đang chờ chuyển khoản...');
        vipVietQrPollTimer = setInterval(() => {
          checkActiveVietQrOrderStatus(false);
        }, 4000);
      } catch (err) {
        console.warn('Lỗi gọi RPC create_vip_payment_order:', err);
        showOrderCreateError('Lỗi kết nối mạng khi tạo đơn hàng. Vui lòng thử lại.');
      }
    }

    function copyVipVietQrTransferNote() {
      if (!activeVietQrNoteText) { showUndoToast('Chưa có mã chuyển khoản để sao chép.'); return; }
      copyTextToClipboardFallback(
        activeVietQrNoteText,
        `Đã sao chép nội dung chuyển khoản: ${activeVietQrNoteText}`
      );
    }

    function selectTeacherVipPlan(planId) {
      const targetPlan = vipPlansConfig.find(p => p.id === planId);
      if (!targetPlan) return;

      const paidActive = isPaidVipActive();
      const activePlan = getActiveVipPlan();
      const trialExpMs = trialExpiresAtIso ? new Date(trialExpiresAtIso).getTime() : NaN;
      const isInActiveTrial = !paidActive && !Number.isNaN(trialExpMs) && trialExpMs > Date.now();

      if (paidActive) {
        const effectivePurchasedId = purchasedPlanId || activePlan.id;
        const effectivePurchasedPlan = vipPlansConfig.find(p => p.id === effectivePurchasedId) || activePlan;
        const effectiveMaxStudents = Number(effectivePurchasedPlan?.maxStudents) || 0;
        const targetMaxStudents = Number(targetPlan.maxStudents) || 0;

        if (targetPlan.id !== effectivePurchasedPlan.id && targetMaxStudents < effectiveMaxStudents) {
          showUndoToast(`Gói ${targetPlan.name} đã bao gồm trong gói ${effectivePurchasedPlan.name} hiện tại.`);
          return;
        }

        if (targetPlan.id === effectivePurchasedPlan.id) {
          if (!currentUser || !currentUser.id) {
            closeModal('modalVipSubscription');
            openAuthModal('signin');
            showUndoToast('Vui lòng đăng nhập để gia hạn gói VIP!');
            return;
          }
          openVipVietQrCheckoutModal(targetPlan);
          return;
        }

        if (!currentUser || !currentUser.id) {
          closeModal('modalVipSubscription');
          openAuthModal('signin');
          showUndoToast('Vui lòng đăng nhập để thanh toán nâng cấp gói!');
          return;
        }

        const expMs = vipExpiresAtIso ? new Date(vipExpiresAtIso).getTime() : 0;
        const remainingDays = Math.max(0, Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24)));
        const currentPrice = Math.max(0, Number(effectivePurchasedPlan.price) || 0);
        const targetPrice = Math.max(1, Number(targetPlan.price) || 1);
        const convertedDays = Math.floor((remainingDays * currentPrice) / targetPrice);

        openConfirmModal(
          `Nâng cấp lên gói ${targetPlan.name}?`,
          `Gói ${effectivePurchasedPlan.name} hiện tại của bạn còn ${remainingDays} ngày sử dụng. Khi nâng cấp lên gói ${targetPlan.name}, hệ thống sẽ quy đổi tương đương và cộng thêm ${convertedDays} ngày vào thời hạn gói mới.`,
          () => {
            openVipVietQrCheckoutModal(targetPlan);
          }
        );
        return;
      }

      if (planId === currentTeacherPlanId && !isInActiveTrial) {
        showUndoToast(`Bạn đang sử dụng gói ${targetPlan.name}.`);
        return;
      }

      if (targetPlan.price > 0) {
        if (!currentUser || !currentUser.id) {
          closeModal('modalVipSubscription');
          openAuthModal('signin');
          showUndoToast('Vui lòng đăng nhập để thanh toán nâng cấp gói!');
          return;
        }
        if (isInActiveTrial) {
          const confirmDesc = targetPlan.id === 'tra_chanh'
            ? 'Bạn vẫn được giữ nguyên quyền lợi Trà Sữa đến hết hạn dùng thử còn lại, sau đó chuyển sang gói Trà Chanh (mua bằng mã TIENPHONG sẽ được tặng thêm +10 ngày vào chính gói Trà Chanh).'
            : 'Toàn bộ số ngày dùng thử còn lại sẽ được cộng dồn vào thời hạn gói mới và áp dụng quyền lợi gói mới ngay lập tức.';
          openConfirmModal(
            `Xác nhận mua gói ${targetPlan.name}?`,
            confirmDesc,
            () => {
              openVipVietQrCheckoutModal(targetPlan);
            }
          );
          return;
        }
        openVipVietQrCheckoutModal(targetPlan);
        return;
      }

      if (planId === 'free') {
        if (isInActiveTrial || paidActive) {
          showUndoToast('Gói Free đã được bao gồm trong gói đang sử dụng của bạn.');
          return;
        }
        openConfirmModal(
          'Chuyển về gói Free?',
          'Giới hạn học sinh sẽ chuyển về tối đa 15 học sinh. Bạn có chắc chắn muốn chuyển về gói Free?',
          () => {
            currentTeacherPlanId = 'free';
            vipExpiresAtIso = null;
            saveVipSubscriptionState(true);
            renderVipSubscriptionModal();
            showUndoToast('Đã chuyển tài khoản về gói Free.');
          }
        );
      }
    }

    async function saveVipPlansFromAdminForm() {
      if (!isCurrentUserVipAdmin()) return;
      vipPlansConfig = vipPlansConfig.map((p, idx) => {
        const isFree = p.id === 'free';
        const priceVal = isFree ? 0 : Math.max(0, parseVndDots(document.getElementById(`adminPlanPrice_${idx}`)?.value) || p.price);
        const yearlyPriceVal = isFree ? 0 : Math.max(0, parseVndDots(document.getElementById(`adminPlanYearlyPrice_${idx}`)?.value) || (priceVal * 10));
        const saleVal = isFree ? 0 : Math.max(0, Math.min(80, Number(document.getElementById(`adminPlanSale_${idx}`)?.value) || 0));
        const studentsVal = Math.max(1, parseVndDots(document.getElementById(`adminPlanStudents_${idx}`)?.value) || p.maxStudents);
        const teachersVal = isFree ? 1 : Math.max(1, Number(document.getElementById(`adminPlanTeachers_${idx}`)?.value) || Number(p.maxTeachers) || DEFAULT_VIP_PLANS[idx]?.maxTeachers || 1);
        return {
          ...p,
          price: priceVal,
          yearlyPrice: yearlyPriceVal,
          salePercent: saleVal,
          maxStudents: studentsVal,
          maxTeachers: teachersVal
        };
      });

      saveVipSubscriptionState(false);

      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('vip_plans_settings')
          .upsert({
            id: 'default',
            plans: vipPlansConfig,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (error) {
          showUndoToast(`Lỗi lưu bảng giá lên máy chủ: ${error.message}`);
          return;
        }
      }

      isVipAdminEditMode = false;
      renderVipSubscriptionModal();
      showUndoToast('Đã lưu và đồng bộ bảng giá VIP cho toàn bộ giáo viên!');
    }

    async function resetVipPlansToDefault() {
      if (!isCurrentUserVipAdmin()) return;
      vipPlansConfig = JSON.parse(JSON.stringify(DEFAULT_VIP_PLANS));
      saveVipSubscriptionState(false);

      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('vip_plans_settings')
          .upsert({
            id: 'default',
            plans: vipPlansConfig,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (error) {
          showUndoToast(`Lỗi khôi phục bảng giá trên máy chủ: ${error.message}`);
          return;
        }
      }

      renderVipSubscriptionModal();
      showUndoToast('Đã khôi phục cấu hình gói mặc định cho toàn hệ thống!');
    }

