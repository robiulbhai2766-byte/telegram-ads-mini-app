"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [ads, setAds] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);

  const [userSearch, setUserSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [adSettingsLoading, setAdSettingsLoading] =
    useState(false);

  const [message, setMessage] = useState("");

  /* DAILY BONUS */
  const [bonusAmount, setBonusAmount] = useState("0.050");
  const [bonusEnabled, setBonusEnabled] = useState(true);

  /* AD SETTINGS */
  const [adCooldownSeconds, setAdCooldownSeconds] =
    useState("30");

  const [maxDailyAds, setMaxDailyAds] =
    useState("20");

  const [dailyResetHours, setDailyResetHours] =
    useState("24");

  /* ADD AD FORM */
  const [form, setForm] = useState({
    title: "",
    ad_url: "",
    image_url: "",
    reward: "0.01",
    daily_limit: "20"
  });

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch(
        "/api/admin/session",
        {
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (data.authenticated) {
        setAuthenticated(true);

        await Promise.all([
          loadAds(),
          loadStats(),
          loadUsers(),
          loadBonusSettings(),
          loadAdSettings()
        ]);
      }
    } catch {
      // Not logged in
    } finally {
      setChecking(false);
    }
  }

  /* ================= LOGIN ================= */

  async function login(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/admin/login",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message || "Login failed."
        );
        return;
      }

      setAuthenticated(true);
      setEmail("");
      setPassword("");

      await Promise.all([
        loadAds(),
        loadStats(),
        loadUsers(),
        loadBonusSettings(),
        loadAdSettings()
      ]);
    } catch {
      setMessage(
        "Unable to connect to server."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ================= STATS ================= */

  async function loadStats() {
    setStatsLoading(true);

    try {
      const res = await fetch(
        "/api/admin/stats",
        {
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to load statistics."
        );
        return;
      }

      setStats(data.stats);
    } catch {
      setMessage(
        "Unable to load statistics."
      );
    } finally {
      setStatsLoading(false);
    }
  }

  /* ================= USERS ================= */

  async function loadUsers() {
    setUsersLoading(true);

    try {
      const res = await fetch(
        "/api/admin/users",
        {
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to load users."
        );
        return;
      }

      setUsers(data.users || []);
    } catch {
      setMessage(
        "Unable to load users."
      );
    } finally {
      setUsersLoading(false);
    }
  }

  /* ================= ADS ================= */

  async function loadAds() {
    try {
      const res = await fetch(
        "/api/admin/ads",
        {
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        setAds(data.ads || []);
      }
    } catch {
      setMessage(
        "Unable to load advertisements."
      );
    }
  }

  /* ================= DAILY BONUS ================= */

  async function loadBonusSettings() {
    try {
      const res = await fetch(
        "/api/admin/bonus",
        {
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to load bonus settings."
        );
        return;
      }

      setBonusAmount(
        Number(
          data.settings?.daily_bonus_amount ??
            0.05
        ).toFixed(3)
      );

      setBonusEnabled(
        Boolean(
          data.settings?.daily_bonus_enabled
        )
      );
    } catch {
      setMessage(
        "Unable to load bonus settings."
      );
    }
  }

  async function saveBonusSettings() {
    const amount = Number(bonusAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setMessage(
        "Bonus amount must be greater than 0."
      );
      return;
    }

    if (amount > 100) {
      setMessage(
        "Bonus amount cannot exceed 100."
      );
      return;
    }

    setBonusLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/admin/bonus",
        {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            daily_bonus_amount: amount,
            daily_bonus_enabled:
              Boolean(bonusEnabled)
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to save bonus settings."
        );
        return;
      }

      setBonusAmount(
        Number(
          data.settings
            ?.daily_bonus_amount ?? amount
        ).toFixed(3)
      );

      setBonusEnabled(
        Boolean(
          data.settings
            ?.daily_bonus_enabled ??
            bonusEnabled
        )
      );

      setMessage(
        "Daily Bonus settings saved successfully."
      );

      await loadBonusSettings();
    } catch {
      setMessage(
        "Unable to save bonus settings."
      );
    } finally {
      setBonusLoading(false);
    }
  }

  /* ================= AD SETTINGS ================= */

  async function loadAdSettings() {
    try {
      const res = await fetch(
        "/api/admin/settings",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to load ad settings."
        );
        return;
      }

      setAdCooldownSeconds(
        String(
          data.settings
            ?.ad_cooldown_seconds ?? 30
        )
      );

      setMaxDailyAds(
        String(
          data.settings
            ?.max_daily_ads ?? 20
        )
      );

      setDailyResetHours(
        String(
          data.settings
            ?.daily_reset_hours ?? 24
        )
      );
    } catch {
      setMessage(
        "Unable to load ad settings."
      );
    }
  }

  async function saveAdSettings() {
    const cooldown =
      Number(adCooldownSeconds);

    const dailyLimit =
      Number(maxDailyAds);

    const resetHours =
      Number(dailyResetHours);

    if (
      !Number.isInteger(cooldown) ||
      cooldown < 0 ||
      cooldown > 86400
    ) {
      setMessage(
        "Cooldown must be between 0 and 86400 seconds."
      );
      return;
    }

    if (
      !Number.isInteger(dailyLimit) ||
      dailyLimit < 1 ||
      dailyLimit > 10000
    ) {
      setMessage(
        "Daily limit must be between 1 and 10000."
      );
      return;
    }

    if (
      !Number.isInteger(resetHours) ||
      resetHours < 1 ||
      resetHours > 168
    ) {
      setMessage(
        "Reset hours must be between 1 and 168."
      );
      return;
    }

    setAdSettingsLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/admin/settings",
        {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ad_cooldown_seconds:
              cooldown,

            max_daily_ads:
              dailyLimit,

            daily_reset_hours:
              resetHours
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to save ad settings."
        );
        return;
      }

      setAdCooldownSeconds(
        String(
          data.settings
            ?.ad_cooldown_seconds ??
            cooldown
        )
      );

      setMaxDailyAds(
        String(
          data.settings
            ?.max_daily_ads ??
            dailyLimit
        )
      );

      setDailyResetHours(
        String(
          data.settings
            ?.daily_reset_hours ??
            resetHours
        )
      );

      setMessage(
        "Ad settings saved successfully."
      );

      await loadAdSettings();
    } catch {
      setMessage(
        "Unable to save ad settings."
      );
    } finally {
      setAdSettingsLoading(false);
    }
  }

  /* ================= REFRESH ================= */

  async function refreshDashboard() {
    setMessage("");

    await Promise.all([
      loadStats(),
      loadUsers(),
      loadAds(),
      loadBonusSettings(),
      loadAdSettings()
    ]);
  }

  /* ================= ADD AD ================= */

  async function addAd(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/admin/ads",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: form.title,
            ad_url: form.ad_url,
            image_url:
              form.image_url || null,
            reward: Number(form.reward),
            daily_limit:
              Number(form.daily_limit),
            is_active: true
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to add ad."
        );
        return;
      }

      setMessage(
        "Advertisement added successfully."
      );

      setForm({
        title: "",
        ad_url: "",
        image_url: "",
        reward: "0.01",
        daily_limit: "20"
      });

      await Promise.all([
        loadAds(),
        loadStats()
      ]);
    } catch {
      setMessage("Server error.");
    } finally {
      setLoading(false);
    }
  }

  /* ================= TOGGLE AD ================= */

  async function toggleAd(ad) {
    try {
      const res = await fetch(
        `/api/admin/ads/${ad.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            is_active: !ad.is_active
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to update ad."
        );
        return;
      }

      setMessage(
        ad.is_active
          ? "Advertisement disabled."
          : "Advertisement enabled."
      );

      await Promise.all([
        loadAds(),
        loadStats()
      ]);
    } catch {
      setMessage(
        "Unable to update advertisement."
      );
    }
  }

  /* ================= DELETE AD ================= */

  async function deleteAd(id) {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this advertisement?"
      );

    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/admin/ads/${id}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to delete ad."
        );
        return;
      }

      setMessage(
        "Advertisement deleted."
      );

      await Promise.all([
        loadAds(),
        loadStats()
      ]);
    } catch {
      setMessage(
        "Unable to delete ad."
      );
    }
  }

  /* ================= USERS ================= */

  async function toggleUser(user) {
    const nextStatus =
      !user.is_blocked;

    const confirmed =
      window.confirm(
        nextStatus
          ? "Block this user?"
          : "Unblock this user?"
      );

    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/admin/users/${user.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            is_blocked: nextStatus
          })
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(
          data.message ||
            "Unable to update user."
        );
        return;
      }

      setMessage(
        data.message ||
          "User status updated."
      );

      await Promise.all([
        loadUsers(),
        loadStats()
      ]);
    } catch {
      setMessage(
        "Unable to update user."
      );
    }
  }

  /* ================= LOGOUT ================= */

  async function logout() {
    try {
      await fetch(
        "/api/admin/logout",
        {
          method: "POST",
          credentials: "include"
        }
      );
    } catch {
      // Ignore logout error
    }

    setAuthenticated(false);
    setAds([]);
    setUsers([]);
    setStats(null);
  }

  /* ================= SEARCH ================= */

  const filteredUsers =
    users.filter((user) => {
      const search =
        userSearch
          .trim()
          .toLowerCase();

      if (!search) return true;

      const text = [
        user.telegram_id,
        user.username,
        user.first_name,
        user.last_name,
        user.referral_code
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    });

  /* ================= LOADING ================= */

  if (checking) {
    return (
      <main style={styles.center}>
        <div>
          <h2>
            Checking Admin Session...
          </h2>
        </div>
      </main>
    );
  }

  /* ================= LOGIN PAGE ================= */

  if (!authenticated) {
    return (
      <main style={styles.container}>
        <div style={styles.loginCard}>
          <h1>🔐 Admin Login</h1>

          <p style={styles.muted}>
            Advertisement Management
          </p>

          <form onSubmit={login}>
            <input
              type="email"
              placeholder="Admin Email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              required
              style={styles.input}
            />

            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
              style={styles.input}
            />

            <button
              type="submit"
              disabled={loading}
              style={styles.primaryButton}
            >
              {loading
                ? "Logging in..."
                : "Login"}
            </button>
          </form>

          {message && (
            <p style={styles.error}>
              {message}
            </p>
          )}
        </div>
      </main>
    );
  }

  /* ================= ADMIN DASHBOARD ================= */

  return (
    <main style={styles.container}>

      {/* HEADER */}

      <div style={styles.header}>
        <div>
          <h1>
            📊 Admin Dashboard
          </h1>

          <p style={styles.muted}>
            Advertisement Management
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            onClick={refreshDashboard}
            style={styles.refreshButton}
            disabled={
              statsLoading ||
              usersLoading ||
              bonusLoading ||
              adSettingsLoading
            }
          >
            {statsLoading ||
            usersLoading ||
            bonusLoading ||
            adSettingsLoading
              ? "Refreshing..."
              : "🔄 Refresh"}
          </button>

          <button
            onClick={logout}
            style={styles.logoutButton}
          >
            Logout
          </button>
        </div>
      </div>

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      {/* STATISTICS */}

      <section style={styles.statsGrid}>

        <StatCard
          icon="👥"
          title="Total Users"
          value={
            stats
              ? stats.totalUsers
              : "..."
          }
        />

        <StatCard
          icon="🚫"
          title="Blocked Users"
          value={
            stats
              ? stats.blockedUsers
              : "..."
          }
        />

        <StatCard
          icon="📢"
          title="Active Ads"
          value={
            stats
              ? stats.activeAds
              : "..."
          }
        />

        <StatCard
          icon="👁️"
          title="Total Ad Views"
          value={
            stats
              ? stats.totalAdViews
              : "..."
          }
        />

        <StatCard
          icon="💰"
          title="Total Earnings"
          value={
            stats
              ? `$${Number(
                  stats.totalEarnings
                ).toFixed(3)}`
              : "..."
          }
        />

        <StatCard
          icon="💸"
          title="Total Withdrawals"
          value={
            stats
              ? `$${Number(
                  stats.totalWithdrawals
                ).toFixed(3)}`
              : "..."
          }
        />

      </section>

      {/* DAILY BONUS */}

      <section style={styles.card}>

        <div style={styles.listHeader}>

          <div>
            <h2>
              🎁 Daily Bonus Control
            </h2>

            <p style={styles.muted}>
              Configure the daily reward
              for users.
            </p>
          </div>

          <div
            style={
              bonusEnabled
                ? styles.statusOn
                : styles.statusOff
            }
          >
            {bonusEnabled
              ? "🟢 ENABLED"
              : "🔴 DISABLED"}
          </div>

        </div>

        <label style={styles.label}>
          Daily Bonus Amount ($)
        </label>

        <input
          type="number"
          step="0.001"
          min="0.001"
          max="100"
          value={bonusAmount}
          onChange={(e) =>
            setBonusAmount(
              e.target.value
            )
          }
          style={styles.input}
        />

        <label style={styles.switchRow}>
          <input
            type="checkbox"
            checked={bonusEnabled}
            onChange={(e) =>
              setBonusEnabled(
                e.target.checked
              )
            }
          />

          <span>
            Enable Daily Bonus
          </span>
        </label>

        <button
          onClick={saveBonusSettings}
          disabled={bonusLoading}
          style={styles.primaryButton}
        >
          {bonusLoading
            ? "Saving..."
            : "💾 Save Bonus Settings"}
        </button>

      </section>

      {/* AD SETTINGS */}

      <section style={styles.card}>

        <div style={styles.listHeader}>
          <div>
            <h2>
              ⚙️ Ad Watching Settings
            </h2>

            <p style={styles.muted}>
              Control how often users can
              watch rewarded advertisements.
            </p>
          </div>
        </div>

        <label style={styles.label}>
          ⏱️ Ad Cooldown (Seconds)
        </label>

        <input
          type="number"
          min="0"
          max="86400"
          value={adCooldownSeconds}
          onChange={(e) =>
            setAdCooldownSeconds(
              e.target.value
            )
          }
          style={styles.input}
        />

        <p style={styles.help}>
          Example: 30 = user waits 30
          seconds before starting another
          advertisement.
        </p>

        <label style={styles.label}>
          📺 Daily Ad Limit
        </label>

        <input
          type="number"
          min="1"
          max="10000"
          value={maxDailyAds}
          onChange={(e) =>
            setMaxDailyAds(
              e.target.value
            )
          }
          style={styles.input}
        />

        <p style={styles.help}>
          Maximum number of rewarded ads
          allowed during the reset period.
        </p>

        <label style={styles.label}>
          🔄 Reset After (Hours)
        </label>

        <input
          type="number"
          min="1"
          max="168"
          value={dailyResetHours}
          onChange={(e) =>
            setDailyResetHours(
              e.target.value
            )
          }
          style={styles.input}
        />

        <p style={styles.help}>
          Example: 24 = the limit resets
          after 24 hours.
        </p>

        <div style={styles.previewBox}>
          <strong>
            Current Settings
          </strong>

          <div>
            ⏱️ Cooldown:{" "}
            {adCooldownSeconds} seconds
          </div>

          <div>
            📺 Limit:{" "}
            {maxDailyAds} ads
          </div>

          <div>
            🔄 Reset:{" "}
            {dailyResetHours} hours
          </div>
        </div>

        <button
          onClick={saveAdSettings}
          disabled={adSettingsLoading}
          style={styles.primaryButton}
        >
          {adSettingsLoading
            ? "Saving..."
            : "💾 Save Ad Settings"}
        </button>

      </section>

      {/* USER MANAGEMENT */}

      <section style={styles.card}>

        <div style={styles.listHeader}>

          <div>
            <h2>
              👥 User Management
            </h2>

            <p style={styles.muted}>
              Total: {users.length} users
            </p>
          </div>

          <button
            onClick={loadUsers}
            style={styles.refreshButton}
            disabled={usersLoading}
          >
            {usersLoading
              ? "Loading..."
              : "Refresh"}
          </button>

        </div>

        <input
          type="text"
          placeholder="🔎 Search Telegram ID, username, name or referral code"
          value={userSearch}
          onChange={(e) =>
            setUserSearch(
              e.target.value
            )
          }
          style={styles.input}
        />

        {usersLoading ? (
          <p style={styles.muted}>
            Loading users...
          </p>
        ) : filteredUsers.length === 0 ? (
          <p style={styles.muted}>
            No users found.
          </p>
        ) : (
          <div style={styles.userList}>

            {filteredUsers.map((user) => (

              <div
                key={user.id}
                style={styles.userItem}
              >

                <div style={styles.userInfo}>

                  <h3>
                    {user.first_name ||
                      "Unknown User"}{" "}
                    {user.last_name || ""}
                  </h3>

                  <p>
                    🆔 Telegram ID:{" "}
                    {user.telegram_id}
                  </p>

                  <p>
                    👤 Username:{" "}
                    {user.username
                      ? `@${user.username}`
                      : "N/A"}
                  </p>

                  <p>
                    💰 Balance: $
                    {Number(
                      user.balance || 0
                    ).toFixed(3)}
                  </p>

                  <p>
                    📈 Total Earned: $
                    {Number(
                      user.total_earned || 0
                    ).toFixed(3)}
                  </p>

                  <p>
                    💸 Total Withdraw: $
                    {Number(
                      user.total_withdraw ||
                        0
                    ).toFixed(3)}
                  </p>

                  <p>
                    🎟️ Referral Code:{" "}
                    {user.referral_code ||
                      "N/A"}
                  </p>

                  <p>
                    Status:{" "}
                    <strong>
                      {user.is_blocked
                        ? "🔴 Blocked"
                        : "🟢 Active"}
                    </strong>
                  </p>

                </div>

                <div>
                  <button
                    onClick={() =>
                      toggleUser(user)
                    }
                    style={
                      user.is_blocked
                        ? styles.enableButton
                        : styles.blockButton
                    }
                  >
                    {user.is_blocked
                      ? "🟢 Unblock"
                      : "🚫 Block"}
                  </button>
                </div>

              </div>

            ))}

          </div>
        )}

      </section>

      {/* ADD ADVERTISEMENT */}

      <section style={styles.card}>

        <h2>
          ➕ Add Advertisement
        </h2>

        <form onSubmit={addAd}>

          <input
            placeholder="Advertisement Title"
            value={form.title}
            onChange={(e) =>
              setForm({
                ...form,
                title: e.target.value
              })
            }
            required
            style={styles.input}
          />

          <input
            type="url"
            placeholder="Advertisement URL"
            value={form.ad_url}
            onChange={(e) =>
              setForm({
                ...form,
                ad_url: e.target.value
              })
            }
            required
            style={styles.input}
          />

          <input
            type="url"
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) =>
              setForm({
                ...form,
                image_url: e.target.value
              })
            }
            style={styles.input}
          />

          <input
            type="number"
            step="0.001"
            min="0.001"
            placeholder="Reward"
            value={form.reward}
            onChange={(e) =>
              setForm({
                ...form,
                reward: e.target.value
              })
            }
            required
            style={styles.input}
          />

          <input
            type="number"
            min="1"
            placeholder="Daily Limit"
            value={form.daily_limit}
            onChange={(e) =>
              setForm({
                ...form,
                daily_limit:
                  e.target.value
              })
            }
            required
            style={styles.input}
          />

          <button
            type="submit"
            disabled={loading}
            style={styles.primaryButton}
          >
            {loading
              ? "Adding..."
              : "➕ Add Advertisement"}
          </button>

        </form>

      </section>

      {/* ADVERTISEMENTS */}

      <section style={styles.card}>

        <div style={styles.listHeader}>

          <h2>
            📢 Advertisements
          </h2>

          <button
            onClick={loadAds}
            style={styles.refreshButton}
          >
            Refresh
          </button>

        </div>

        {ads.length === 0 ? (

          <p style={styles.muted}>
            No advertisements found.
          </p>

        ) : (

          <div>

            {ads.map((ad) => (

              <div
                key={ad.id}
                style={styles.adItem}
              >

                <div>

                  <h3>
                    {ad.title}
                  </h3>

                  <p>
                    💰 Reward: $
                    {Number(
                      ad.reward
                    ).toFixed(3)}
                  </p>

                  <p>
                    📊 Daily limit:{" "}
                    {ad.daily_limit}
                  </p>

                  <p>
                    Status:{" "}
                    <strong>
                      {ad.is_active
                        ? "🟢 Active"
                        : "🔴 Inactive"}
                    </strong>
                  </p>

                  {ad.ad_url && (
                    <p style={styles.urlText}>
                      🔗 {ad.ad_url}
                    </p>
                  )}

                </div>

                <div style={styles.actions}>

                  <button
                    onClick={() =>
                      toggleAd(ad)
                    }
                    style={
                      styles.secondaryButton
                    }
                  >
                    {ad.is_active
                      ? "Disable"
                      : "Enable"}
                  </button>

                  <button
                    onClick={() =>
                      deleteAd(ad.id)
                    }
                    style={
                      styles.deleteButton
                    }
                  >
                    Delete
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </section>

    </main>
  );
}

/* ================= STAT CARD ================= */

function StatCard({
  icon,
  title,
  value
}) {
  return (
    <div style={styles.statCard}>

      <div style={styles.statIcon}>
        {icon}
      </div>

      <div>

        <div style={styles.statTitle}>
          {title}
        </div>

        <div style={styles.statValue}>
          {value}
        </div>

      </div>

    </div>
  );
}

/* ================= STYLES ================= */

const styles = {

  container: {
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "20px",
    fontFamily:
      "Arial, sans-serif",
    background:
      "#f8fafc",
    minHeight: "100vh"
  },

  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      "Arial, sans-serif"
  },

  loginCard: {
    maxWidth: "420px",
    margin: "80px auto",
    padding: "25px",
    borderRadius: "16px",
    background: "#fff",
    boxShadow:
      "0 4px 20px rgba(0,0,0,0.12)"
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "15px",
    marginBottom: "20px",
    flexWrap: "wrap"
  },

  headerActions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "15px",
    marginTop: "20px"
  },

  statCard: {
    padding: "18px",
    borderRadius: "16px",
    background: "#fff",
    boxShadow:
      "0 4px 18px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },

  statIcon: {
    fontSize: "30px"
  },

  statTitle: {
    fontSize: "13px",
    opacity: 0.65
  },

  statValue: {
    fontSize: "22px",
    fontWeight: "bold",
    marginTop: "5px"
  },

  card: {
    marginTop: "20px",
    padding: "20px",
    borderRadius: "16px",
    background: "#fff",
    boxShadow:
      "0 4px 20px rgba(0,0,0,0.08)"
  },

  label: {
    display: "block",
    marginTop: "15px",
    fontSize: "14px",
    fontWeight: "bold"
  },

  input: {
    width: "100%",
    padding: "13px",
    marginTop: "10px",
    marginBottom: "5px",
    border:
      "1px solid #d1d5db",
    borderRadius: "10px",
    boxSizing: "border-box",
    fontSize: "14px"
  },

  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "15px",
    fontWeight: "bold",
    cursor: "pointer"
  },

  statusOn: {
    padding: "8px 12px",
    borderRadius: "20px",
    background: "#dcfce7",
    color: "#166534",
    fontWeight: "bold",
    fontSize: "12px"
  },

  statusOff: {
    padding: "8px 12px",
    borderRadius: "20px",
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: "bold",
    fontSize: "12px"
  },

  primaryButton: {
    width: "100%",
    padding: "13px",
    marginTop: "15px",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    background: "#111827",
    color: "#fff",
    fontWeight: "bold"
  },

  logoutButton: {
    padding: "10px 15px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#fee2e2"
  },

  refreshButton: {
    padding: "9px 13px",
    border:
      "1px solid #d1d5db",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#fff"
  },

  userList: {
    marginTop: "15px"
  },

  userItem: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "15px",
    padding: "16px 0",
    borderBottom:
      "1px solid #eee",
    flexWrap: "wrap"
  },

  userInfo: {
    flex: 1,
    minWidth: "260px"
  },

  blockButton: {
    padding: "10px 14px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#fee2e2"
  },

  enableButton: {
    padding: "10px 14px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#dcfce7"
  },

  secondaryButton: {
    padding: "9px 12px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#e5e7eb"
  },

  deleteButton: {
    padding: "9px 12px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    background: "#fee2e2"
  },

  listHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap"
  },

  adItem: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "15px",
    padding: "15px 0",
    borderBottom:
      "1px solid #eee",
    flexWrap: "wrap"
  },

  actions: {
    display: "flex",
    gap: "8px",
    alignItems: "center"
  },

  message: {
    padding: "12px",
    marginTop: "15px",
    borderRadius: "10px",
    background: "#e0f2fe"
  },

  error: {
    marginTop: "15px",
    color: "#b91c1c"
  },

  muted: {
    opacity: 0.65
  },

  help: {
    fontSize: "12px",
    opacity: 0.6,
    marginTop: "5px"
  },

  previewBox: {
    marginTop: "18px",
    padding: "15px",
    borderRadius: "12px",
    background: "#f3f4f6",
    lineHeight: "1.9"
  },

  urlText: {
    fontSize: "12px",
    opacity: 0.65,
    wordBreak: "break-all"
  }
};
